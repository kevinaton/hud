---
name: hud-auth
description: HUD authentication invariants — argon2id passwords, server-side opaque sessions stored as sha256, httpOnly cookies, CSRF double-submit, IP+account rate limiting, account lockout matching the Figma "Warning Attempts" counter. Load this whenever a ticket touches `apps/web/lib/auth/`, auth routes, signup/login/logout flows, session checks, or middleware.
---

# HUD Authentication Rules

## Threat model summary

App-level auth runs **in addition to** Cloudflare Access (which guards `hud.kevinaton.com` at the edge in Phase 1+). On the laptop (MVP), CF Access does not exist — app auth is the only gate. Design must work in both contexts.

- Single-user system at MVP (Kevin). Schema supports multi from day one.
- No 2FA at app level (MFA comes from CF Access). Adding TOTP is a separate ticket.
- No password reset flow at app level — CLI script only.

## Components

### Password hashing

- **Algorithm:** argon2id (NOT bcrypt, NOT pbkdf2)
- **Library:** `@node-rs/argon2`
- **Params:** `memoryCost: 65536` (64 MB), `timeCost: 3`, `parallelism: 1`, `hashLength: 32`
- **Minimum password length:** 12 characters. No other rules (NIST 800-63B aligned — no forced symbol/case rules).
- **Stored as:** the full argon2 encoded string (includes salt + params), in `users.password_hash`.

```ts
import { hash, verify } from '@node-rs/argon2';

const ARGON2_OPTS = { memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  return verify(encoded, plain);
}
```

### Session token

- **Generation:** 256-bit random via `crypto.randomBytes(32)`, base64url-encoded → opaque cookie value
- **Storage:** server stores `sha256(cookieValue)` as `sessions.id`. Never the raw token.
- **Rotation:** on successful login, **always** generate a new session ID. Never reuse an existing one (session fixation defense).
- **TTL:** 30 days, sliding. Refresh on every authenticated request (update `expires_at` to `now + 30d`).

```ts
import { randomBytes, createHash } from 'node:crypto';

export function newSessionToken(): { plain: string; hash: string } {
  const buf = randomBytes(32);
  const plain = buf.toString('base64url');
  const hash = createHash('sha256').update(plain).digest('hex');
  return { plain, hash };
}
```

### Cookie

- **Name:** `__Host-hud_session` in production, `hud_session` in dev (the `__Host-` prefix requires Secure + Path=/ + no Domain)
- **Attributes:** `httpOnly`, `Secure` (prod only), `SameSite=Lax`, `Path=/`
- **Value:** the opaque token (NOT the hash)
- **Set via:** `cookies()` API in Next.js route handlers

```ts
import { cookies } from 'next/headers';

export function setSessionCookie(token: string, maxAgeSeconds: number) {
  cookies().set({
    name: process.env.SESSION_COOKIE_NAME!,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
}
```

### CSRF

- **Strategy:** double-submit cookie token + `Origin`/`Referer` check
- **Token cookie:** `__Host-hud_csrf` (or `hud_csrf` in dev), readable JS (not `httpOnly`), regenerated per session
- **Token in form:** hidden input `<input type="hidden" name="csrf" value="..." />` on every form, OR `X-CSRF-Token` header on JSON `fetch`
- **Validate:** server compares cookie value to form/header value. Mismatch → 403.
- **Exempt:** `/api/auth/login` and `/api/auth/signup` are exempt from CSRF (no prior session). But they DO require an `Origin` header matching the expected host.
- **SameSite=Lax** already blocks cross-site POSTs from browsers, so CSRF is belt-and-suspenders. Keep both.

### Rate limit

- **Library:** `rate-limiter-flexible`, memory store at MVP (swap to Redis store at Phase 1)
- **`/api/auth/login`:** 5 attempts / 15 min / IP, sliding window
- **`/api/auth/login`:** also 5 attempts / 15 min / `email_attempted` (per-account counter — see Lockout below)
- **`/api/auth/signup`:** 3 / hour / IP (signup is env-gated anyway)
- **All other authenticated routes:** 60 / minute / userId (generous; protects against bugs/loops)
- On block: return 429 with `Retry-After` header. Do NOT write `login_fail` audit for rate-limited requests (would amplify storage during attacks).

### Account lockout

