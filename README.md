# HUD

Personal dashboard — finance, notes, kanban, and agent tools in one place.
Built with Next.js 15 (App Router), SQLite + Drizzle, and Tailwind v4.

## Runbook

### Prerequisites

- **Node.js 22 LTS** (`node --version` should print `v22.x.x`)
  - A `.nvmrc` is included — run `nvm use` in the repo root to switch automatically.
  - If switching from a different Node version: `nvm use 22 && rm -rf node_modules apps/web/node_modules && pnpm install`
    so that native packages (`better-sqlite3`, `@node-rs/argon2`) use prebuilt binaries for Node 22.
- **pnpm 9** (`pnpm --version` should print `9.x.x`)
  - Install: `corepack enable && corepack use pnpm@latest`
- **Git**

For production config validation only (not required for local dev):
- **Caddy** — `brew install caddy` (macOS) or see [caddyserver.com/docs/install](https://caddyserver.com/docs/install)

### Local development

1. **Clone and install**

   ```bash
   git clone <repo-url> hud
   cd hud
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   # Edit .env.local — the defaults work for local dev without changes
   ```

3. **Run database migrations**

   ```bash
   pnpm db:migrate
   ```

   This creates `data/hud.db` with the full schema.

4. **Seed the database**

   ```bash
   pnpm db:seed
   ```

   Creates one dev user (`dev@local` / `password`), 5 categories, and ~20 sample transactions.
   Safe to re-run — idempotent.

5. **Start the dev server**

   ```bash
   pnpm dev
   ```

   Open [http://localhost:3000](http://localhost:3000).
   Sign in with the seeded user or sign up (requires `HUD_ALLOW_SIGNUP=true` in `.env.local`).

### CSV importer

The importer loads legacy cashflow data from `db backups/cashflow_export.csv` into the
`transactions` table for the specified user. Always run with `--dry-run` first.

**Dry-run (validate only, zero DB writes):**

```bash
pnpm import:cashflow -- \
  --file "db backups/cashflow_export.csv" \
  --user-email admin@hud.local \
  --dry-run
```

Prints: total row count, normalized category names, parse failure count (target: 0).

**Live run (insert rows):**

```bash
pnpm import:cashflow -- \
  --file "db backups/cashflow_export.csv" \
  --user-email admin@hud.local
```

The importer is idempotent — re-running on the same CSV produces zero duplicate rows
(skips via `ON CONFLICT DO NOTHING` on the `(user_id, external_id)` unique index).

**Exit codes:**
- `0` — success (or successful dry-run)
- `1` — missing args or user not found
- `2` — one or more rows failed normalization
- `3` — database error

### Other commands

```bash
pnpm typecheck        # TypeScript type check
pnpm lint             # Biome lint
pnpm format           # Biome format (writes)
pnpm test:run         # Vitest (single run)
pnpm db:studio        # Drizzle Studio (DB browser at localhost:4983)
pnpm db:generate      # Regenerate migrations after schema changes
```

## Production

> **Never run `pnpm dev` on the server.** Production always runs `pnpm build && pnpm start`
> (or the standalone bundle via `ops/systemd/hud-web.service`). Running `next dev` on Hetzner
> is 5–15× slower than `next start` due to the Webpack/Turbopack compiler overhead and will
> exhaust available RAM. Any server-side smoke test must use `pnpm start`.

## Production config (Phase 1)

All production config is committed under `ops/` but **not deployed at MVP**.
Phase 1 deploy provisions a Hetzner VPS and applies these files.

| File | Purpose |
|---|---|
| `ops/caddy/Caddyfile` | Caddy reverse proxy config (`hud.kevinaton.com` → `localhost:3000`) |
| `ops/cloudflared/config.yml` | Cloudflare Tunnel ingress rules |
| `ops/systemd/hud-web.service` | systemd unit for the Next.js process |
| `ops/litestream/litestream.yml` | Litestream continuous replication to Cloudflare R2 |
| `ops/sops/.sops.yaml` | sops + age key configuration for encrypted secrets |

**Validate Caddy config locally (after `brew install caddy`):**

```bash
caddy validate --config ops/caddy/Caddyfile
```

See `plan/blueprints/26060503-multi-tenant-server-layout.md` for the full Phase 1 deploy plan.

## Architecture

```
apps/web/               Next.js 15 App Router (single process)
packages/db/            Drizzle schema, migrations, seed
scripts/                CLI tools (import-cashflow, reset-password)
ops/                    Production config (Caddy, cloudflared, systemd, Litestream, sops)
plan/                   Obsidian vault (architecture, blueprints, tickets)
data/                   Local SQLite DB (gitignored)
db backups/             Legacy CSV data
```

## License

Private — all rights reserved.
