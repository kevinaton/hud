/**
 * lib/audit/__tests__/actor-constraint.test.ts
 *
 * Verifies that the audit_log.actor CHECK constraint is correctly enforced by SQLite.
 *
 * Allowed patterns (per migration 0002_glorious_lady_ursula.sql):
 *   - 'user'                  — browser session
 *   - 'anon'                  — pre-auth events (login attempt, signup)
 *   - 'system'                — migrations, seeders, CLI scripts
 *   - 'agent:<persona>/<cli>' — agent tool calls (prefix-based; new personas/CLIs need no migration)
 *
 * Rejected: any value that doesn't match the above patterns.
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Build an in-memory SQLite DB with the same CHECK constraint as the migration
// ---------------------------------------------------------------------------
function buildDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      payload_json TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CONSTRAINT chk_audit_actor CHECK(
        actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%'
      )
    );
  `);
  return db;
}

function insertAuditRow(db: Database.Database, actor: string): void {
  db.prepare(
    `INSERT INTO audit_log (actor, action, entity) VALUES (?, 'create', 'transaction')`,
  ).run(actor);
}

// ---------------------------------------------------------------------------
// Valid actors: constraint must accept all of these
// ---------------------------------------------------------------------------
describe('audit_log actor CHECK constraint — valid actors accepted', () => {
  it("accepts 'user'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'user')).not.toThrow();
    db.close();
  });

  it("accepts 'anon'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'anon')).not.toThrow();
    db.close();
  });

  it("accepts 'system'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'system')).not.toThrow();
    db.close();
  });

  it("accepts 'agent:emily/gemini'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent:emily/gemini')).not.toThrow();
    db.close();
  });

  it("accepts 'agent:emily/claude'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent:emily/claude')).not.toThrow();
    db.close();
  });

  it("accepts 'agent:emily/opencode'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent:emily/opencode')).not.toThrow();
    db.close();
  });

  it("accepts future persona pattern 'agent:ops/gemini'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent:ops/gemini')).not.toThrow();
    db.close();
  });

  it("accepts Telegram bridge pattern 'agent:telegram-emily/gemini'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent:telegram-emily/gemini')).not.toThrow();
    db.close();
  });
});

// ---------------------------------------------------------------------------
// Invalid actors: constraint must reject these
// ---------------------------------------------------------------------------
describe('audit_log actor CHECK constraint — invalid actors rejected', () => {
  it("rejects 'bad-value'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'bad-value')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'agent' (no colon, no persona, no cli)", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'agent')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'agent:emily' (missing /<cli> segment — no slash)", () => {
    const db = buildDb();
    // 'agent:emily' has no '/' so LIKE 'agent:%/%' does not match
    expect(() => insertAuditRow(db, 'agent:emily')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects '' (empty string)", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, '')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'random-string'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'random-string')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'agent-emily/gemini' (missing colon separator)", () => {
    const db = buildDb();
    // Does not start with 'agent:' — LIKE 'agent:%/%' requires the literal 'agent:'
    expect(() => insertAuditRow(db, 'agent-emily/gemini')).toThrow(/CHECK constraint failed/i);
    db.close();
  });
});
