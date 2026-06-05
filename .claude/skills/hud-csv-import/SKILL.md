---
name: hud-csv-import
description: HUD CSV importer rules for `db backups/cashflow_export.csv` — emoji-stripped category normalization, time-format parser handling 14:06 / 7:11PM / 05:15pm / 7:40AM variants, integer minor-unit conversion, idempotent upsert by external_id. Load this only when working on `scripts/import-cashflow.ts` or related fixtures.
---

# HUD CSV Importer

## Source

`db backups/cashflow_export.csv` — legacy cashflow data exported from the user's prior tool.

**Columns:**
```
id, item, amount, currency, date, time, timezone, category, notes, created_at, updated_at
```

**Characteristics confirmed by reading the file:**

- ~1000 rows, PHP currency throughout
- `id` is a millisecond-ish timestamp string (`1770213977704`) — used as `external_id` for idempotency
- `amount` is a signed float string with two decimals (`-341.0`, `-1182.71`)
- `date` is `YYYY-MM-DD`
- `time` has **multiple formats** — see Time parser below
- `timezone` is `PHT` consistently (Philippine Time, UTC+8)
- `category` is free-text and **sometimes contains a leading emoji** (`🛌 Airbnb`, `Pet Food`, `Airbnb`, `Other`)
- `notes` is optional free text, may contain commas (CSV-quoted)
- `created_at` / `updated_at` are SQL datetime strings — ignored by importer; we set our own

## CLI contract

```
pnpm import:cashflow <csv-path> [--dry-run] [--user-id <id>] [--source-tag <tag>]
```

- `--dry-run` (default false): parse + normalize + report counts; **do not write to DB**.
- `--user-id` (default: prompt or env `HUD_IMPORT_USER_ID`): which user owns the imported rows.
- `--source-tag` (default: `csv-import`): value written to `transactions.source`.

Exit codes:
- `0` success (or successful dry-run)
- `1` parse error (bad CSV, missing columns)
- `2` validation error (rows failed normalization; report ≥ 1 failure)
- `3` DB error

## Normalization rules

### 1. `external_id`

- Trim whitespace from `id`
- Reject if empty or not all-digit
- Set as `transactions.external_id`

### 2. `amount` → `amount_minor` (signed integer)

```ts
function amountToMinor(raw: string): number {
  const f = Number.parseFloat(raw);
  if (!Number.isFinite(f)) throw new ParseError('amount not finite', { raw });
  // Multiply by 100 and round to nearest integer — avoids FP drift on values like 949.05
  const minor = Math.round(f * 100);
  if (!Number.isSafeInteger(minor)) throw new ParseError('amount out of range', { raw });
  return minor;
}
```

Preserves sign. `-341.0` → `-34100`. `-1182.71` → `-118271`. `-1640.57` → `-164057`.

### 3. `date` + `time` + `timezone` → `occurred_at` (ISO-8601 with offset)

`timezone=PHT` → fixed offset `+08:00` (Philippines does not observe DST).

**Time format parser — accept these and only these:**

| Input | Interpreted as |
|---|---|
| `14:06` | 14:06 (24h) |
| `08:49` | 08:49 |
| `7:11PM` | 19:11 |
| `7:11pm` | 19:11 |
| `05:15PM` | 17:15 |
| `05:15pm` | 17:15 |
| `7:40AM` | 07:40 |
| `9:38AM` | 09:38 |
| `9:38am` | 09:38 |

Implementation:

```ts
const TIME_24H = /^(\d{1,2}):(\d{2})$/;
const TIME_12H = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/;

function parseTime(raw: string): { hh: number; mm: number } {
  const trimmed = raw.trim();
  let m: RegExpMatchArray | null;
  if ((m = trimmed.match(TIME_24H))) {
    const hh = Number(m[1]); const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) throw new ParseError('time out of range', { raw });
    return { hh, mm };
  }
  if ((m = trimmed.match(TIME_12H))) {
    let hh = Number(m[1]) % 12;
    const mm = Number(m[2]);
    if (/p/i.test(m[3])) hh += 12;
    if (mm < 0 || mm > 59) throw new ParseError('time out of range', { raw });
    return { hh, mm };
  }
  throw new ParseError('time format not recognized', { raw });
}

function buildOccurredAt(date: string, time: string, tz: 'PHT'): string {
  // date is YYYY-MM-DD already
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ParseError('date format', { date });
  const { hh, mm } = parseTime(time);
  return `${date}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00+08:00`;
}
```

