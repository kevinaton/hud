# HUD Deploy Runbook

Audience: Kevin (operator), SSH'd into the Hetzner server as a sudoer.
This runbook covers a first-time deploy. For re-deploys after a code change,
jump to Step 6.

---

## Prerequisites

- Hetzner server is up, reachable over SSH.
- You have the repo URL (e.g. `git@github.com:kevinaton/hud.git`).
- You have: `NEXTAUTH_SECRET` (generate with `openssl rand -hex 32`),
  `NEXTAUTH_URL`, Cloudflare Tunnel credentials JSON, and R2 credentials.

---

## Step 1 — Run the provision script

SSH to the server and run the provision script from the repo checkout
(or copy it up first):

```bash
sudo bash ops/provision/hud-provision.sh
```

Expected output: every line prints `[CREATED]` on first run,
`[SKIPPED]` on subsequent runs. The script is fully idempotent.

Verify Node 22 and pnpm are present:

```bash
node --version    # must print v22.x.x
pnpm --version    # must print a pnpm version string
```

---

## Step 2 — Place secrets: `/srv/hud/secrets/.env`

Create the env file as the `hud` user or root, then lock it down:

```bash
sudo install -o hud -g hud -m 600 /dev/null /srv/hud/secrets/.env
sudo nano /srv/hud/secrets/.env
```

Required variables:

```dotenv
# Database
DATABASE_URL=/srv/hud/data/hud.db

# Next.js auth (generate secret: openssl rand -hex 32)
NEXTAUTH_SECRET=<random-64-hex-chars>
NEXTAUTH_URL=https://hud.kevinaton.com

# Litestream → Cloudflare R2 (see Step 4)
LITESTREAM_ACCESS_KEY_ID=<r2-access-key-id>
LITESTREAM_SECRET_ACCESS_KEY=<r2-secret-access-key>
LITESTREAM_BUCKET=<r2-bucket-name>

# Sentry (optional — omit to disable error reporting)
# SENTRY_DSN=https://...@sentry.io/...
```

Verify permissions:

```bash
sudo stat /srv/hud/secrets/.env
# Must show: Mode: 0600, Uid: 2001 (hud), Gid: 2001 (hud)
```

---

## Step 3 — Place Cloudflare Tunnel credentials

Create the tunnel in the Cloudflare dashboard or with the CLI:

```bash
cloudflared tunnel create hud-tunnel
# Outputs: Created tunnel hud-tunnel with id <TUNNEL_ID>
```

The credentials JSON is written to `~/.cloudflared/<TUNNEL_ID>.json`.
Copy it to the secrets directory:

```bash
sudo mkdir -p /srv/hud/secrets/.cloudflared
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json
sudo chown -R hud:hud /srv/hud/secrets/.cloudflared
sudo chmod 700 /srv/hud/secrets/.cloudflared
sudo chmod 600 /srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json
```

Update `ops/cloudflared/config.yml` in the repo with the actual `TUNNEL_ID`
(replace both `<TUNNEL_ID>` placeholders), then commit and push before
proceeding to Step 6.

Verify the config validates:

```bash
cloudflared tunnel ingress validate --config /srv/hud/app/ops/cloudflared/config.yml
# Must print: Configuration file ... is valid
```

---

## Step 4 — Configure Litestream R2 credentials

The Litestream config at `ops/litestream/litestream.yml` reads R2 credentials
from environment variables. They are already included in the `.env` file you
wrote in Step 2:

```
LITESTREAM_ACCESS_KEY_ID
LITESTREAM_SECRET_ACCESS_KEY
LITESTREAM_BUCKET
```

Also update the `endpoint` in `ops/litestream/litestream.yml` with your
Cloudflare account ID (replace `<account-id>`), then commit and push.

Verify the bucket is reachable after services start (Step 8).

---

## Step 5 — Clone the repo

```bash
sudo git clone git@github.com:kevinaton/hud.git /srv/hud/app
sudo chown -R hud:hud /srv/hud/app
```

If the directory already exists (re-deploy):

```bash
cd /srv/hud/app
sudo -u hud git pull --ff-only
```

---

## Step 6 — Build the application

Run as root (or sudo) from the repo root. The build output goes to
`apps/web/.next/standalone/` which is what `hud-web.service` executes.

```bash
cd /srv/hud/app
sudo -u hud pnpm install --frozen-lockfile
sudo -u hud pnpm build
sudo -u hud pnpm --filter @hud/mcp-hud build
```

Expected output: `pnpm build` finishes with `Route (app)` table and
`Next.js` build summary. No TypeScript errors.

### ⚠️ REQUIRED: copy static assets into the standalone output

