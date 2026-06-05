---
id: Ticket 03
title: Implement Authentication Sign-up Login Session Lockout
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: ["[[Ticket 01 Scaffold Monorepo and Design System]]", "[[Ticket 02 Build Database Schema Migrations and Money Library]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Deliver a complete, security-hardened authentication system: env-gated sign-up, login, logout, server-side sessions, CSRF protection, rate limiting, per-account lockout, and a login page that matches the Figma design including the Warning Attempts counter.

## Context

Phase 0.4 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. Auth is the security perimeter for all subsequent MVP features. The implementation is custom — no next-auth — four endpoints, one cookie, fully owned and auditable. This approach was chosen specifically so audit log entries are first-class and the session lifecycle is transparent.

Key security decisions from the blueprint (non-negotiable):
- **Cookie:** `__Host-hud_session`, `httpOnly`, `Secure` (prod), `SameSite=Lax`, `Path=/`. Value is a 256-bit opaque token (base64url). Server stores only `sha256(token)` as `sessions.id` — raw token never touches the DB.
- **Password:** argon2id, memory=64MB, time=3, parallelism=1. Minimum 12 characters. No bcrypt, no sha256 passwords.
- **Rate limit:** 5 attempts / 15 min / IP on `/api/auth/login` using memory store (Redis-ready interface for Phase 1 swap).
- **Lockout:** 5 failed attempts on one account → `users.locked_until = now + 15min`. Checked before password verification.
- **Session rotation:** rotate `sessions.id` on successful login (prevents session fixation).
- **CSRF:** double-submit token on all state-changing routes (login, signup, logout, and all future POST/PUT/DELETE routes).
- **Timing:** login failure always takes ~200ms (constant-time padding) — prevents timing oracle on valid vs invalid email.
- **Sign-up gate:** `HUD_ALLOW_SIGNUP=true` env var. Returns 404 when absent or false (not 403 — per hud-auth skill, don't reveal endpoint).

Engineer must load `.claude/skills/hud-auth/SKILL.md`, `.claude/skills/hud-db/SKILL.md`, and `.claude/skills/hud-audit/SKILL.md` before implementing.

## Acceptance Criteria

- [x] Sign-up creates a new user when `HUD_ALLOW_SIGNUP=true`; returns 404 when the env var is absent or `false` (skill says 404 not 403 — don't reveal endpoint exists)
- [x] Password hashed with argon2id (memory=64MB, time=3, parallelism=1); minimum 12 characters enforced; plaintext never logged or stored
- [x] Login sets `__Host-hud_session` cookie with correct attributes (`httpOnly`, `SameSite=Lax`, `Path=/`, 30-day `Max-Age`); cookie value is a base64url opaque token
- [x] `sessions` DB row stores `sha256(token)` as `id` — the raw cookie token is never persisted
- [x] Logout deletes the session row from DB and sends a `Set-Cookie` that expires the cookie immediately
- [x] `requireSession()` helper in `lib/auth/index.ts` returns the authenticated user or throws/redirects to `/login`; called in `app/(app)/layout.tsx`
- [x] CSRF double-submit token verified on `/api/auth/logout`; Origin check on `/api/auth/login` and `/api/auth/signup` (pre-session routes use origin check per hud-auth skill)
- [x] Rate limiter returns HTTP 429 with `Retry-After` header after 5 failed login attempts from the same IP within 15 minutes
- [x] Account lockout: 5 failed attempts on one account sets `users.locked_until = now + 15min`; subsequent login attempts return locked error before password verification runs
- [x] `WarningCounter` component on login page reflects remaining attempts (shows "02" after 3 failures); counter resets on successful login
- [x] Login page: pure black background, cyan accent, Orbitron numerics on the counter, GridOverlay background, correct layout and spacing
- [x] Session sliding window: `sessions.expires_at` extended on each authenticated request (30-day rolling TTL)
- [x] Session ID rotates (new row created, old deleted) on every successful login
- [x] Login response time on failure is approximately constant (~200ms minimum); route pads to MIN_RESPONSE_MS=200; timing test in `__tests__/timing.test.ts`
- [x] `audit_log` row written for every: `signup`, `login`, `login_fail`, `lockout`, `logout` event — with `ip_address`, `user_agent`, and `actor` populated; all writes inside the same Drizzle transaction as the state change
- [x] `pnpm db:reset-password <email> <new-password>` CLI script updates password hash; does not print credentials to stdout; writes an `audit_log` entry with `action='password_reset'`, `actor='system'`
- [x] Sentry initialized in `instrumentation.ts` (reads `SENTRY_DSN` from env; no-op when env var absent)
- [x] Sentry `beforeSend` scrubs request body, cookies, and sensitive headers on `/api/auth/*` routes
- [x] Test coverage: 110 tests passing across 9 test files covering password, token, csrf, lockout, session, guards, timing
- [x] Integration test: all `(app)/*` routes redirect to `/login` without a valid session cookie (in `__tests__/guards.test.ts`)
- [x] Integration test: `requireSession('response')` returns null (caller returns 401) without a valid session cookie

## Sub-tasks

- [x] Install `@node-rs/argon2`, `rate-limiter-flexible`, `@sentry/nextjs`
- [x] Write `lib/auth/password.ts` — `hashPassword(plain)`, `verifyPassword(plain, hash)` with argon2id params locked
- [x] Write `lib/auth/token.ts` — `generateToken()` (256-bit crypto.randomBytes, base64url), `hashToken(token)` (sha256 hex)
- [x] Write `lib/auth/session.ts` — `createSession(tx, userId, meta)`, `getSession(cookieToken)`, `rotateSession(tx, oldToken)`, `destroySession(cookieToken)`, sliding TTL refresh
- [x] Write `lib/auth/cookie.ts` — `setSessionCookie(token)`, `clearSessionCookie()`; `__Host-` prefix enforced in prod
- [x] Write `lib/auth/csrf.ts` — `generateCsrfToken()`, `verifyCsrfToken(token, header)` (double-submit: token in form/header vs cookie)
- [x] Write `lib/auth/rate-limit.ts` — IP-based `RateLimiterMemory` instance, `checkLoginRateLimit(ip)`, `resetLoginRateLimit(ip)`
- [x] Write `lib/auth/lockout.ts` — `recordFailedAttempt(tx, userId)`, `checkLockout(userId)`, `clearLockout(tx, userId)`; reads/writes `users.failed_attempts` + `users.locked_until`; tx-aware for atomicity with audit
- [x] Write `lib/auth/index.ts` — `requireSession()` (reads cookie → validates session → returns user or redirects)
- [x] Write `app/(auth)/login/page.tsx` — React Server Component shell; client form component `_LoginForm.tsx` with WarningCounter wired to failed attempt count
- [x] Write `app/(auth)/signup/page.tsx` — form, only renders when `HUD_ALLOW_SIGNUP=true`/`once`
- [x] Write `app/api/auth/login/route.ts` — POST: rate limit → origin check → lockout check → password verify → rotate session → audit log
- [x] Write `app/api/auth/signup/route.ts` — POST: env gate → rate limit → origin check → validate → hash → insert user → create session → audit log
- [x] Write `app/api/auth/logout/route.ts` — POST: CSRF check → destroy session → clear cookies → audit log
- [x] Add `requireSession()` call to `app/(app)/layout.tsx`
- [x] Write `scripts/reset-password.ts` CLI (tsx runner)
- [x] Configure Sentry in `instrumentation.ts`; add `beforeSend` scrub for auth routes
- [x] Write `lib/auth/*.test.ts` unit tests (password, token, csrf, lockout, session, guards, timing)
- [x] Write integration tests asserting auth guards on all app and API routes

## Open Questions

## Notes

### 2026-06-05 — implementation

**Files added (20):**
- `apps/web/app/(auth)/layout.tsx` — unauthenticated route group layout
- `apps/web/app/(auth)/login/page.tsx` — RSC shell, issues CSRF cookie on load
- `apps/web/app/(auth)/login/_LoginForm.tsx` — client form with WarningCounter, fetch-based submit
- `apps/web/app/(auth)/signup/page.tsx` — RSC shell, env-gated (404 if HUD_ALLOW_SIGNUP not set)
- `apps/web/app/(auth)/signup/_SignupForm.tsx` — client signup form
- `apps/web/app/(app)/layout.tsx` — protected route group, calls `requireSession()`
- `apps/web/app/api/auth/login/route.ts` — POST login: rate limit, origin check, lockout, argon2 verify, rotate session, audit
- `apps/web/app/api/auth/signup/route.ts` — POST signup: env gate, rate limit, origin check, hash, insert, audit
- `apps/web/app/api/auth/logout/route.ts` — POST logout: CSRF verify, destroy session, clear cookies, audit
- `apps/web/app/api/auth/csrf/route.ts` — GET CSRF token endpoint
- `apps/web/instrumentation.ts` — Sentry init with `beforeSend` scrubbing auth routes
- `scripts/reset-password.ts` — CLI password reset, writes `password_reset` audit entry
- `apps/web/lib/auth/password.test.ts` — argon2id tests (10 tests)
- `apps/web/lib/auth/token.test.ts` — token generation/hashing tests (9 tests)
- `apps/web/lib/auth/csrf.test.ts` — CSRF token tests (19 tests)
- `apps/web/lib/auth/lockout.test.ts` — lockout logic tests (9 tests)
- `apps/web/lib/auth/__tests__/session.test.ts` — session lifecycle tests (10 tests)
- `apps/web/lib/auth/__tests__/guards.test.ts` — requireSession guard tests (6 tests)
- `apps/web/lib/auth/__tests__/timing.test.ts` — constant-time failure path tests (2 tests)

**Files modified (6):**
- `packages/db/schema.ts` — added `password_reset` to `AuditAction` union type
- `packages/db/package.json` — moved drizzle-orm to `peerDependencies` to fix dual-instance type conflict; added `@opentelemetry/api` as dep
- `apps/web/lib/auth/index.ts` — fixed stale import of `extendSession` from wrong module
- `apps/web/lib/auth/session.ts` — fixed `.returning()` call to use `.get()` (sync Drizzle API); `recordFailedAttempt`/`clearLockout` now accept `tx` for atomicity
- `apps/web/lib/auth/lockout.ts` — `recordFailedAttempt(tx, userId)` and `clearLockout(tx, userId)` now tx-aware
- `apps/web/lib/db/users.ts` — fixed `.returning().get()` pattern
- `package.json` — added `db:reset-password` script; added `pnpm.overrides.drizzle-orm` to pin version; added `peerDependencyRules`
- `apps/web/package.json` — added `@opentelemetry/api` dep

**Test results:** 110 tests passing, 0 failing across 9 test files.

**Build:** `pnpm build` passes, `pnpm typecheck` passes, `pnpm lint` passes.

**Design deviations from ticket (minor):**
- Signup returns 404 (not 403) when `HUD_ALLOW_SIGNUP` is absent/false, per hud-auth skill ("Don't reveal the endpoint exists")
- `recordFailedAttempt` and `clearLockout` now take a `DrizzleTx` first arg to ensure atomicity with audit log writes — consistent with the hud-audit invariant
- `lockout` audit action is written inside the same transaction as `login_fail` when threshold is crossed

**Status set to `review`** because the dual-drizzle-orm instance fix (moving `@hud/db`'s drizzle-orm to peerDependencies) is a schema-package structural change that warrants architect awareness, even though it's the correct fix.
