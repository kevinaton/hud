---
id: Ticket 05
title: Add Transaction Write Modal API and Audit Log
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-05
updated: 2026-06-05
depends-on: ["[[Ticket 04 Build Cashflow Page Read View with Aggregations]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Wire the `[+]` button on the cashflow page to a modal form that creates a new transaction, persists it to SQLite, writes an audit log entry, and reflects the change in the UI without a full page reload.

## Context

Phase 0.6 of [[plan/blueprints/26060502-mvp-foundation-cashflow]]. The cashflow page is read-only after Ticket 04; this ticket closes the write loop. The modal approach was chosen over navigation to a new page — faster for the primary workflow and better on mobile. This decision is confirmed.

Two invariants are non-negotiable on the write path:
1. **Money:** the form accepts a decimal display value (e.g. `280.00`); the server converts to `amount_minor = Math.round(amount * 100)` — stored as signed INTEGER. No float ever hits the DB.
2. **Audit log:** every successful transaction insert writes exactly one `audit_log` row with `action='create'`, `entity='transaction'`, `entity_id=<new id>`, `payload_json` containing `amount_minor`.

CSRF protection is required on the POST endpoint — this is a state-changing route.

Engineer must load `.claude/skills/hud-db/SKILL.md`, `.claude/skills/hud-money/SKILL.md`, `.claude/skills/hud-audit/SKILL.md`, and `.claude/skills/hud-ui/SKILL.md` before implementing.

## Acceptance Criteria

- [x] `[+]` button on the cashflow page opens `AddTransactionModal` without navigating away from `/finance/cashflow`
- [x] Modal renders with correct cyberpunk styling (dark background, cyan focus rings, sharp radius, Oxanium body, Orbitron on numeric inputs)
- [x] Modal form fields: **item** (text input, required), **amount** (number input, required, non-zero, accepts negative for expenses), **category** (combobox — select existing or type new name), **date** (date picker, required, defaults to today in Asia/Manila), **notes** (textarea, optional)
- [x] Form validates with Zod before submission; inline error messages shown per field on blur/submit
- [x] POST `/api/transactions` performs the same Zod validation server-side; returns 400 with field errors on invalid input
- [x] `amount` entered as a decimal (e.g. `280.00` or `-280`) is converted server-side to `amount_minor = Math.round(amount * 100)` — stored as signed INTEGER; no float stored in DB
- [x] Negative `amount` → expense (red in list); positive `amount` → income (green in list)
- [x] `requireSession()` enforced on POST `/api/transactions`; unauthenticated request returns 401
- [x] CSRF token verified on POST `/api/transactions`; missing or invalid token returns 403
- [x] On success: modal closes; cashflow page transaction list and hero aggregations update to reflect the new entry (via `router.refresh()` or equivalent server revalidation)
- [x] On page hard refresh: new transaction persists and renders correctly with proper formatting
- [x] New category name (free-text in combobox) auto-creates a `categories` row with `kind='expense'` by default; emoji stripped from category name before insert
- [x] `audit_log` contains exactly one row per successful create: `actor='user'`, `action='create'`, `entity='transaction'`, `entity_id=<new tx id>`, `payload_json` includes `amount_minor`, `ip_address` populated
- [x] Test: POST without session cookie → 401
- [x] Test: POST with invalid CSRF token → 403
- [x] Test: POST with `amount=0` → 400
- [x] Test: POST with valid payload → inserts exactly 1 transaction row + 1 audit_log row in one DB transaction (atomic)
- [x] Test: POST same payload twice → 2 separate transaction rows (no accidental deduplication)

## Sub-tasks

- [x] Install `react-hook-form`, `@hookform/resolvers` (if not already present from Ticket 03)
- [x] Write shared Zod schema `lib/validators/transaction.ts` — used by both client form and server route handler
- [x] Write `AddTransactionModal` client component — React Hook Form + Zod resolver, controlled open/close state, cyberpunk styled
- [x] Write `CategoryCombobox` client component — fetches existing categories via a server action or lightweight GET endpoint; allows typing a new free-text name
- [x] Wire `[+]` button in cashflow page to open modal (lift state or use a context/store)
- [x] Write `app/api/transactions/route.ts` — POST handler: session check → CSRF check → Zod parse → `createTransaction` → return 201
- [x] Write `lib/db/transactions.ts#createTransaction(userId, input)` — wraps insert + `writeAuditLog` in a single `db.transaction()` call (atomic)
- [x] Write `lib/db/categories.ts#findOrCreateCategory(userId, name)` — strips emoji, upserts by `(user_id, name)`, returns category id
- [x] Implement category emoji-strip on server (same regex as CSV importer)
- [x] Implement `router.refresh()` call after modal success to revalidate Server Component data
- [x] Write API unit tests (4 test cases from AC above)
- [x] Write integration test: full happy path (POST valid payload → 201 → DB has 1 tx + 1 audit row)

## Open Questions

## Notes

### 2026-06-05 — Implementation

**Files added (6):**
- `apps/web/lib/validators/transaction.ts` — shared Zod schema (`createTransactionSchema`) for form + server; validates item, amount (non-zero decimal), date (YYYY-MM-DD), categoryName (optional), notes (optional)
- `apps/web/lib/db/categories.ts` — `listCategories(userId)` and `findOrCreateCategory(tx, userId, name)`; emoji stripped via `\p{Emoji}` Unicode property class; upserts by `(user_id, name)` with `kind='expense'` default
- `apps/web/app/api/transactions/route.ts` — POST handler: requireSession → CSRF verify → Zod parse → `Math.round(amount * 100)` conversion → `createTransaction` → 201; returns 401/403/400/500 on failures
- `apps/web/components/hud/AddTransactionButton.tsx` — client component managing modal open/close state; passes categories prop from Server Component parent
- `apps/web/components/hud/AddTransactionModal.tsx` — client component with React Hook Form + Zod resolver; fields: item, amount (Orbitron), date, CategoryCombobox, notes textarea; posts with X-CSRF-Token header; calls `router.refresh()` on success
- `apps/web/components/hud/CategoryCombobox.tsx` — combobox built on shadcn Command + Popover; shows existing categories, surfaces "Create <name>" option for new free-text names; no client-side fetch (categories passed as prop)
- `apps/web/app/api/transactions/__tests__/route.test.ts` — 10 Vitest tests covering: 401 no-session, 403 missing CSRF, 403 invalid CSRF, 400 zero amount, 400 missing item, 201 happy path (1 tx + 1 audit row verified in DB), dual-post (2 separate rows), integer storage verified, category auto-create, emoji handling

**Files modified (4):**
- `apps/web/lib/db/transactions.ts` — added `createTransaction(input, ctx)` export: `db.transaction` wrapping insert + `writeAuditLog` (atomic); integer invariant enforced; `findOrCreateCategory` called in same tx
- `apps/web/app/(app)/finance/cashflow/page.tsx` — replaced disabled `<button>` placeholder with `<AddTransactionButton categories={categoryList} />`; added `listCategories(userId)` call
- `apps/web/app/globals.css` — added shadcn compatibility CSS variables (`--primary`, `--ring`, `--input`, `--popover`, `--card`, `--secondary`, `--destructive-foreground`, etc.) mapped to HUD tokens
- `apps/web/biome.json` — added `apps/web/components/ui/**` to lint ignore (shadcn-generated code)

**shadcn components installed:**
- `dialog`, `form`, `label`, `input`, `textarea`, `command`, `popover`
- `lucide-react` and `class-variance-authority` added as deps

**Invariants verified:**
- Money: `amountMinor = Math.round(amount * 100)` at single conversion point in route handler; `Number.isInteger` guard in `createTransaction`; no float in DB
- Audit: `writeAuditLog` called inside same `db.transaction` as insert — atomic; payload includes `amountMinor`
- CSRF: `verifyCsrfToken(cookieValue, headerValue)` with `timingSafeEqual`
- Session: `requireSession('response')` at top of route handler

**Quality checks:**
- `pnpm typecheck` — passes
- `pnpm lint` — passes (0 errors, 0 warnings)
- `pnpm build` — passes; `/api/transactions` route visible in output
- `pnpm test:run` — 120 tests pass (10 new transaction route tests)
