---
id: Ticket 06
title: Build CSV Importer CLI and Commit Production Config Artifacts
status: in-progress
priority: p2
area: infra
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: ["[[Ticket 02 Build Database Schema Migrations and Money Library]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/infra]
---

## Goal

Deliver a validated CSV importer CLI that can load the legacy `cashflow_export.csv` idempotently (with a `--dry-run` mode), and commit all production config artifacts to `ops/` so Phase 1 deploy is execution-only — not discovery.

## Context

Phase 0.7 + 0.8 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. These two work items are grouped because they share no dependency on auth or the UI — only the DB schema from Ticket 02 — and can ship together as infrastructure finishing work.

**CSV importer:** `db backups/cashflow_export.csv` (~1k rows, ~14KB) is the legacy data. Columns: `id,item,amount,currency,date,time,timezone,category,notes,created_at,updated_at`. The importer is built and validated locally in MVP but the production data load happens in Phase 1 after cloud deploy. The `--dry-run` flag must be exercised before any live run.

**Known normalization challenges in the CSV:**
- Category names contain leading emoji: `🛌 Airbnb`, `🐾 Pet Food` — strip these
- Time formats are mixed: `14:06` (24h), `7:11PM`, `05:15pm`, `7:40AM` (case-insensitive 12h) — all must parse
- Amount is a float in the CSV — must convert to `amount_minor = Math.round(amount * 100)` (signed INTEGER, never float)

**Production config:** `ops/` files are config templates only. **No Cloudflare account, no Hetzner server, no running tunnel is needed for this ticket.** Files are committed so Phase 1 has nothing to figure out. Local validation (e.g. `caddy validate`) is the exit criterion — not a live deployment. Cloud provisioning and Hetzner setup are Phase 1 work, defined in [[plan/blueprints/26060503-multi-tenant-server-layout]].

Engineer must load `.claude/skills/hud-csv-import/SKILL.md` and `.claude/skills/hud-db/SKILL.md` before implementing.

## Acceptance Criteria

### CSV Importer

- [ ] `pnpm import:cashflow --dry-run --file "db backups/cashflow_export.csv" --user-email admin@hud.local` runs without crashing and reports: total row count, list of normalized category names, count of skipped/failed rows (target: zero failures)
- [ ] Zero emoji surviving category normalization: `🛌 Airbnb` → `Airbnb`; `🐾 Pet Food` → `Pet Food`; any other leading emoji cluster stripped via Unicode regex (`/^\p{Emoji}+\s*/u`)
- [ ] All 4 time formats in the CSV parse correctly to ISO-8601 with the row's timezone offset: `14:06` (24h no-seconds), `7:11PM`, `05:15pm`, `7:40AM` (12h case-insensitive)
- [ ] `amount` (float column in CSV) → `amount_minor = Math.round(amount * 100)` (signed INTEGER); no float value is stored in the DB
- [ ] CSV `id` column → `transactions.external_id` (stored as string); `source='csv-import'`
- [ ] Upsert strategy: `ON CONFLICT (user_id, external_id) DO NOTHING` — running the importer twice on the same CSV produces zero duplicate rows
- [ ] Live run (without `--dry-run`) on `cashflow_export.csv` inserts all rows; re-running immediately is a no-op (row count unchanged)
- [ ] `audit_log` row written per inserted transaction: `actor='system'`, `action='create'`, `entity='transaction'`, `entity_id=<tx id>`
- [ ] Importer exits with a non-zero code and a clear error message if `--user-email` is not found in the DB
- [ ] Importer prints a summary at the end: `Inserted: N, Skipped (duplicate): N, Failed: N`

### Production Config Artifacts (committed, not deployed)

- [ ] `ops/caddy/Caddyfile` exists and `caddy validate ops/caddy/Caddyfile` exits 0 locally (install Caddy via `brew install caddy` if absent); file reverse-proxies `hud.kevinaton.com` → `localhost:3000` per the reference doc
- [ ] `ops/cloudflared/config.yml` exists with correct structure; tunnel ID is the literal placeholder `<TUNNEL_ID>` — no real Cloudflare account or tunnel creation is needed
- [ ] `ops/systemd/hud-web.service` exists matching the blueprint spec: `ExecStart=/usr/bin/node apps/web/.next/standalone/server.js`, `EnvironmentFile=/var/lib/hud/.env`, `User=hud`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/hud`
- [ ] `ops/litestream/litestream.yml` exists; replicates `/var/lib/hud/hud.db` to an R2 bucket (bucket name is the literal placeholder `<R2_BUCKET>`) every 1 second
- [ ] `ops/sops/.sops.yaml` exists with age key path config (`~/.config/sops/age/keys.txt` as default)
- [ ] `.env.example` is complete — every env var the app reads is listed with a descriptive comment; no real secrets
- [ ] `README.md` has a **Runbook** section covering: prerequisites, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, how to run the CSV importer, and a pointer to `ops/` for Phase 1 deploy

## Sub-tasks

- [ ] Write `scripts/import-cashflow.ts` — CLI entry point; parse `--dry-run`, `--file`, `--user-email` args
- [ ] Implement emoji-strip function using `\p{Emoji}` Unicode property regex
- [ ] Implement 12h/24h time-format parser (handles `HH:MM`, `H:MM[AM|PM]`, `HH:MM[AM|PM]`, case-insensitive)
- [ ] Implement `occurred_at` assembler: combine `date`, `time`, `timezone` columns into ISO-8601 string with offset
- [ ] Implement float-to-minor-units conversion: `Math.round(parseFloat(amount) * 100)` — result is a signed integer
- [ ] Implement upsert via Drizzle `onConflictDoNothing` on `(user_id, external_id)` unique index
- [ ] Implement `--dry-run` mode: parse + normalize every row, print report, make zero DB writes
- [ ] Implement batch processing (insert in chunks of 100 to avoid SQLite statement limits)
- [ ] Write audit_log entry per inserted row (`actor='system'`)
- [ ] Run importer in dry-run mode against `db backups/cashflow_export.csv`; fix any parse failures until zero failures reported
- [ ] Run importer in live mode; verify idempotency by running twice
- [ ] Add `pnpm import:cashflow` script to root `package.json`
- [ ] Write `ops/caddy/Caddyfile` — based on `plan/reference/caddy.md`
- [ ] Write `ops/cloudflared/config.yml` — tunnel template with `<TUNNEL_ID>` placeholder
- [ ] Write `ops/systemd/hud-web.service` — per blueprint spec
- [ ] Write `ops/litestream/litestream.yml` — per blueprint spec, `<R2_BUCKET>` placeholder
- [ ] Write `ops/sops/.sops.yaml` — age key path config
- [ ] Update `.env.example` with all required vars and comments
- [ ] Write `README.md` Runbook section
- [ ] Run `caddy validate ops/caddy/Caddyfile` locally and confirm exit 0

## Open Questions

## Notes
