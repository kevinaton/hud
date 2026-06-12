---
id: Ticket 55
title: L4 Schedule Ingest Timer Wire Secrets and Add Observability
status: review
priority: p2
area: infra
estimate: S
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: ["[[Ticket 54 L3 Build Logs Tab with Approval Workflow and Settings Panel]]"]
blocks: []
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/infra]
---

## Goal

Wire the ingest pipeline to production: systemd service + 15-minute timer, Gmail OAuth refresh token in sops/age, last-successful-run heartbeat visible in Uptime Kuma, Sentry PII scrub test, and an ingestion runbook in `plan/reference/`.

## Context

This is L4 of the pipeline (blueprint `26061201` §5 Code Layout, §6 Scheduling). L0–L3 prove the pipeline works; L4 makes it run autonomously and observably on the Hetzner server.

Key constraints from the blueprint:
- Timer runs every 15 minutes (boring, observable — Gmail Pub/Sub push is deferred per Alternatives D).
- Service runs as `agent-hud` user in `hud.slice` with `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=/srv/hud/data`.
- Gmail OAuth refresh token stored via sops/age workflow (`plan/reference/secrets.md`) — decrypted to `/srv/hud/secrets/logs-gmail.env` (mode 600, owner `agent-hud`). Never in git.
- Heartbeat: after each successful run, write the current timestamp to `app_settings(key='logs.last_successful_ingest')`. Uptime Kuma's "push" monitor type should alert if the timestamp is stale by >1 hour.
- Sentry: `beforeSend` hook must scrub `parsed_json`, `body_text`, `body_html` fields from any Sentry event — confirm with a unit test that the scrub fires for these keys.
- Runbook: `plan/reference/logs-ingest-runbook.md` covering: initial OAuth consent (laptop flow), token rotation, timer start/stop, re-parse mode, and common failure scenarios.

See `.claude/skills/obsidian-vault/SKILL.md` for the runbook file naming and format in `plan/reference/`.

## Acceptance Criteria

- [x] `ops/systemd/hud-logs-ingest.service` created — `User=agent-hud`, `Slice=hud.slice`, `NoNewPrivileges=true`, `ProtectSystem=strict`, `ReadWritePaths=/srv/hud/data`, reads `EnvironmentFile=/srv/hud/secrets/logs-gmail.env`
- [x] `ops/systemd/hud-logs-ingest.timer` created — `OnCalendar=*:0/15` (every 15 minutes), `Persistent=true`
- [ ] Provision script updated to install and enable the service + timer on the Hetzner server
- [ ] Gmail OAuth refresh token encrypted with sops/age and stored at the path documented in `plan/reference/secrets.md`; decryption target is `/srv/hud/secrets/logs-gmail.env` mode 600 owner `agent-hud`
- [x] After each successful ingest run, `app_settings(key='logs.last_successful_ingest')` is updated with an ISO-8601 timestamp
- [ ] Uptime Kuma push monitor configured for the heartbeat — alert threshold >1 hour stale
- [x] Sentry `beforeSend` scrubs `parsed_json`, `body_text`, `body_html` from all events; confirmed by a unit test
- [ ] Timer runs on the server: `systemctl status hud-logs-ingest.timer` is active; new whitelisted emails appear within one timer interval
- [x] `plan/reference/logs-ingest-runbook.md` written covering: initial OAuth consent flow, token rotation, timer start/stop, `--reparse` mode, common failure modes (`journalctl -u hud-logs-ingest`, stale heartbeat, DKIM-fail spike)
- [x] No secrets committed to git

## Sub-tasks

- [x] Write `ops/systemd/hud-logs-ingest.service`
- [x] Write `ops/systemd/hud-logs-ingest.timer`
- [ ] Update provision script to install + enable timer
- [ ] Encrypt Gmail OAuth token with sops/age; document rotation in runbook
- [x] Add heartbeat write to `run.ts` (update `logs.last_successful_ingest` on success)
- [ ] Configure Uptime Kuma push monitor
- [x] Add Sentry `beforeSend` PII scrub for `parsed_json` / `body_*` fields
- [x] Write Sentry scrub unit test
- [x] Write `plan/reference/logs-ingest-runbook.md`
- [ ] Smoke test: deploy timer, wait one interval, confirm new emails appear in Logs tab

## Open Questions

## Notes

### 2026-06-12 — implementation
- `ops/systemd/hud-logs-ingest.service`: User=agent-hud, Slice=hud.slice, NoNewPrivileges=true, ProtectSystem=strict, ReadWritePaths=/srv/hud/data, EnvironmentFile=/srv/hud/secrets/logs-gmail.env
- `ops/systemd/hud-logs-ingest.timer`: OnCalendar=*:0/15, Persistent=true, RandomizedDelaySec=60
- `lib/sentry.ts`: scrubBeforeSend exports SCRUBBED_FIELDS=['parsed_json','body_text','body_html'], scrubObject (recursive), initSentry (no-op without SENTRY_DSN)
- 14 sentry-scrub tests passing — mutation test, breadcrumb scrub, DSN guard all verified
- Heartbeat write `logs.last_successful_ingest` already in run.ts (line 280)
- Deferred: provision script update, Uptime Kuma config, OAuth token encryption (all require server access)
- Status `review` — provision script + OAuth wiring require operator action on Hetzner
- Commits: `254a7c5 feat(infra): add systemd service+timer for logs-ingest, runbook`
