#!/usr/bin/env tsx
/**
 * scripts/import-cashflow.ts
 *
 * CSV importer CLI: loads db backups/cashflow_export.csv into the transactions table.
 *
 * Usage:
 *   pnpm import:cashflow -- --file "db backups/cashflow_export.csv" \
 *                           --user-email admin@hud.local \
 *                           [--dry-run]
 *
 * Exit codes:
 *   0  success (or successful dry-run)
 *   1  parse error (bad CSV, missing columns)
 *   2  validation error (≥1 row failed normalization)
 *   3  DB error
 *
 * Per hud-csv-import skill:
 *   - Emoji prefix stripped from category names
 *   - Time parser handles HH:MM (24h), H:MM[am|pm] (12h, case-insensitive)
 *   - amount (float) → amount_minor = Math.round(amount * 100) — signed INTEGER
 *   - Upsert via onConflictDoNothing on (user_id, external_id)
 *   - Audit log: one row per importer run (not per transaction), actor='system'
 *   - Batch inserts in chunks of 100
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

interface CliArgs {
  file: string;
  userEmail: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let file = '';
  let userEmail = '';
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--file' && args[i + 1]) {
      file = args[++i] as string;
    } else if (arg === '--user-email' && args[i + 1]) {
      userEmail = args[++i] as string;
    }
  }

  if (!file) {
    process.stderr.write('Error: --file <csv-path> is required\n');
    process.stderr.write(
      'Usage: pnpm import:cashflow -- --file "db backups/cashflow_export.csv" --user-email admin@hud.local [--dry-run]\n',
    );
    process.exit(1);
  }
  if (!userEmail) {
    process.stderr.write('Error: --user-email <email> is required\n');
    process.exit(1);
  }

  return { file, userEmail, dryRun };
}

// ---------------------------------------------------------------------------
// CSV parser — handles quoted fields with embedded commas/newlines
// ---------------------------------------------------------------------------

/** Parse a single CSV field starting at startIdx. Returns value + next index. */
function parseCsvField(line: string, startIdx: number): { value: string; nextIdx: number } {
  let current = '';
  let i = startIdx;
  const inQuote = line[i] === '"';
  if (inQuote) i++;

  while (i < line.length) {
    const ch = line[i] as string;
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          i++; // closing quote
          break;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === ',') break;
      current += ch;
      i++;
    }
  }
  return { value: current, nextIdx: i };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;

  while (i <= line.length) {
    const { value, nextIdx } = parseCsvField(line, i);
    fields.push(value);
    i = nextIdx;
    if (i < line.length && line[i] === ',') {
      i++;
    } else {
      break;
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Normalization errors
// ---------------------------------------------------------------------------

class ParseError extends Error {
  constructor(
    message: string,
    public readonly context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

// ---------------------------------------------------------------------------
// 1. amount → amount_minor (signed integer, never float)
// ---------------------------------------------------------------------------

function amountToMinor(raw: string): number {
  const f = Number.parseFloat(raw.trim());
  if (!Number.isFinite(f)) {
    throw new ParseError('amount not finite', { raw });
  }
  const minor = Math.round(f * 100);
  if (!Number.isSafeInteger(minor)) {
    throw new ParseError('amount out of safe integer range', { raw });
  }
  return minor;
}

// ---------------------------------------------------------------------------
// 2. Time parser: handles 24h (HH:MM) and 12h (H:MM[am|pm]) — case-insensitive
// ---------------------------------------------------------------------------

const TIME_24H = /^(\d{1,2}):(\d{2})$/;
const TIME_12H = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/;

function parseTime(raw: string): { hh: number; mm: number } {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { hh: 0, mm: 0 };
  }

  const m12 = trimmed.match(TIME_12H);
  if (m12) {
    let hh = Number(m12[1]) % 12; // 12 AM → 0, 12 PM → 12
    const mm = Number(m12[2]);
    if (/[Pp]/.test((m12[3] as string)[0] as string)) hh += 12;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      throw new ParseError('time out of range', { raw });
    }
    return { hh, mm };
  }

  const m24 = trimmed.match(TIME_24H);
  if (m24) {
    const hh = Number(m24[1]);
    const mm = Number(m24[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      throw new ParseError('time out of range', { raw });
    }
    return { hh, mm };
  }

  throw new ParseError('time format not recognized', { raw });
}

// ---------------------------------------------------------------------------
// 3. Date + time + timezone → ISO-8601 with offset
// ---------------------------------------------------------------------------

const TIMEZONE_OFFSETS: Record<string, string> = {
  PHT: '+08:00',
  PST: '+08:00', // Philippine Standard Time (alias)
  UTC: '+00:00',
};

function buildOccurredAt(date: string, time: string, tz: string): string {
  const dateTrimmed = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed)) {
    throw new ParseError('date format not YYYY-MM-DD', { date });
  }
  const { hh, mm } = parseTime(time);
  const offset = TIMEZONE_OFFSETS[tz.trim().toUpperCase()];
  if (!offset) {
    throw new ParseError('unknown timezone', { tz });
  }
  const hStr = String(hh).padStart(2, '0');
  const mStr = String(mm).padStart(2, '0');
  return `${dateTrimmed}T${hStr}:${mStr}:00${offset}`;
}

// ---------------------------------------------------------------------------
// 4. Category normalization — strip leading emoji + title-case
// ---------------------------------------------------------------------------

// Match leading Extended_Pictographic characters (emoji) plus variation selectors,
// zero-width joiners, and surrounding whitespace.
// Using alternation instead of character class to avoid combining-character issues.
const EMOJI_PREFIX = /^(?:\p{Extended_Pictographic}|️|‍|\s)+/u;

function normalizeCategory(raw: string): string {
  let s = (raw ?? '').replace(EMOJI_PREFIX, '');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return s.length === 0 ? 'Other' : s;
}

// ---------------------------------------------------------------------------
// 5. Currency validation
// ---------------------------------------------------------------------------

const SUPPORTED_CURRENCIES = new Set(['PHP', 'USD']);

function validateCurrency(raw: string): string {
  const c = raw.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(c)) {
    throw new ParseError('unsupported currency', { raw });
  }
  return c;
}