### 4. `category` → normalized `categories.name` (NO EMOJI)

```ts
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}️‍\s]+/u;

function normalizeCategory(raw: string): string {
  let s = (raw ?? '').replace(EMOJI_PREFIX, '');  // strip leading emoji + any combining marks
  s = s.replace(/\s+/g, ' ').trim();
  // Title-case for consistency: "pet food" → "Pet Food"; "Airbnb" stays "Airbnb"
  s = s.replace(/\b[\p{L}]/gu, (c) => c.toUpperCase());
  // Empty / unknown → "Other"
  return s.length === 0 ? 'Other' : s;
}
```

Examples:

| Raw | Normalized |
|---|---|
| `🛌 Airbnb` | `Airbnb` |
| `Airbnb` | `Airbnb` |
| `Pet Food` | `Pet Food` |
| `pet food` | `Pet Food` |
| `Other` | `Other` |
| `` (empty) | `Other` |
| `🍔 Food` | `Food` |

**Category creation:** upsert by `(user_id, name)`. If new, insert with `kind`:
- amount < 0 → `kind = 'expense'`
- amount > 0 → `kind = 'income'`
- amount == 0 → `kind = 'transfer'`

Later edits to category kind are out of importer scope.

### 5. `notes`

- Trim; empty string → `NULL`
- No length limit at MVP (longest seen is ~50 chars)
- No HTML/markdown stripping — stored as-is

### 6. `currency`

- Validate against the `Currency` enum (`PHP`, `USD`)
- Unknown currency → reject row with `ParseError('unsupported currency')`

## Idempotency

The unique index `idx_tx_external` (`user_id, external_id`) makes re-imports safe.

```ts
// Drizzle upsert pattern
db.insert(transactions)
  .values(normalizedRow)
  .onConflictDoUpdate({
    target: [transactions.userId, transactions.externalId],
    set: {
      // Only update mutable fields — never overwrite source/external_id/created_at
      item: normalizedRow.item,
      amountMinor: normalizedRow.amountMinor,
      currency: normalizedRow.currency,
      occurredAt: normalizedRow.occurredAt,
      categoryId: normalizedRow.categoryId,
      notes: normalizedRow.notes,
      updatedAt: sql`datetime('now')`,
    },
  });
```

Re-running the importer on the same CSV must produce zero changed rows on the second run (verified in a unit test).

## Output

After every run (real or dry-run), print to stdout:

```
HUD cashflow importer — 2026-06-05T18:00:00+08:00
Source:       db backups/cashflow_export.csv
User:         42
Mode:         dry-run | live
Read:         1024 rows
Parsed:       1024
Inserted:     820 (new external_id)
Updated:       204 (existing external_id)
Skipped:        0
Failed:         0
Categories created: 3 (Airbnb, Pet Food, Other)
Wallclock:    412ms
```

Failed rows are written to `./data/import-failures-<timestamp>.jsonl` (one JSON object per line, with `row_index`, `raw`, `error`).

## Audit

If `--dry-run` is false:

```ts
writeAudit(tx, {
  userId,
  actor: process.env.AUDIT_ACTOR ?? 'system',
  action: 'import',
  entity: 'transaction',
  payload: {
    source_path: csvPath,
    row_count: stats.read,
    inserted: stats.inserted,
    updated: stats.updated,
    skipped: stats.skipped,
    failed: stats.failed,
  },
});
```

One audit row per importer run, **not** one per transaction (would balloon the table).

## Required tests

- Emoji prefix stripped: `'🛌 Airbnb' → 'Airbnb'`
- Title-case normalization: `'pet food' → 'Pet Food'`
- Empty category → `'Other'`
- All five time formats from the table above produce correct ISO output with `+08:00`
- `-341.0` → `-34100`, `-949.05` → `-94905`, `-1640.57` → `-164057`
- Re-running on the same CSV produces zero `inserted` and zero changes on second run
- Bad time format (`25:99`) fails with `ParseError` and appears in `import-failures-*.jsonl`
- Unknown currency rejected
- `--dry-run` writes nothing to `transactions` or `audit_log`

## When this skill applies

- Editing `scripts/import-cashflow.ts`
- Editing fixtures used to test the importer
- Discussing data backfill for production

## When to escalate

- New CSV source with different columns → propose a new importer; do not extend this one with branching
- New time format encountered in data → add to the parser table in this skill AND in the implementation
- Need to merge transactions across two `external_id` values (data dedup) → architect decides; not an importer concern
