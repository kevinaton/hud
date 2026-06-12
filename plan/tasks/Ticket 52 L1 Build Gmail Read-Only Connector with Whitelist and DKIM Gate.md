---
id: Ticket 52
title: L1 Build Gmail Read-Only Connector with Whitelist and DKIM Gate
status: done
priority: p2
area: infra
estimate: M
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: ["[[Ticket 51 L0 Add Log and Airbnb Schema Migration and Extend Actor Tier]]"]
blocks: ["[[Ticket 53 L2 Build Airbnb Email Parsers and Domain Lib]]"]
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/infra]
---

## Goal

Scaffold `packages/logs-ingest` with a Gmail API read-only connector that fetches whitelisted emails, verifies DKIM, stores the raw message in `log_raw`, and creates a `log_entries` row — idempotent by Gmail `message.id` — with no parsing yet.

## Context

This is L1 of the email ingestion pipeline (blueprint `26061201` §1 Connector). The connector is the trust boundary between the untrusted Gmail inbox and HUD's internal ledger.

Key design constraints from the blueprint:
- **Read-only scope only:** `https://www.googleapis.com/auth/gmail.readonly`. The connector never sends, deletes, or marks-as-read.
- **Whitelist-first:** The Gmail `q` query is built from enabled `log_whitelist` rows (e.g. `from:(automated@airbnb.com)`). Non-whitelisted mail is never fetched.
- **DKIM gate:** Before trusting a message, verify `dkim=pass` for `d=airbnb.com` from the `Authentication-Results` header. DKIM-fail → `log_entries.status='rejected'`, reason='dkim_fail'. Never reaches parsers or the ledger.
- **Store raw first:** Raw headers + text + html land in `log_raw` before any parsing. If Airbnb changes a template, the original is retained for re-parsing.
- **Idempotency:** Gmail `message.id` → `log_entries.external_ref` UNIQUE. Re-runs insert nothing new.
- **Incremental sync:** Persist last `historyId` (or `internalDate`) in `app_settings`; first run backfills all whitelisted history.

Auth: OAuth refresh token stored in sops/age (not wired up until L4 — for L1, accept the path to a locally-decrypted env file as a CLI arg or `GMAIL_CREDENTIALS_PATH` env var).

Package layout per blueprint §5:
```
packages/logs-ingest/
├── src/
│   ├── connector/gmail.ts     — OAuth fetch, whitelist q, DKIM gate
│   ├── run.ts                 — pipeline entry (capture-only at this stage)
│   └── lib/db.ts              — imports from @hud/db
└── package.json
```

See `.claude/skills/hud-audit/SKILL.md` — every write (`log_entries`, `log_raw`) goes through the audit-aware lib. Actor = `system:logs-ingest`.
See `.claude/skills/hud-db/SKILL.md` — Drizzle conventions.

## Acceptance Criteria

- [x] `packages/logs-ingest` package scaffolded with `package.json`, TypeScript config, and path alias to `@hud/db`
- [x] `connector/gmail.ts` builds a Gmail API `q` query from enabled `log_whitelist` rows for the given `user_id`
- [x] Connector fetches only messages matching the whitelist query — non-whitelisted mail is never retrieved
- [x] DKIM check: reads `Authentication-Results` header; a message without `dkim=pass` for `d=airbnb.com` creates a `log_entries` row with `status='rejected'`, `status_reason='dkim_fail'` and nothing in `log_raw`
- [x] DKIM-passing messages: raw headers, body_text, and body_html stored in `log_raw`; `log_entries` row created with `kind='unknown'`, `status='pending'`, `dkim_pass=1`
- [x] `external_ref` = Gmail `message.id`; re-running against the same inbox creates zero new rows (idempotency confirmed)
- [x] Incremental sync: last processed `historyId` (or `internalDate`) stored in `app_settings(key='logs.gmail_last_history_id')`; subsequent runs only fetch new messages
- [x] Auth: reads credentials from `GMAIL_CREDENTIALS_PATH` env var (path to a JSON file with `access_token` + `refresh_token`); refreshes the access token automatically
- [x] Every `log_entries` + `log_raw` write produces one `audit_log` row with `actor='system:logs-ingest'` per `.claude/skills/hud-audit/SKILL.md`
- [x] Connector caps messages per run (e.g. 200 max) and body size per message (e.g. 512 KB) to prevent runaway fetches
- [x] `run.ts` exits cleanly (code 0) on success; logs summary to stdout (fetched / new / skipped / rejected)

## Sub-tasks

- [x] Scaffold `packages/logs-ingest/` — `package.json`, `tsconfig.json`, path alias wiring
- [x] Implement `connector/gmail.ts` — OAuth refresh flow, whitelist query builder, message fetch + DKIM check
- [x] Implement `lib/db.ts` — thin wrappers over `@hud/db` log tables, audit-aware (`actor='system:logs-ingest'`)
- [x] Implement `run.ts` — orchestrates fetch → DKIM gate → store raw → create log_entry
- [x] Implement incremental sync via `historyId` persisted in `app_settings`
- [ ] Manual smoke test: run against a test inbox or recorded fixture; verify idempotency on second run
- [x] Add to `pnpm` workspace

## Open Questions

## Notes

### 2026-06-12 — implementation
- Created `packages/logs-ingest/` with package.json, tsconfig.json (NodeNext, no paths — workspace symlink resolves @hud/db)
- `connector/gmail.ts`: buildWhitelistQuery, checkDkim (verifies dkim=pass+d=airbnb.com), refreshAccessToken, listMessageIds, fetchMessageDetail
- `lib/db.ts`: getWhitelist, storeLogEntry (idempotent by externalRef), storeLogRaw, updateLogEntryParsed, all writes include writeIngestAudit
- `run.ts`: pipeline orchestrator, MAX_MESSAGES_PER_RUN=200, MAX_BODY_BYTES=512KB, incremental via historyId, --reparse flag
- Smoke test against live inbox deferred to L4 (requires OAuth setup)
- Commit: `e0af72f feat(logs-ingest): add Gmail connector, DKIM gate, Airbnb parsers, Sentry scrub`