// ---------------------------------------------------------------------------
// CSV row types
// ---------------------------------------------------------------------------

interface CsvRow {
  id: string;
  item: string;
  amount: string;
  currency: string;
  date: string;
  time: string;
  timezone: string;
  category: string;
  notes: string;
}

interface NormalizedRow {
  externalId: string;
  item: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  categoryName: string; // normalized, emoji-free
  notes: string | null;
  source: 'csv-import';
}

interface FailureRecord {
  rowIndex: number;
  raw: Record<string, string>;
  error: string;
}

interface ParseResult {
  normalized: NormalizedRow[];
  failures: FailureRecord[];
  categoryNames: Set<string>;
}

// ---------------------------------------------------------------------------
// CSV loading
// ---------------------------------------------------------------------------

function loadCsv(csvPath: string): { dataLines: string[]; colIdx: (name: string) => number } {
  if (!fs.existsSync(csvPath)) {
    process.stderr.write(`Error: CSV file not found: ${csvPath}\n`);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    process.stderr.write('Error: CSV file has no data rows\n');
    process.exit(1);
  }

  const headerLine = lines[0] as string;
  const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  const requiredColumns = [
    'id',
    'item',
    'amount',
    'currency',
    'date',
    'time',
    'timezone',
    'category',
    'notes',
  ];
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      process.stderr.write(`Error: CSV missing required column: ${col}\n`);
      process.exit(1);
    }
  }

  return {
    dataLines: lines.slice(1),
    colIdx: (name: string) => headers.indexOf(name),
  };
}

