/**
 * lib/audit/__tests__/actor-constraint.test.ts
 *
 * Verifies that the audit_log.actor CHECK constraint is correctly enforced by SQLite.
 *
 * Allowed patterns (per migration 0003_extend_audit_actor_platform.sql):
 *   - 'user'                  — browser session
 *   - 'anon'                  — pre-auth events (login attempt, signup)
 *   - 'system'                — migrations, seeders, CLI scripts
 *   - 'agent:<persona>/<cli>' — HUD-internal agent tool calls (prefix-based; new personas/CLIs need no migration)
 *   - 'platform:<name>'       — foreign platform calling the MCP daemon (e.g. 'platform:hermes-gateway')
 *
 * Rejected: any value that doesn't match the above patterns.
 */

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Build an in-memory SQLite DB with the same CHECK constraint as migration 0003
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
        actor = 'user' OR actor = 'anon' OR actor = 'system' OR actor LIKE 'agent:%/%' OR actor LIKE 'platform:_%'
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

  // platform:<name> — new tier (migration 0003), for foreign platforms calling the MCP daemon
  it("accepts 'platform:hermes-gateway'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'platform:hermes-gateway')).not.toThrow();
    db.close();
  });

  it("accepts 'platform:hermes-macbook-a'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'platform:hermes-macbook-a')).not.toThrow();
    db.close();
  });

  it("accepts future platform pattern 'platform:any-future-system'", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'platform:any-future-system')).not.toThrow();
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

  // platform: edge cases
  it("rejects 'platform:' (empty suffix after colon)", () => {
    const db = buildDb();
    // LIKE 'platform:_%' — the underscore requires exactly one character, then %
    // matches zero or more. So 'platform:' (nothing after the colon) is correctly rejected.
    expect(() => insertAuditRow(db, 'platform:')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'platforms:hermes' (wrong prefix — extra 's')", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'platforms:hermes')).toThrow(/CHECK constraint failed/i);
    db.close();
  });

  it("rejects 'platform' (no colon, no suffix)", () => {
    const db = buildDb();
    expect(() => insertAuditRow(db, 'platform')).toThrow(/CHECK constraint failed/i);
    db.close();
  });
});
