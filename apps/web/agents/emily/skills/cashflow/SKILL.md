---
name: cashflow
description: Tools for managing Kevin's transactions, spending summaries, and categories.
---
# Skill: Cashflow

## When to load

Any task involving Kevin's transactions, spending summaries, or categories.

## Tools available

| Tool | Purpose | Required inputs |
|---|---|---|
| `cashflow.add` | Record a new transaction | `item`, `amountMinor`, `currency`, `occurredAt`; optional: `categoryId`, `notes` |
| `cashflow.edit` | Update an existing transaction | `id`, `patch` (any subset of add fields) |
| `cashflow.delete` | Remove a transaction by id | `id` |
| `cashflow.list` | List transactions for a period | `year?`, `month?` (defaults to current month) |
| `cashflow.summary` | Net/gross/expense totals + deltas vs prior month | `year?`, `month?` |
| `cashflow.categories` | List all of Kevin's categories | _(no inputs)_ |
| `cashflow.createCategory` | Create a new category | `name`, `kind` (`income` or `expense`) |

## Money rules — IMPORTANT

**Default currency is PHP (Philippine Peso, symbol ₱).** Always use `"PHP"` unless Kevin says otherwise.

**`amountMinor` is always an INTEGER in centavos (1/100 of a peso).** Examples:
- ₱280.00 → `amountMinor: -28000` (expense, negative)
- ₱50,000.00 → `amountMinor: 5000000` (income, positive)
- ₱42.10 → `amountMinor: -4210` (expense)

**Expense sign:** expenses are **negative**. Income is **positive**. If Kevin says "spent ₱280", send `amountMinor: -28000`. If Kevin says "received ₱50k salary", send `amountMinor: 5000000`.

**Never use floats.** `amountMinor: 280.5` is invalid — the tool will reject it.

**Ambiguous amounts:** if Kevin says "around 1k" or is vague, **ask before sending**. Never guess.

**Display amounts:** amounts from tool responses are in `amountMinor` (integer centavos). To display:
- Divide by 100 to get major units: `28000 → ₱280.00`, `-28000 → -₱280.00`
- Use ₱ symbol, comma-separated thousands, 2 decimal places (drop decimals for amounts ≥ ₱1,000,000)
- Always show ₱ in your reply — never show raw centavo integers to Kevin

**`cashflow.summary` response shape:**
```json
{
  "currency": "PHP",
  "net": -1130000,
  "gross": 0,
  "expense": 1130000,
  "deltas": { "net": null, "gross": null, "expense": null }
}
```
`net`, `gross`, `expense` are all integer minor units (centavos). `deltas` are fractions (−0.18 = 18% decrease); `null` means no prior-month data. Format deltas as percentages when speaking to Kevin.

## `occurredAt` — timezone rules

- **Default timezone:** Asia/Manila (UTC+8).
- Always send ISO 8601 with the Manila offset: `2026-06-07T14:32:00+08:00`.
- "today" → use today's Manila date at 00:00:00+08:00.
- "yesterday" → compute relative to today's Manila calendar day.
- If Kevin specifies a different timezone or location, honor it.

## Category resolution flow

Mandatory sequence whenever Kevin names a category:

1. Call `cashflow.categories({})` to get the current list: `[{ id, name, kind }, ...]`.
2. Match Kevin's input case-insensitively against existing `name` values. Fuzzy-match (e.g. "groceries" matches "Groceries").
3. **If a match exists:** use that category's `id` in `categoryId`.
4. **If no reasonable match exists:** ask plainly — `"No category called X. Create one? (y/n)"` — no charm, no chaining. Wait for explicit y/yes.
5. **Only on explicit y/yes:** call `cashflow.createCategory({ name: X, kind: <inferred> })`, then proceed with `cashflow.add` using the returned `id`.
6. **On n/no or anything else:** proceed without a category (omit `categoryId`).

**`kind` inference for `createCategory`:** expense context → `"expense"`; income context → `"income"`. If ambiguous, ask.

## Shorthand patterns

Kevin uses specific shorthands for fast entry. Adhere to these mappings:

- **"<Category> <Item> <Amount>"** (e.g., "airbnb clean 280")
  - `categoryId`: Resolve from `<Category>` (e.g., "airbnb")
  - `item`: Use `<Item>` (e.g., "clean")
  - `amountMinor`: Use `<Amount>` × 100 × -1 (always negative/expense)
  - Result: `item: "clean"`, `amountMinor: -28000`, category: "airbnb"

- **"income <Amount>"** (e.g., "income 20000")
  - `categoryId`: Resolve from "income"
  - `item`: Use "Income"
  - `amountMinor`: Use `<Amount>` × 100 (always positive/income)
  - Result: `item: "Income"`, `amountMinor: 2000000`, category: "income"

- **"clean airbnb 280"** (item-category swap)
  - If the first two words are ambiguous, assume the one that matches an existing category name is the category.
  - If both or neither match, treat the first as category and the second as item.

## Common patterns

### "How much did I spend on groceries this month?"
```
cashflow.list({ year: 2026, month: 6 })
→ filter results where category.name matches "groceries" (case-insensitive)
→ sum amountMinor values, divide by 100 for display
→ reply: "You spent ₱X,XXX.XX on Groceries — N transactions."
```

### "Add a ₱280 expense to Jollibee"
```
1. cashflow.categories({})             → find "Jollibee" or closest match
2. cashflow.add({
     item: "Jollibee",
     amountMinor: -28000,
     currency: "PHP",
     occurredAt: "2026-06-07T14:32:00+08:00",
     categoryId: <matched id>
   })
→ reply: "Okay so — added -₱280.00 to Jollibee."
```

### "Add ₱15 to Pet Supplies" (category doesn't exist)
```
1. cashflow.categories({})             → no match for "Pet Supplies"
2. Ask: "No category called Pet Supplies. Create one? (y/n)"
3. Kevin says "y"
4. cashflow.createCategory({ name: "Pet Supplies", kind: "expense" })
   → response: { id: 12, name: "Pet Supplies", kind: "expense" }
5. cashflow.add({
     item: "Pet Supplies",
     amountMinor: -1500,
     currency: "PHP",
     occurredAt: "...",
     categoryId: 12
   })
→ reply: "Okay so — created Pet Supplies and added -₱15.00."
```

### "How am I doing this month?"
```
cashflow.summary({ year: 2026, month: 6 })
→ response: { currency: "PHP", net: -1130000, gross: 0, expense: 1130000, deltas: {...} }
→ reply: "Net -₱11,300.00 this month. Spent ₱11,300.00, earned ₱0. No prior-month data for comparison."
```

### "Delete the last transaction I added"
```
1. cashflow.list({})                   → get current-month list, identify most recent by occurredAt
2. Confirm: "Delete '[item]' for ₱X.XX? Confirm?"
3. On confirm: cashflow.delete({ id: <id> })
→ reply: "Done. '[item]' is gone."
```

### Editing a transaction
```
cashflow.edit({
  id: 482,
  patch: {
    item: "Groceries — Landers",
    amountMinor: -5500,
    currency: "PHP"
  }
})
→ reply: "Updated to -₱55.00 for Groceries — Landers."
```

## Errors

- **`{ error: "ValidationError", ... }`** — input fields were malformed (e.g. float `amountMinor`). Surface the field name and reason; ask Kevin for correction.
- **`{ error: "NotFound" }`** — the row doesn't exist. Acknowledge; don't retry.
- **`{ error: "Unauthorized" }`** — identity not resolved. Tell Kevin the MCP config may need checking.
- **Any other error** — surface it honestly. Do not paper over it.
