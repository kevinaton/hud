---
name: hud-money
description: HUD money invariants — amounts MUST be stored as signed INTEGER minor units (centavos for PHP), never floats. Defines the parser, formatter, arithmetic rules, and lint checks. Load this whenever a ticket touches `amount`, `balance`, currency, transactions, or any monetary calculation. Critical invariant — violating it is a defect by definition.
---

# HUD Money Rules

**One rule, repeated everywhere because it's the most common bug in finance code:**

> **Money is stored, transmitted, and computed as signed `INTEGER` minor units. Floats are forbidden anywhere near a monetary value.**

For PHP: minor unit = centavo. `1.00 PHP` = `100`. `-280.00 PHP` = `-28000`. `192_938.45 PHP` = `19_293_845`.

## Why

- IEEE 754 floats cannot represent `0.10` exactly. `0.1 + 0.2 !== 0.3` in JavaScript.
- Financial sums over thousands of rows accumulate visible cents of error.
- Comparison (`a === b`) is unreliable for floats.
- SQLite stores REAL as double; same problem at the DB layer.

Integers cents have none of these problems and cost zero performance.

## Where the rule lives

- **DB schema** (`packages/db/schema.ts`): `amount_minor INTEGER NOT NULL`. Never `REAL`, never `NUMERIC`.
- **Drizzle column type**: `integer('amount_minor', { mode: 'number' }).notNull()`.
- **API boundary**: Zod schema `z.number().int().safe()` for `amount_minor`. The client never sends a decimal string.
- **Form input**: the user types `280.00` in the UI. The form code parses → integer **at the form boundary**, before it enters any shared function.
- **Display**: the `<Money />` component takes `{ amountMinor, currency }` and renders the human string. No component ever performs `amount / 100` ad-hoc.

## The four functions (in `apps/web/lib/money/index.ts`)

```ts
// Parse a user-facing decimal string into signed minor units.
// Throws on NaN, on non-finite, on > MAX_SAFE_INTEGER.
export function parseMoney(input: string, currency: Currency): number;

// Format minor units for display.
// PHP: "P125,999,597" if integer, "P192,938.45" if fractional. No trailing zeros unless cents exist.
export function formatMoney(amountMinor: number, currency: Currency, opts?: FormatOpts): string;

// Sum a list of transactions (signed minor units). Always integer.
export function sumMinor(values: readonly number[]): number;

// Percent delta between two minor-unit sums. Returns rounded integer percent.
// e.g. (1500, 1200) → 25 (meaning +25%). (1000, 1500) → -33.
export function pctDelta(current: number, previous: number): number;
```

**Contract guarantees:**

- `parseMoney` is the only function in the codebase allowed to call `parseFloat`/`Number()` on a monetary string. It does the multiply-by-100 + `Math.round` once, and validates the result fits in a safe integer.
- `formatMoney` never accepts a non-integer. Type signature enforces `number` and runtime checks `Number.isInteger(amountMinor)`.
- `sumMinor` uses plain `+`. Because all inputs are integers, the sum is exact.
- `pctDelta` is the ONLY place a division is allowed on money. It returns a percent (unitless integer), never a money value.

## Forbidden patterns

The following are defects and must be rejected at code review:

```ts
// ❌ Float arithmetic on money
const total = transactions.reduce((s, t) => s + t.amount, 0);  // if t.amount is float, broken

// ❌ Division by 100 inline
const display = `P${(amount / 100).toFixed(2)}`;               // use <Money /> or formatMoney

// ❌ String concatenation as math
const total = "P" + (a + b);                                    // if a/b are strings, undefined behavior

// ❌ Drizzle REAL column for money
amount: real('amount').notNull()                                // use integer + 'amount_minor'

// ❌ Zod number without .int()
z.object({ amount: z.number() })                                // missing .int(), allows floats

// ❌ JSON.parse → use as money
const amt = JSON.parse(body).amount;                            // not validated; could be float
```

## Required patterns

```ts
// ✅ Schema
amount_minor: integer('amount_minor', { mode: 'number' }).notNull(),

// ✅ Zod
const TransactionInput = z.object({
  amountMinor: z.number().int().safe(),
  currency: z.enum(['PHP', 'USD']),
  // ...
});

// ✅ Form boundary
const onSubmit = (form: FormValues) => {
  const amountMinor = parseMoney(form.amount, form.currency); // single conversion point
  postTransaction({ amountMinor, currency: form.currency, ... });
};

// ✅ Display
<Money amountMinor={tx.amountMinor} currency={tx.currency} />

// ✅ Aggregation
const grossMinor = sumMinor(positives.map(t => t.amountMinor));
const expenseMinor = sumMinor(negatives.map(t => -t.amountMinor)); // make positive for display
const netMinor = sumMinor(all.map(t => t.amountMinor));
```

## Display rules (matches Figma `node-id=309-631`)

| Value | Format |
|---|---|
| `12599959700` PHP | `P125,999,597` (no decimals when minor=00) |
| `19293845` PHP | `P192,938.45` |
| `-28000` PHP | `-P280.00` (negative sign before symbol) |
| `5668000` PHP (positive) | `P56,680.00` |
| `+20% delta` | `+20% INC` if positive, `+20% inc` if negative (case mirrors Figma exactly) |

- Negative amounts: red (`var(--destructive)`).
- Positive amounts: green (`var(--success)`).
- Zero: muted foreground.
- Always `font-feature-settings: 'tnum'` (tabular nums) so columns align.
- Always Orbitron for the numeric, Oxanium for the label.

## Lint / CI guard

Add to CI:

```bash
# Reject 'float' or '/100' or 'parseFloat' inside money-adjacent files
git grep -nE '(parseFloat|\\b/\\s*100\\b|amount:\\s*real\\()' -- \
  'apps/web/lib/money' 'apps/web/lib/db' 'packages/db' \
  && { echo "Money float violation"; exit 1; } || true
```

(Refine the regex as patterns emerge. The point is: this rule has a mechanical check.)

## When this skill applies

- Any change to `transactions`, `categories.kind`, or any aggregation route
- Any new UI displaying money
- Any new API accepting money input
- Any new test that asserts a money value (use minor-unit integers in assertions)

## When to escalate

- New currency added → architect must approve the `Currency` enum extension and confirm minor-unit ratio (most currencies are 100; JPY is 1; some are 1000).
- Multi-currency conversion → out of MVP scope; surface to architect.
