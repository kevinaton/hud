/**
 * lib/db/categories.ts
 *
 * Query helpers for the categories table.
 *
 * Per hud-db skill:
 *   - userId is always the first parameter.
 *   - Write helpers run inside db.transaction with audit when needed.
 *
 * Emoji-strip: same regex pattern as the CSV importer.
 * Category names are stored without leading/trailing emoji or whitespace.
 */

import { categories } from '@hud/db';
import type { Category } from '@hud/db';
import { and, eq } from 'drizzle-orm';
import { db } from './index';

// ---------------------------------------------------------------------------
// Emoji-strip
//
// Removes leading and trailing emoji (and surrounding whitespace) from a
// category name. This matches the normalization rule in the CSV importer.
//
// Strategy: use the \p{Emoji} Unicode property class (ES2018+) to match
// emoji characters in the leading and trailing positions. The /u flag
// enables Unicode property escapes.
// ---------------------------------------------------------------------------
export function stripEmojiFromCategoryName(name: string): string {
  // Remove leading emoji/whitespace, then trailing emoji/whitespace
  return name
    .replace(/^[\p{Emoji}\s]+/u, '')
    .replace(/[\p{Emoji}\s]+$/u, '')
    .trim();
}

// ---------------------------------------------------------------------------
// listCategories
//
// Returns all categories for a user, ordered by name alphabetically.
// ---------------------------------------------------------------------------
export function listCategories(userId: number): Category[] {
  return db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(categories.name)
    .all();
}

// ---------------------------------------------------------------------------
// findOrCreateCategory
//
// Looks up a category by (userId, name) — after stripping emoji — and returns
// its id. If no matching category exists, inserts one with kind='expense' by
// default.
//
// MUST be called inside the same Drizzle transaction as the transaction insert
// (the caller — createTransaction — handles the outer db.transaction wrapper).
//
// Parameters:
//   tx      — the Drizzle transaction object (from db.transaction callback)
//   userId  — the owning user id
//   name    — raw category name (may contain emoji, leading/trailing whitespace)
//
// Returns the category id.
// ---------------------------------------------------------------------------
export function findOrCreateCategory(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  name: string,
): number {
  const normalized = stripEmojiFromCategoryName(name);

  if (!normalized) {
    throw new Error('findOrCreateCategory: category name is empty after emoji strip');
  }

  // Try to find an existing category
  const existing = tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, normalized)))
    .get();

  if (existing) {
    return existing.id;
  }

  // Insert new category with kind='expense' by default
  const inserted = tx
    .insert(categories)
    .values({
      userId,
      name: normalized,
      kind: 'expense',
    })
    .returning({ id: categories.id })
    .get();

  if (!inserted) {
    throw new Error(`findOrCreateCategory: insert returned no row for name "${normalized}"`);
  }

  return inserted.id;
}
