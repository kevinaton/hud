---
id: Ticket 53
title: L2 Build Airbnb Email Parsers and Domain Lib
status: todo
priority: p2
area: feature
estimate: M
created: 2026-06-12
updated: 2026-06-12
depends-on: ["[[Ticket 52 L1 Build Gmail Read-Only Connector with Whitelist and DKIM Gate]]"]
blocks: ["[[Ticket 54 L3 Build Logs Tab with Approval Workflow and Settings Panel]]", "[[Ticket 56 L5a Build Airbnb Balance Sheet Tab]]"]
blueprint: "[[plan/blueprints/26061201-logs-email-ingestion-airbnb]]"
tags: [task, area/feature]
---

## Goal

Implement the Airbnb email classifier, three v1 parsers (`reservation_confirmed`, `cancellation`, `payout`), and the `apps/web/lib/db/airbnb.ts` audit-aware domain lib — verified against the three real sample emails as Vitest fixtures, with money going through `@hud/money parseMoney`.

## Context

This is L2 of the pipeline (blueprint `26061201` §2 Classifier + Parsers, §3 Data Model). After L1 captures raw emails with `kind='unknown'`, L2 reads stored raws and classifies + parses them into structured `parsed_json` and the Airbnb domain tables.

The three real sample email shapes (source of truth for parser correctness):

| Type | Subject pattern | Critical fields |
|---|---|---|
| `reservation_confirmed` | `Reservation confirmed - <Guest> arrives <date>` | Confirmation code (`HMJ9JX4ZYZ`), guest name, check-in/checkout, projected earning ("You earn ₱1,504.05") |
| `cancellation` | `Canceled: Reservation <code> for <dates>` | Confirmation code (`HM8NAAMTHH`), listing id (`977049623688034712`), date range, guest name |
| `payout` | `We sent a payout of ₱<total> PHP` | Payout total (`₱49,878.59`), sent date, bank label, Airbnb account id, itemized per-reservation list (each: guest, net amount, dates, confirmation code) |

Key design rules from the blueprint:
- **Confirmation code** (`HM[A-Z0-9]{8}`) is the natural key tying all three types to one reservation.
- **`@hud/money parseMoney`** is the ONLY way to convert ₱ strings to centavo integers. Never parse money manually, never use floats, never use an LLM. See `.claude/skills/hud-money/SKILL.md`.
- **Versioned parsers:** selectors live as named constants at the top of each parser file — not scattered inline. When Airbnb changes a template, a new `vN` file is added without touching existing parsers.
- **Re-parse mode:** the pipeline must support a `--reparse` flag that re-runs parsers over existing `log_raw` rows without re-fetching from Gmail.
- **Upsert semantics by confirmation code:** `reservation_confirmed` upserts with `status='confirmed'` + projected earning; `cancellation` upserts (creating a stub if unseen) with `status='canceled'`; `payout` creates the payout + items and upserts `realized_earning_minor` + `status='paid_out'` per item.
- **Assertion:** payout items must sum exactly to `payout_total_minor`; if not, entry is `parse_failed` and never flows to the ledger.
- **Date hazard:** Airbnb emails mix formats (`Sat, Jun 13`, `Jun 13 – 14, 2026`, `4/17/2026 - 4/19/2026`). Resolve ambiguous years from `message internalDate`. Implausible dates → `parse_failed`.
- Every write (parsed_json update, reservation upsert, payout + items insert) produces one `audit_log` row with `actor='system:logs-ingest'` per `.claude/skills/hud-audit/SKILL.md`.

Package additions:
```
packages/logs-ingest/src/
├── classify.ts                              — (sender, subject) → parser key
├── parsers/
│   ├── registry.ts                         — key → { version, match, parse }
│   └── airbnb/
│       ├── reservation_confirmed.v1.ts
│       ├── cancellation.v1.ts
│       └── payout.v1.ts
apps/web/lib/db/
└── airbnb.ts                               — upsertReservation, markCanceled, recordPayout, balance-sheet queries
```

## Acceptance Criteria

- [ ] `apps/web/lib/db/airbnb.ts` implements `upsertReservation`, `markCanceled`, `recordPayout` (+ items), and at least one balance-sheet read query; all writes are audit-aware (`actor` from `ReqCtx`)
- [ ] Classifier (`classify.ts`) matches `reservation_confirmed`, `cancellation`, and `payout` emails by sender + subject regex; unknown subjects → `kind='unknown'`
- [ ] `reservation_confirmed.v1.ts` extracts: confirmation code, guest name, check-in, check-out, nights, guest count, gross total, cleaning fee, host service fee (signed negative), projected earning — all money via `parseMoney` → centavo INTEGER
- [ ] `cancellation.v1.ts` extracts: confirmation code, listing id, listing name, date range, guest name; sets `status='canceled'` on the reservation (creating a stub row if no prior confirmed email)
- [ ] `payout.v1.ts` extracts: payout total, sent date, expected arrival, bank label, Airbnb account id, and itemized list (per item: confirmation code, guest name, net amount, date range, listing id/name)
- [ ] Payout items sum assertion: if `SUM(items.amount_minor) ≠ payout_total_minor`, entry is set to `parse_failed` with reason; no `airbnb_payouts` row is created
- [ ] All money values extracted via `@hud/money parseMoney` — no inline regex-to-float, no `parseFloat`, no LLM
- [ ] Named selector constants at the top of each parser file (no magic strings scattered inline)
- [ ] `--reparse` mode: re-runs parsers over stored `log_raw` without re-fetching from Gmail; idempotent
- [ ] Vitest fixtures: the three real sample email bodies (or faithful reproductions) are committed as test fixtures; all three parse to exact expected structured values — confirmation codes, centavo integers (`-31595` for `-₱315.95`, `4987859` for `₱49,878.59`, `150405` for `₱1,504.05`), ISO-8601 dates with Asia/Manila offset
- [ ] `parse_failed` entries never touch `airbnb_reservations`, `airbnb_payouts`, or `airbnb_payout_items`
- [ ] Every write produces one `audit_log` row with `actor='system:logs-ingest'`
- [ ] Vitest passes: `pnpm --filter logs-ingest test`

## Sub-tasks

- [ ] Implement `apps/web/lib/db/airbnb.ts` — `upsertReservation`, `markCanceled`, `recordPayout` (with items + sum assertion), balance-sheet query stubs
- [ ] Implement `classify.ts` — classifier by (sender, subject regex)
- [ ] Implement `parsers/registry.ts` — versioned parser registration
- [ ] Implement `parsers/airbnb/reservation_confirmed.v1.ts` — named selectors, `parseMoney` for all amounts, date normalization
- [ ] Implement `parsers/airbnb/cancellation.v1.ts` — confirmation code extraction, stub upsert
- [ ] Implement `parsers/airbnb/payout.v1.ts` — total + items extraction, sum assertion
- [ ] Commit three sample email fixture files for Vitest
- [ ] Write Vitest tests for all three parsers against fixtures
- [ ] Wire classifier + parsers into `run.ts` pipeline; add `--reparse` flag
- [ ] Confirm `pnpm --filter logs-ingest test` passes

## Open Questions

## Notes