`next build` with `output: 'standalone'` does **not** copy `.next/static/`
or `public/` into `.next/standalone/apps/web/` — Next.js explicitly
documents this as a manual deploy step
(https://nextjs.org/docs/app/api-reference/config/next-config-js/output#caveats).
`hud-web.service` runs `server.js` from inside `.next/standalone/apps/web/`
with that directory as its `cwd`, so without this copy **every**
`/_next/static/*` and `public/` request (favicons, fonts, all JS/CSS
chunks) 404s with a `text/plain` body — which the browser then refuses
to execute as a script (`ChunkLoadError` / MIME-type rejection on the
login page and everywhere else). `cleanDistDir: true` wipes and
regenerates `.next/` on every build, so this copy must run **every time**,
not just on first deploy.

```bash
sudo -u hud cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
sudo -u hud cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/
```

Verify before restarting (replace the hash with whatever `pnpm build`
just generated for the login page — check
`apps/web/.next/static/chunks/app/(auth)/login/`):

```bash
ls apps/web/.next/standalone/apps/web/.next/static/chunks/app/'(auth)'/login/
ls apps/web/.next/standalone/apps/web/public/
```

For re-deploys, restart the service after the build **and** the copy:

```bash
sudo systemctl restart hud-web
```

Then confirm a real asset loads (replace the hash as above):

```bash
curl -I http://localhost:3000/favicon.ico
curl -I "http://localhost:3000/_next/static/chunks/app/(auth)/login/page-<hash>.js"
# Both must return 200 with the correct Content-Type — NOT 404 / text/plain
```

---

## Step 7 — Run database migrations

```bash
cd /srv/hud/app/apps/web
sudo -u hud pnpm db:migrate
```

Expected output: Drizzle Kit prints each migration file applied, or
"No migrations to run" if the schema is current.

The database file is created at `/srv/hud/data/hud.db` on first migration.

---

## Step 8 — Enable and start services

```bash
sudo systemctl enable --now hud-web litestream cloudflared
```

Check that all three started cleanly:

```bash
sudo systemctl status hud-web
sudo systemctl status litestream
sudo systemctl status cloudflared
```

Each must show `Active: active (running)`. If any unit failed, check
`journalctl -u <unit> -n 50` for the error.

---

## Verify Everything Is Live

### App responds

```bash
curl -I https://hud.kevinaton.com
# Expect: HTTP/2 200 (or 302 to login if not authenticated)
```

From the server itself (bypasses Cloudflare):

```bash
curl -I http://localhost:3000
# Expect: HTTP/1.1 200 or 302
```

### Service health

```bash
sudo systemctl status hud-web litestream cloudflared
# All three: Active: active (running)
```

Follow live logs:

```bash
sudo journalctl -u hud-web -f
# Should print Next.js request logs as you hit the site
```

### Litestream replication

```bash
sudo journalctl -u litestream -n 30
# Should show: snapshot uploaded, WAL segments replicated
```

If R2 credentials are wrong you'll see `AccessDenied` errors here.
Fix `.env`, then `sudo systemctl restart litestream`.

### Cloudflare Tunnel

```bash
sudo journalctl -u cloudflared -n 30
# Should show: Registered tunnel connection ...
```

If the tunnel fails, confirm the credentials JSON path in `config.yml`
matches the actual file at `/srv/hud/secrets/.cloudflared/<TUNNEL_ID>.json`.

---

## Re-deploy Checklist (code change only)

1. Pull latest: `cd /srv/hud/app && sudo -u hud git pull --ff-only`
2. Install any new deps: `sudo -u hud pnpm install --frozen-lockfile`
3. Build: `sudo -u hud pnpm build && sudo -u hud pnpm --filter @hud/mcp-hud build`
4. **Copy static assets into the standalone output (REQUIRED — `cleanDistDir`
   wipes these every build; skipping this step 404s every `_next/static/*`
   and `public/` request and breaks every page with a `ChunkLoadError`):**
   ```bash
   sudo -u hud cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
   sudo -u hud cp -r apps/web/public/. apps/web/.next/standalone/apps/web/public/
   ```
5. Migrate (if schema changed): `cd apps/web && sudo -u hud pnpm db:migrate`
6. Restart: `sudo systemctl restart hud-web`
7. Verify:
   - `sudo systemctl status hud-web` and `curl -I https://hud.kevinaton.com`
   - **Also verify static assets serve** (the most common regression —
     see Step 6's "REQUIRED: copy static assets" note for the full
     rationale): `curl -I http://localhost:3000/favicon.ico` must be
     `200`, not `404`. Load `/login` in an incognito browser tab and
     confirm zero console errors (no 404s under `_next/static/`, no
     `ChunkLoadError`).
