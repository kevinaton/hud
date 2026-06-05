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
import * as readline from 'node:readline';

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

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (inQuote) {
      if (ch === '"') {
        // Check for escaped double-quote ""
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
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

  // Empty time field — default to midnight (00:00)
  if (trimmed.length === 0) {
    return { hh: 0, mm: 0 };
  }

  let m: RegExpMatchArray | null;

  if ((m = trimmed.match(TIME_12H))) {
    let hh = Number(m[1]) % 12; // 12 AM → 0, 12 PM → 12
    const mm = Number(m[2]);
    if (/[Pp]/.test((m[3] as string)[0] as string)) hh += 12;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      throw new ParseError('time out of range', { raw });
    }
    return { hh, mm };
  }

  if ((m = trimmed.match(TIME_24H))) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
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

// Matches leading Extended_Pictographic characters and combining sequences.
// The EMOJI_PREFIX from the skill uses Extended_Pictographic.
const EMOJI_PREFIX = /^[\p{Extended_Pictographic}\u{FE0F}\u{200D}\s]+/u;

function normalizeCategory(raw: string): string {
  let s = (raw ?? '').replace(EMOJI_PREFIX, '');
  s = s.replace(/\s+/g, ' ').trim();
  // Title-case: uppercase first letter of each word
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
// CSV row type
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

  // -------------------------------------------------------------------------
  // Resolve the CSV path relative to the project root (two levels up from
  // apps/web/scripts/), because the CLI is invoked from the workspace root.
  // -------------------------------------------------------------------------
  const projectRoot = path.resolve(__dirname, '..', '..', '..');
  const csvPath = path.resolve(projectRoot, file);

  if (!fs.existsSync(csvPath)) {
    process.stderr.write(`Error: CSV file not found: ${csvPath}\n`);
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Read and parse CSV
  // -------------------------------------------------------------------------
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    process.stderr.write('Error: CSV file has no data rows\n');
    process.exit(1);
  }

  const headerLine = lines[0] as string;
  const headers = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());

  const requiredColumns = ['id', 'item', 'amount', 'currency', 'date', 'time', 'timezone', 'category', 'notes'];
  for (const col of requiredColumns) {
    if (!headers.includes(col)) {
      process.stderr.write(`Error: CSV missing required column: ${col}\n`);
      process.exit(1);
    }
  }

  const colIdx = (name: string): number => headers.indexOf(name);

  const dataLines = lines.slice(1);
  process.stdout.write(`Read:         ${dataLines.length} rows\n`);

  // -------------------------------------------------------------------------
  // Normalize rows
  // -------------------------------------------------------------------------
  const normalized: NormalizedRow[] = [];
  const failures: FailureRecord[] = [];
  const categoryNames = new Set<string>();

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i] as string;
    const fields = parseCsvLine(line);

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
      // Validate external_id
      const externalId = raw.id.trim();
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
      const errMsg = err instanceof Error ? err.message : String(err);
      failures.push({
        rowIndex: i + 1, // 1-based, skip header
        raw: raw as unknown as Record<string, string>,
        error: errMsg,
      });
    }
  }

  process.stdout.write(`Parsed:       ${normalized.length}\n`);

  // -------------------------------------------------------------------------
  // Dry-run: report only, zero DB writes
  // -------------------------------------------------------------------------
  if (dryRun) {
    const sortedCats = [...categoryNames].sort();
    process.stdout.write('\nNormalized categories:\n');
    for (const cat of sortedCats) {
      process.stdout.write(`  - ${cat}\n`);
    }
    process.stdout.write('\n');
    process.stdout.write(`Inserted:     (dry-run — no writes)\n`);
    process.stdout.write(`Skipped:      (dry-run — no writes)\n`);
    process.stdout.write(`Failed:       ${failures.length}\n`);
    process.stdout.write(`Wallclock:    ${Date.now() - startMs}ms\n`);

    if (failures.length > 0) {
      writeFailures(failures);
      process.exit(2);
    }
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Live run — initialize DB
  // -------------------------------------------------------------------------
  // Import DB lazily so dry-run doesn't require a DB connection.
  // The tsconfig paths (@/*) won't resolve in tsx without the Next.js bundler,
  // so we use relative paths here.
  const { db } = await import('../lib/db/index.js');
  const { users, transactions, categories } = await import('@hud/db');
  const { writeAuditLog } = await import('../lib/audit/index.js');
  const { eq, and } = await import('drizzle-orm');

  // Look up user by email
  const user = db.select().from(users).where(eq(users.email, userEmail.toLowerCase())).get();
  if (!user) {
    process.stderr.write(`Error: user with email "${userEmail}" not found in the database\n`);
    process.stderr.write('Tip: run pnpm db:seed or pnpm db:migrate first, then sign up.\n');
    process.exit(1);
  }

  const userId = user.id;
  process.stdout.write(`User ID:      ${userId}\n`);

  // -------------------------------------------------------------------------
  // Insert in batches of 100
  // -------------------------------------------------------------------------
  let inserted = 0;
  let skipped = 0;
  const newCategoryNames: string[] = [];

  // Helper: findOrCreate category within a transaction
  function findOrCreateCategoryInTx(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    name: string,
    amountMinorForKind: number,
  ): number {
    const existing = tx
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.name, name)))
      .get();

    if (existing) return existing.id;

    const kind = amountMinorForKind < 0 ? 'expense' : amountMinorForKind > 0 ? 'income' : 'transfer';

    const inserted = tx
      .insert(categories)
      .values({ userId, name, kind })
      .returning({ id: categories.id })
      .get();

    if (!inserted) throw new Error(`Failed to insert category "${name}"`);
    newCategoryNames.push(name);
    return inserted.id;
  }

  // Process in chunks of 100
  const CHUNK_SIZE = 100;
  for (let chunkStart = 0; chunkStart < normalized.length; chunkStart += CHUNK_SIZE) {
    const chunk = normalized.slice(chunkStart, chunkStart + CHUNK_SIZE);

    db.transaction((tx) => {
      for (const row of chunk) {
        const categoryId = findOrCreateCategoryInTx(tx, row.categoryName, row.amountMinor);

        // onConflictDoNothing on (user_id, external_id) partial unique index
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
          // Write per-transaction audit row per ticket AC
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

  // Write importer-level audit summary
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

  // -------------------------------------------------------------------------
  // Print summary
  // -------------------------------------------------------------------------
  process.stdout.write(`Inserted:     ${inserted}\n`);
  process.stdout.write(`Skipped (dup): ${skipped}\n`);
  process.stdout.write(`Failed:       ${failures.length}\n`);
  if (newCategoryNames.length > 0) {
    process.stdout.write(`Categories created: ${newCategoryNames.length} (${newCategoryNames.join(', ')})\n`);
  }
  process.stdout.write(`Wallclock:    ${Date.now() - startMs}ms\n`);

  if (failures.length > 0) {
    writeFailures(failures);
    process.exit(2);
  }

  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write failure records to a JSONL file
// ---------------------------------------------------------------------------

function writeFailures(failures: FailureRecord[]): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(process.cwd(), 'data', `import-failures-${timestamp}.jsonl`);
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const content = failures.map((f) => JSON.stringify(f)).join('\n') + '\n';
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
// Entry point
// ---------------------------------------------------------------------------

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${msg}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(err.stack + '\n');
  }
  process.exit(3);
});
