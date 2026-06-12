---
id: Ticket 54
title: L3 Build Logs Tab with Approval Workflow and Settings Panel
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
completed: 2026-06-12
depends-on: ["[[Ticket 53 L2 Build Airbnb Email Parsers and Domain Lib]]"]
blocks: ["[[Ticket 55 L4 Schedule Ingest Timer Wire Secrets and Add Observability]]"]
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/feature]
---

## Goal

Build the `(app)/logs` RSC page showing all ingested email entries with approve/reject actions, a "do not ask again" rule toggle, and a settings panel for the global approval toggle — matching the HUD design system.

## Context

This is L3 of the pipeline (blueprint `26061201` §4 Approval Workflow, §5 Code Layout). Once parsers are running (L2), operators need a UI to review `pending` entries and approve or reject them before they project into the Airbnb ledger.

Approval state machine (from blueprint):
```
parsed OK + approval_required=false  → auto-recorded
parsed OK + log_rules auto_approve   → auto-recorded
parsed OK + log_rules ignore         → rejected (reason: rule)
parsed OK, no rule                   → pending
parse_failed                         → parse_failed
DKIM-fail                            → rejected (reason: dkim_fail)
```

Only `recorded` entries flow to `airbnb_reservations` / `airbnb_payouts` tables. `pending`/`rejected`/`parse_failed` never touch the ledger.

Actor values:
- Approval/reject by operator in browser → `actor='user'`
- Auto-record by ingest worker → `actor='system:logs-ingest'`

Core lib (`apps/web/lib/db/logs.ts`) must be written here:
- `listEntries(userId, filters)` — filter by status, kind, date range
- `approveEntry(userId, entryId, ctx)` — moves `pending → recorded`, projects to `airbnb_*`, writes audit log
- `rejectEntry(userId, entryId, reason, ctx)` — moves `pending → rejected`, writes audit log
- `setApprovalRequired(userId, enabled, ctx)` — upserts `app_settings['logs.approval_required']`
- `upsertRule(userId, rule, ctx)` — inserts/updates a `log_rules` row
- Whitelist CRUD: `listWhitelist`, `enableWhitelist`, `disableWhitelist`

Nav shell: add "Logs" entry to the `TabBar` / sidebar.

See `.claude/skills/hud-ui/SKILL.md` for design constraints (no box-shadow, 2px radius, font-body/font-display, accent tokens).
See `.claude/skills/hud-audit/SKILL.md` — every approve/reject/settings change writes one `audit_log` row.

## Acceptance Criteria

- [x] `apps/web/lib/db/logs.ts` implements all six functions listed above, all audit-aware
- [x] `(app)/logs/page.tsx` RSC renders a list of `log_entries` for `user_id`, filterable by `status` (pending / recorded / rejected / parse_failed) and `kind`
- [x] Each entry shows: kind, subject, sender, received_at, status, and (if `parsed_json`) a summary of key parsed fields
- [x] Approve button: moves `pending → recorded`; triggers projection into `airbnb_*` tables via `approveEntry`; writes `audit_log` with `actor='user'`
- [x] Reject button: moves `pending → rejected` with a reason; writes `audit_log` with `actor='user'`
- [x] "Approve and don't ask again" action: approves the entry AND inserts a `log_rules` `auto_approve` row for that `(sender, kind)`; future entries of that kind auto-record
- [x] Settings panel (sub-route or modal) exposes the `logs.approval_required` global toggle; toggling it upserts `app_settings` and writes `audit_log`
- [x] "Logs" tab added to the navigation shell (TabBar or equivalent) alongside Finance/Cashflow
- [x] `parse_failed` entries show the `status_reason`; no approve/reject buttons (operator cannot un-fail without re-parsing)
- [x] DKIM-rejected entries show `status_reason='dkim_fail'`; no approve/reject buttons
- [x] All write routes are session-gated and Zod-validated
- [x] No sensitive raw email body content rendered in the UI (show `parsed_json` summary only)
- [x] UI matches HUD design system per `.claude/skills/hud-ui/SKILL.md` — no box-shadow, 2px radius, border-border, font tokens

## Sub-tasks

- [x] Implement `apps/web/lib/db/logs.ts` — all six audit-aware functions
- [x] Write `/api/logs/[id]/approve` route — session-gated, Zod, calls `approveEntry`
- [x] Write `/api/logs/[id]/reject` route — session-gated, Zod, calls `rejectEntry`
- [x] Write `/api/logs/rules` route — upsertRule (auto_approve / ignore)
- [x] Write `/api/logs/settings` route — setApprovalRequired toggle
- [x] Build `(app)/logs/page.tsx` RSC — entry list with status/kind filter chips
- [x] Build approval action buttons (client component — Approve / Reject / Don't ask again)
- [x] Build settings panel — approval toggle, whitelist view
- [x] Add "Logs" to nav shell
- [ ] Verify approve flow end-to-end: pending entry → approve → recorded → appears in airbnb_reservations

## Open Questions

## Notes

### 2026-06-12 — implementation
- `lib/db/logs.ts`: listEntries (filtered), approveEntry (project + cashflow), rejectEntry, setApprovalRequired, upsertRule, listWhitelist/enableWhitelist/disableWhitelist, getApprovalRequired, listRules
- API routes: /api/logs/[id]/approve (with autoApprove body param), /api/logs/[id]/reject, /api/logs/rules, /api/logs/settings — all session+CSRF+Zod gated
- (app)/logs/page.tsx RSC: pending count hero, entry list, LogEntryActions (approve/approveRule/reject), LogsSettingsPanel (toggle + whitelist), LogsFilterBar (status/kind chips)
- AppNavDrawer wired into Finance, Logs, Airbnb layouts — replaces no-op hamburger
- No raw email body ever rendered — only parsedJson summary fields
- End-to-end verification deferred until L4 timer is live
- Commit: `349f50c feat(ui): add Logs tab, Airbnb tab, domain libs, and approval workflow`
