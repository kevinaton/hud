---
id: Ticket 54
title: L3 Build Logs Tab with Approval Workflow and Settings Panel
status: todo
priority: p2
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
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

- [ ] `apps/web/lib/db/logs.ts` implements all six functions listed above, all audit-aware
- [ ] `(app)/logs/page.tsx` RSC renders a list of `log_entries` for `user_id`, filterable by `status` (pending / recorded / rejected / parse_failed) and `kind`
- [ ] Each entry shows: kind, subject, sender, received_at, status, and (if `parsed_json`) a summary of key parsed fields
- [ ] Approve button: moves `pending → recorded`; triggers projection into `airbnb_*` tables via `approveEntry`; writes `audit_log` with `actor='user'`
- [ ] Reject button: moves `pending → rejected` with a reason; writes `audit_log` with `actor='user'`
- [ ] "Approve and don't ask again" action: approves the entry AND inserts a `log_rules` `auto_approve` row for that `(sender, kind)`; future entries of that kind auto-record
- [ ] Settings panel (sub-route or modal) exposes the `logs.approval_required` global toggle; toggling it upserts `app_settings` and writes `audit_log`
- [ ] "Logs" tab added to the navigation shell (TabBar or equivalent) alongside Finance/Cashflow
- [ ] `parse_failed` entries show the `status_reason`; no approve/reject buttons (operator cannot un-fail without re-parsing)
- [ ] DKIM-rejected entries show `status_reason='dkim_fail'`; no approve/reject buttons
- [ ] All write routes are session-gated and Zod-validated
- [ ] No sensitive raw email body content rendered in the UI (show `parsed_json` summary only)
- [ ] UI matches HUD design system per `.claude/skills/hud-ui/SKILL.md` — no box-shadow, 2px radius, border-border, font tokens

## Sub-tasks

- [ ] Implement `apps/web/lib/db/logs.ts` — all six audit-aware functions
- [ ] Write `/api/logs/[id]/approve` route — session-gated, Zod, calls `approveEntry`
- [ ] Write `/api/logs/[id]/reject` route — session-gated, Zod, calls `rejectEntry`
- [ ] Write `/api/logs/rules` route — upsertRule (auto_approve / ignore)
- [ ] Write `/api/logs/settings` route — setApprovalRequired toggle
- [ ] Build `(app)/logs/page.tsx` RSC — entry list with status/kind filter chips
- [ ] Build approval action buttons (client component — Approve / Reject / Don't ask again)
- [ ] Build settings panel — approval toggle, whitelist view
- [ ] Add "Logs" to nav shell
- [ ] Verify approve flow end-to-end: pending entry → approve → recorded → appears in airbnb_reservations

## Open Questions

## Notes
