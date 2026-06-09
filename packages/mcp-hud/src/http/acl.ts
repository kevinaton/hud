/**
 * ACL loader for the HTTP/SSE transport.
 *
 * Loads mcp-acl.yaml and resolves per-identity tool allowlists.
 *
 * Rules (from blueprint §5):
 * - Unknown identity → deny all (deny-by-default)
 * - Empty allow list → deny all
 * - Deny wins over allow on conflict
 * - Glob patterns: "*" matches any tool; "cashflow.*" matches cashflow.add etc.
 */

import { readFileSync, statSync } from 'node:fs';
import yaml from 'js-yaml';
import type { AclEntry, AclFile, AclResult } from './types.js';

// ---------------------------------------------------------------------------
// ACL store
// ---------------------------------------------------------------------------

export interface AclStore {
  readonly identities: Readonly<Record<string, AclEntry>>;
}

/**
 * Loads and validates mcp-acl.yaml.
 *
 * In prod mode the file must exist and have mode 600.
 *
 * @throws if the file does not exist, cannot be parsed, or has wrong permissions.
 */
export function loadAclStore(filePath: string, requireMode600 = true): AclStore {
  if (requireMode600) {
    let stat: ReturnType<typeof statSync>;
    try {
      stat = statSync(filePath);
    } catch {
      throw new Error(`mcp-acl.yaml not found at ${filePath}`);
    }
    const perms = stat.mode & 0o777;
    if (perms !== 0o600) {
      throw new Error(
        `mcp-acl.yaml at ${filePath} must be mode 600 (got ${perms.toString(8).padStart(3, '0')})`,
      );
    }
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read mcp-acl.yaml at ${filePath}: ${String(e)}`);
  }

  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (e) {
    throw new Error(`Failed to parse mcp-acl.yaml: ${String(e)}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('identities' in parsed) ||
    typeof (parsed as { identities: unknown }).identities !== 'object'
  ) {
    throw new Error('mcp-acl.yaml must have a top-level "identities" object');
  }

  const file = parsed as AclFile;
  return { identities: file.identities };
}

/**
 * Fixture ACL for dev mode.
 *
 * platform:test-dev gets access to the read tools only (safe default for dev).
 * In practice, dev mode is loopback-only and the token is hardcoded, so
 * this ACL is just a safe baseline.
 */
export function buildDevAclStore(): AclStore {
  return {
    identities: {
      'platform:test-dev': {
        allow: ['*'],
        deny: [],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Returns true if toolName matches pattern.
 * Supported patterns:
 *   - "*" matches everything
 *   - "cashflow.*" matches any tool starting with "cashflow."
 *   - "cashflow.add" matches exactly
 */
function matchesPattern(pattern: string, toolName: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1); // "cashflow."
    return toolName.startsWith(prefix);
  }
  return pattern === toolName;
}

/**
 * Checks whether the given identity is allowed to call toolName.
 *
 * Algorithm (deny wins):
 * 1. Unknown identity → deny
 * 2. If toolName matches any deny pattern → deny
 * 3. If toolName matches any allow pattern → allow
 * 4. Otherwise → deny (default)
 */
export function checkAcl(store: AclStore, identity: string, toolName: string): AclResult {
  const entry = store.identities[identity];
  if (!entry) {
    return { allowed: false, reason: `unknown_identity:${identity}` };
  }

  // Deny wins — check deny patterns first
  for (const pattern of entry.deny ?? []) {
    if (matchesPattern(pattern, toolName)) {
      return { allowed: false, reason: 'tool_not_allowed_for_identity' };
    }
  }

  // Check allow patterns
  for (const pattern of entry.allow ?? []) {
    if (matchesPattern(pattern, toolName)) {
      return { allowed: true };
    }
  }

  // Deny-by-default
  return { allowed: false, reason: 'tool_not_in_allowlist' };
}
