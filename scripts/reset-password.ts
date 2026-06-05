#!/usr/bin/env tsx
/**
 * scripts/reset-password.ts
 *
 * CLI: pnpm db:reset-password <email> <new-password>
 *
 * - Updates password_hash for the given email
 * - Does NOT print credentials to stdout
 * - Writes audit_log with action='password_reset', actor='system'
 * - Exits with code 1 on failure
 *
 * Usage:
 *   tsx scripts/reset-password.ts user@example.com newpassword123
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Ensure DATABASE_URL is set before importing db
// In scripts, we need to resolve the db path relative to project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${path.join(projectRoot, 'data/hud.db')}`;
}

// Dynamic imports after env is set
const { db } = await import('../apps/web/lib/db/index.js');
const { writeAuditLog } = await import('../apps/web/lib/audit/index.js');
const { hashPassword, MIN_PASSWORD_LENGTH } = await import('../apps/web/lib/auth/password.js');
const { users } = await import('../packages/db/schema.js');
const { eq } = await import('drizzle-orm');

const [, , emailArg, passwordArg] = process.argv;

if (!emailArg || !passwordArg) {
  process.stderr.write('Usage: tsx scripts/reset-password.ts <email> <new-password>\n');
  process.exit(1);
}

const email = emailArg.toLowerCase().trim();
const password = passwordArg;

if (password.length < MIN_PASSWORD_LENGTH) {
  process.stderr.write(`Error: Password must be at least ${MIN_PASSWORD_LENGTH} characters.\n`);
  process.exit(1);
}

// Look up user
const user = db.select().from(users).where(eq(users.email, email)).get();
if (!user) {
  process.stderr.write(`Error: No user found with email: ${email}\n`);
  process.exit(1);
}

// Hash new password
const passwordHash = await hashPassword(password);

// Update + audit in one transaction
db.transaction((tx) => {
  tx.update(users)
    .set({
      passwordHash,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id))
    .run();

  writeAuditLog(tx, {
    userId: user.id,
    actor: 'system',
    action: 'password_reset',
    entity: 'user',
    entityId: String(user.id),
    payload: {
      email_hint: email.replace(/^(.).*@/, '$1***@'),
      reset_by: 'cli',
    },
    ipAddress: undefined,
    userAgent: undefined,
  });
});

process.stdout.write(`Password updated for user ID ${user.id}.\n`);
process.exit(0);