- **Trigger:** 5 consecutive failed `login` attempts on the same `email` → set `users.locked_until = now + 15min` AND `users.failed_attempts = 5`
- **On successful login:** reset `failed_attempts = 0`, `locked_until = NULL`
- **On any failed login while `locked_until > now`:** return same error as wrong-password (no oracle); do not increment counter further; do not extend lockout
- **UI signal:** the login page displays the current `failed_attempts` counter as the "Warning Attempts: 02" element from Figma. The server returns the count in the response body of `/api/auth/login` failure (not in a header, since it's UI state). After lockout: show "Locked — try again in MM:SS" instead.

## Sign-up

- **Gated by env:** `HUD_ALLOW_SIGNUP=true` is required. If false, return 404 (not 403 — don't reveal the endpoint exists).
- **One-shot mode:** if `HUD_ALLOW_SIGNUP=once` AND `users` table is non-empty, return 404. Operator can set this to lock the system after first signup.
- **Validation:** Zod schema — `email` (valid email, lowercase normalized), `password` (min 12), `display_name` (optional, 1–60 chars, no control chars)
- **No email verification at MVP.** Single-user system; not justified. Adding it later is a separate ticket.
- **After signup:** auto-login (issue session immediately). Write `signup` audit row.

## Login

```
1. Parse input (Zod): email (lowercase), password
2. Check rate limit (IP + email). If blocked → 429.
3. Look up user by email. If not found → constant-time delay (~200ms) → 401 generic error.
4. If locked_until > now → 401 generic error (no leak about lockout state).
5. Verify password with argon2.
6. If wrong:
     - increment users.failed_attempts
     - if reached threshold → set locked_until
     - write audit `login_fail` with email_attempted + reason
     - return 401 with { error, failedAttempts }
7. If correct:
     - reset failed_attempts = 0, locked_until = NULL
     - generate new session token, store hash in sessions table
     - set session cookie, set CSRF cookie
     - write audit `login`
     - return 200 with redirect target
```

**Constant-time error path:** when the user does not exist, still perform a dummy argon2.verify against a fixed hash to keep response time within the same envelope as real verification. Without this, response time is a user-existence oracle.

## Session check (`requireSession`)

Every protected route handler and every `(app)` layout starts with:

```ts
// apps/web/lib/auth/session.ts
export async function requireSession(): Promise<SessionContext> {
  const token = cookies().get(process.env.SESSION_COOKIE_NAME!)?.value;
  if (!token) throw unauthorized();
  const tokenHash = sha256(token);
  const session = getSessionByIdHash(tokenHash);   // db/sessions.ts
  if (!session) throw unauthorized();
  if (new Date(session.expiresAt) < new Date()) {
    deleteSession(tokenHash);
    throw unauthorized();
  }
  // sliding expiry
  extendSession(tokenHash, addDays(new Date(), Number(process.env.SESSION_TTL_DAYS!) || 30));
  const user = getUserById(session.userId);
  if (!user) throw unauthorized();
  return { userId: user.id, user, session };
}
```

`unauthorized()` returns a Next.js response with 401 + clears any stale cookie. Server Components use `redirect('/login')` instead.

## Logout

- Delete the `sessions` row by `tokenHash`
- Clear cookies (`session` and `csrf`)
- Write audit `logout`
- Redirect to `/login`

## Forbidden patterns

```ts
// ❌ Store password plaintext or with weak hash
users.passwordHash = sha256(password);

// ❌ Compare passwords with ===
if (storedHash === hashPassword(input)) ...

// ❌ Put raw token in DB
sessions.id = token;            // must be sha256(token)

// ❌ Skip session check on a protected route
export async function GET(req) { return Response.json(await db.select()...); }

// ❌ Use cookies()/headers() outside Next.js request scope
// (they only work inside route handlers, Server Actions, Server Components)

// ❌ Leak existence via different error strings
if (!user) return Response.json({ error: 'No such user' }, { status: 404 });
if (badPw) return Response.json({ error: 'Wrong password' }, { status: 401 });
//  Use ONE generic message for both: "Invalid credentials"

// ❌ Variable-time password comparison
if (input === storedPassword) ...     // never; always argon2.verify
```

## Required tests (at minimum)

- Signup creates user + auto-logs-in + writes audit `signup`
- Login with wrong password increments `failed_attempts`, writes `login_fail`
- 5 wrong passwords locks the account; 6th attempt is rejected without further increment
- Lockout expires after 15 min (use fake timers in Vitest)
- Session cookie is `httpOnly` + `SameSite=Lax`
- Session ID stored is `sha256(cookieValue)`, not the raw token
- Login rotates session ID even if a stale cookie is sent
- Protected route returns 401 without session
- Protected route returns 401 with expired session (and deletes the row)
- CSRF token mismatch on a state-changing route → 403
- Rate limit kicks in at the 6th attempt within window

## When this skill applies

- Anything under `apps/web/lib/auth/`
- Anything under `apps/web/app/(auth)/` or `apps/web/app/api/auth/`
- Any new protected route (must call `requireSession`)
- Any `(app)` layout change

## When to escalate

- Adding 2FA / TOTP / WebAuthn → new blueprint required
- Switching to JWT or stateless sessions → architect must approve; not a refactor PR
- Adding OAuth providers → architect must approve and threat-model first
- Disabling lockout for "convenience" → never. If you think you want this, escalate.