// ---------------------------------------------------------------------------
// Row normalization
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI normalization loop — multiple validations per row are inherent to the domain
function normalizeRows(dataLines: string[], colIdx: (name: string) => number): ParseResult {
  const normalized: NormalizedRow[] = [];
  const failures: FailureRecord[] = [];
  const categoryNames = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const fields = parseCsvLine(dataLines[i] as string);

    const raw: CsvRow = {
      id: (fields[colIdx('id')] ?? '').trim(),
      item: (fields[colIdx('item')] ?? '').trim(),
      amount: (fields[colIdx('amount')] ?? '').trim(),
      currency: (fields[colIdx('currency')] ?? '').trim(),
      date: (fields[colIdx('date')] ?? '').trim(),
      time: (fields[colIdx('time')] ?? '').trim(),
      timezone: (fields[colIdx('timezone')] ?? '').trim(),
      category: (fields[colIdx('category')] ?? '').trim(),
      notes: (fields[colIdx('notes')] ?? '').trim(),
    };

    try {
      const externalId = raw.id;
      if (!externalId || !/^\d+$/.test(externalId)) {
        throw new ParseError('external_id must be non-empty all-digit string', { id: raw.id });
      }

      const amountMinor = amountToMinor(raw.amount);
      const currency = validateCurrency(raw.currency);
      const occurredAt = buildOccurredAt(raw.date, raw.time, raw.timezone);
      const categoryName = normalizeCategory(raw.category);
      const notes = raw.notes.length > 0 ? raw.notes : null;

      categoryNames.add(categoryName);
      normalized.push({
        externalId,
        item: raw.item || 'Unknown',
        amountMinor,
        currency,
        occurredAt,
        categoryName,
        notes,
        source: 'csv-import',
      });
    } catch (err) {
      failures.push({
        rowIndex: i + 1,
        raw: raw as unknown as Record<string, string>,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { normalized, failures, categoryNames };
}

// ---------------------------------------------------------------------------
// Write failure records to a JSONL file
// ---------------------------------------------------------------------------

function writeFailures(failures: FailureRecord[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(process.cwd(), 'data', `import-failures-${timestamp}.jsonl`);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const content = `${failures.map((f) => JSON.stringify(f)).join('\n')}\n`;
    fs.writeFileSync(outPath, content, 'utf-8');
    process.stderr.write(`Failures written to: ${outPath}\n`);
  } catch {
    process.stderr.write(`Warning: could not write failure file to ${outPath}\n`);
    for (const f of failures) {
      process.stderr.write(`  Row ${f.rowIndex}: ${f.error} — ${JSON.stringify(f.raw)}\n`);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { file, userEmail, dryRun } = parseArgs(process.argv);
  const startMs = Date.now();

  process.stdout.write(`HUD cashflow importer — ${new Date().toISOString()}\n`);
  process.stdout.write(`Source:       ${file}\n`);
  process.stdout.write(`User:         ${userEmail}\n`);
  process.stdout.write(`Mode:         ${dryRun ? 'dry-run' : 'live'}\n`);

  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const csvPath = path.resolve(projectRoot, file);

  const { dataLines, colIdx } = loadCsv(csvPath);
  process.stdout.write(`Read:         ${dataLines.length} rows\n`);

  const { normalized, failures, categoryNames } = normalizeRows(dataLines, colIdx);
  process.stdout.write(`Parsed:       ${normalized.length}\n`);

  if (dryRun) {
    const sortedCats = [...categoryNames].sort();
    process.stdout.write('\nNormalized categories:\n');
    for (const cat of sortedCats) {
      process.stdout.write(`  - ${cat}\n`);
    }
    process.stdout.write('\n');
    process.stdout.write('Inserted:     (dry-run — no writes)\n');
    process.stdout.write('Skipped:      (dry-run — no writes)\n');
    process.stdout.write(`Failed:       ${failures.length}\n`);
    process.stdout.write(`Wallclock:    ${Date.now() - startMs}ms\n`);
    if (failures.length > 0) {
      writeFailures(failures);
      process.exit(2);
    }
    process.exit(0);
  }

  // Live run — lazily import DB (dry-run never touches DB)
  const { db } = await import('../lib/db/index.js');
  const { users, transactions, categories } = await import('@hud/db');
  const { writeAuditLog } = await import('../lib/audit/index.js');
  const { eq, and } = await import('drizzle-orm');

  const user = db.select().from(users).where(eq(users.email, userEmail.toLowerCase())).get();
  if (!user) {
    process.stderr.write(`Error: user with email "${userEmail}" not found in the database\n`);
    process.stderr.write('Tip: run pnpm db:seed or pnpm db:migrate first, then sign up.\n');
    process.exit(1);
  }

  const userId = user.id;
  process.stdout.write(`User ID:      ${userId}\n`);

  let inserted = 0;
  let skipped = 0;
  const newCategoryNames: string[] = [];

  const CHUNK_SIZE = 100;
  for (let start = 0; start < normalized.length; start += CHUNK_SIZE) {
    const chunk = normalized.slice(start, start + CHUNK_SIZE);

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transaction callback — findOrCreate + insert + audit per row is irreducible
    db.transaction((tx) => {
      for (const row of chunk) {
        // findOrCreate category
        const existing = tx
          .select({ id: categories.id })
          .from(categories)
          .where(and(eq(categories.userId, userId), eq(categories.name, row.categoryName)))
          .get();

        let categoryId: number;
        if (existing) {
          categoryId = existing.id;
        } else {
          const kind =
            row.amountMinor < 0 ? 'expense' : row.amountMinor > 0 ? 'income' : 'transfer';
          const newCat = tx
            .insert(categories)
            .values({ userId, name: row.categoryName, kind })
            .returning({ id: categories.id })
            .get();
          if (!newCat) throw new Error(`Failed to insert category "${row.categoryName}"`);
          newCategoryNames.push(row.categoryName);
          categoryId = newCat.id;
        }

        const result = tx
          .insert(transactions)
          .values({
            userId,
            item: row.item,
            amountMinor: row.amountMinor,
            currency: row.currency,
            occurredAt: row.occurredAt,
            categoryId,
            notes: row.notes,
            source: 'csv-import',
            externalId: row.externalId,
          })
          .onConflictDoNothing()
          .returning({ id: transactions.id })
          .get();

        if (result) {
          writeAuditLog(tx, {
            userId,
            actor: 'system',
            action: 'create',
            entity: 'transaction',
            entityId: String(result.id),
            payload: {
              source: 'csv-import',
              external_id: row.externalId,
              item: row.item,
              amount_minor: row.amountMinor,
              currency: row.currency,
              occurred_at: row.occurredAt,
            },
          });
          inserted++;
        } else {
          skipped++;
        }
      }
    });
  }

  // Importer-level audit summary
  db.transaction((tx) => {
    writeAuditLog(tx, {
      userId,
      actor: 'system',
      action: 'import',
      entity: 'transaction',
      payload: {
        source_path: csvPath,
        row_count: normalized.length + failures.length,
        parsed: normalized.length,
        inserted,
        skipped,
        failed: failures.length,
        new_categories: newCategoryNames,
      },
    });
  });

  process.stdout.write(`Inserted:     ${inserted}\n`);
  process.stdout.write(`Skipped (dup): ${skipped}\n`);
  process.stdout.write(`Failed:       ${failures.length}\n`);
  if (newCategoryNames.length > 0) {
    process.stdout.write(
      `Categories created: ${newCategoryNames.length} (${newCategoryNames.join(', ')})\n`,
    );
  }
  process.stdout.write(`Wallclock:    ${Date.now() - startMs}ms\n`);

  if (failures.length > 0) {
    writeFailures(failures);
    process.exit(2);
  }

  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${msg}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(3);
});
