---
id: Ticket 10
title: Add Edit and Delete to Transaction Modal
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-06
updated: 2026-06-06
depends-on: ["[[Ticket 05 Add Transaction Write Modal API and Audit Log]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Make every transaction row on the cashflow page clickable — clicking opens the existing transaction modal in edit mode, pre-populated with that transaction's data, with a delete button at the lower left of the dialog.

## Context

Ticket 05 built the "Add Transaction" modal and `POST /api/transactions`. This ticket extends that work with edit and delete:

- The modal is reused for both create and edit — it switches mode based on whether a `transaction` prop is passed in.
- Clicking a `TransactionRow` triggers edit mode for that transaction.
- The delete button lives at the lower left of the modal (opposite side from the primary action button), following the standard destructive-action placement pattern.
- All state changes write to `audit_log` per `.claude/skills/hud-audit/SKILL.md`.
- Per `.claude/skills/hud-db/SKILL.md`, all amounts remain integer minor units.

Engineer must load `.claude/skills/hud-audit/SKILL.md`, `.claude/skills/hud-db/SKILL.md`, and `.claude/skills/hud-ui/SKILL.md`.

## Acceptance Criteria

### Edit flow
- [x] Clicking any `TransactionRow` on `/finance/cashflow` opens the transaction modal in edit mode with all fields pre-populated: item, amount (displayed as decimal, e.g. `280.00`), category, date, notes
- [x] Modal title reads "Edit Transaction" in edit mode (vs "Add Transaction" for new)
- [x] Submit button reads "Save Changes" in edit mode
- [x] Submitting the edit form calls `PUT /api/transactions/[id]` with the updated fields; the transaction is updated in the DB
- [x] After a successful save the modal closes and the transaction list reflects the updated values without a full page reload
- [x] `PUT /api/transactions/[id]` returns 401 if the session is missing or invalid
- [x] `PUT /api/transactions/[id]` returns 403 if the transaction does not belong to the authenticated user
- [x] `PUT /api/transactions/[id]` validates the request body with Zod (same schema as POST, all fields optional except at least one must be present)
- [x] One `audit_log` row written per successful update: `actor='user'`, `action='update'`, `entity='transaction'`, `entity_id=<tx id>`, `payload_json` contains the changed fields

### Delete flow
- [x] A "Delete" button is visible at the lower left of the modal when in edit mode; it is absent in create mode
- [x] Clicking "Delete" shows an inline confirmation step inside the modal (e.g. button label changes to "Confirm Delete" or a confirmation message appears) before the request is sent
- [x] When delete confirmation is active, the "Cancel" and "Save Changes" buttons are hidden — only the "No" and "Confirm Delete" controls are visible, preventing layout overlap
- [x] Confirming delete calls `DELETE /api/transactions/[id]`; the transaction is removed from the DB
- [x] After a successful delete the modal closes and the transaction disappears from the list without a full page reload
- [x] `DELETE /api/transactions/[id]` returns 401 if the session is missing or invalid
- [x] `DELETE /api/transactions/[id]` returns 403 if the transaction does not belong to the authenticated user
- [x] One `audit_log` row written per successful delete: `actor='user'`, `action='delete'`, `entity='transaction'`, `entity_id=<tx id>`

### General
- [x] The aggregation cards (net income, gross, expense) update correctly after an edit or delete without requiring a manual refresh
- [x] `pnpm test:run` passes; new unit tests cover the PUT and DELETE route handlers (happy path + 401 + 403)
- [x] `pnpm typecheck` passes

## Sub-tasks

- [x] Add `PUT /api/transactions/[id]/route.ts` — validate session, ownership check, Zod validation, Drizzle update, audit log write
- [x] Add `DELETE /api/transactions/[id]/route.ts` — validate session, ownership check, Drizzle delete, audit log write
- [x] Extend the transaction modal component to accept an optional `transaction` prop; when present, pre-populate fields and switch to edit mode
- [x] Make `TransactionRow` clickable — `onClick` passes the transaction to the modal open handler
- [x] Add "Delete" button at lower left of modal (edit mode only) with inline confirmation step
- [x] Wire optimistic UI: update / remove transaction from local state on success
- [x] Update aggregation totals in the UI after edit/delete (revalidate or local recalculation)
- [x] Write unit tests for PUT and DELETE route handlers
- [x] Run `pnpm test:run` and `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-06 — Implementation

**Files added (5):**
- `apps/web/app/api/transactions/[id]/route.ts` — PUT and DELETE handlers with session + CSRF + ownership guards, Zod validation, money conversion, audit log
- `apps/web/app/api/transactions/[id]/__tests__/route.test.ts` — 13 unit tests (PUT: 401, 403 CSRF, 403 ownership, 400 bad body, happy path, diff audit; DELETE: 401, 403 CSRF, 403 ownership, happy path, DB integrity)
- `apps/web/components/hud/TransactionModal.tsx` — unified create/edit modal; accepts optional `transaction` prop; `DeleteControls` sub-component for inline confirmation
- `apps/web/components/hud/CashflowTransactionSection.tsx` — client component owning header, clickable TransactionRow list, and shared TransactionModal state

**Files modified (6):**
- `apps/web/lib/validators/transaction.ts` — added `updateTransactionSchema` and `UpdateTransactionInput`
- `apps/web/lib/db/transactions.ts` — added `getTransactionById`, `updateTransaction`, `deleteTransaction`, `buildUpdateDiff` helper, `UpdateTransactionDbInput` type
- `apps/web/components/hud/AddTransactionModal.tsx` — now a thin re-export shim for `TransactionModal` (backwards compat)
- `apps/web/components/hud/AddTransactionButton.tsx` — slimmed back to add-only; edit flow moved to `CashflowTransactionSection`
- `apps/web/components/hud/TransactionRow.tsx` — added optional `onClick` prop with keyboard (Enter/Space) support and hover style
- `apps/web/app/(app)/finance/cashflow/page.tsx` — replaced inline header + row loop with `CashflowTransactionSection`

**Commits:** 1 (`feat(transactions): add edit and delete to transaction modal`)

**Test results:** 133/133 tests pass (`pnpm test:run`). `pnpm typecheck` and `pnpm lint` both pass.

**Design decisions:**
- `router.refresh()` after save/delete re-fetches server component data (aggregation cards + transaction list) — no separate optimistic state needed; server already recomputes all aggregations correctly.
- 403 is returned for both "transaction not found" and "owned by different user" to avoid information disclosure.
- Audit `update` payload is diff-only (`before`/`after` of changed fields only, per hud-audit skill).
- `CashflowTransactionSection` was introduced rather than placing edit state in `AddTransactionButton` to keep layout control in the page while still sharing one modal instance.

### Comment
- Improve confirm delete because it is overlapping. When clicking delete button, it will show the Confirm? NO | DELETE, then the cancel and save changes are hidden so that it will prevent the overlap.

### 2026-06-06 — delete confirmation button visibility fix
- Modified `apps/web/components/hud/TransactionModal.tsx`: wrapped the Cancel + "Save Changes" button group in `{deleteState === 'idle' && (...)}` so those buttons are unmounted when the inline delete confirmation is active (`deleteState === 'confirm'` or `'deleting'`). Only the "No" and "Yes, Delete" controls remain visible during confirmation, eliminating the layout overlap.
- The `disabled` prop on Cancel and Submit also simplified: removed the `|| isDeleting` guard since those elements are no longer rendered while deleting.
- Files: 1 modified, 0 added.
- `pnpm typecheck` passes. `biome check` on the changed file passes (pre-existing format issue in unrelated file `finance/layout.tsx` is not introduced by this change).
