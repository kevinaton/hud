/**
 * Bearer token authentication for the HTTP/SSE transport.
 *
 * Tokens are verified by argon2id-hashing the incoming bearer token
 * and comparing against hashes stored in mcp-tokens.yaml.
 *
 * No plaintext token ever persists on the HUD server side.
 */

import { readFileSync, statSync } from 'node:fs';
import { verify } from '@node-rs/argon2';
import yaml from 'js-yaml';
import type { AuthResult, TokenEntry, TokensFile } from './types.js';

// ---------------------------------------------------------------------------
// Token store
// ---------------------------------------------------------------------------

export interface TokenStore {
  readonly entries: readonly TokenEntry[];
}

/** Asserts file exists and has mode 600. Throws otherwise. */
function assertMode600(filePath: string, fileLabel: string): void {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    throw new Error(`${fileLabel} not found at ${filePath}`);
  }
  const perms = stat.mode & 0o777;
  if (perms !== 0o600) {
    throw new Error(
      `${fileLabel} at ${filePath} must be mode 600 (got ${perms.toString(8).padStart(3, '0')})`,
    );
  }
}

/** Reads and YAML-parses a file. Throws on read or parse error. */
function readYaml(filePath: string, fileLabel: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read ${fileLabel} at ${filePath}: ${String(e)}`);
  }
  try {
    return yaml.load(raw);
  } catch (e) {
    throw new Error(`Failed to parse ${fileLabel}: ${String(e)}`);
  }
}

/** Validates each token entry in the parsed file. */
function validateTokenEntries(entries: TokenEntry[]): void {
  for (const entry of entries) {
    if (!entry.identity || typeof entry.identity !== 'string') {
      throw new Error('Each token entry must have a string "identity" field');
    }
    if (!entry.tokenHash || typeof entry.tokenHash !== 'string') {
      throw new Error('Each token entry must have a string "tokenHash" field');
    }
  }
}

/**
 * Loads and validates mcp-tokens.yaml.
 *
 * In prod mode the file must exist and have mode 600 (owner-read-only).
 * In dev mode this function is not called; the caller uses a fixture store.
 *
 * @throws if the file does not exist, cannot be parsed, or has wrong permissions.
 */
export function loadTokenStore(filePath: string, requireMode600 = true): TokenStore {
  if (requireMode600) {
    assertMode600(filePath, 'mcp-tokens.yaml');
  }

  const parsed = readYaml(filePath, 'mcp-tokens.yaml');

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('tokens' in parsed) ||
    !Array.isArray((parsed as { tokens: unknown }).tokens)
  ) {
    throw new Error('mcp-tokens.yaml must have a top-level "tokens" array');
  }

  const file = parsed as TokensFile;
  validateTokenEntries(file.tokens);

  return { entries: file.tokens };
}

/**
 * Builds a fixture token store for dev mode.
 *
 * The dev token is the plaintext string "devtoken". Instead of pre-hashing
 * (which requires async), we use a sentinel and do a plaintext compare
 * in verifyBearer when devMode=true.
 */
export function buildDevTokenStore(): TokenStore {
  return {
    entries: [
      {
        identity: 'platform:test-dev',
        // Sentinel value — dev-mode checks bypass argon2 and do plaintext compare
        tokenHash: '__dev__',
      },
    ],
  };
}

/** The hardcoded dev token plaintext — only used when HUD_MCP_MODE=dev. */
export const DEV_TOKEN_PLAINTEXT = 'devtoken';

/**
 * Verifies an incoming bearer token against the token store.
 *
 * For dev mode, does a constant-time plaintext comparison against DEV_TOKEN_PLAINTEXT.
 * For prod mode, performs argon2id verify against the stored hash.
 */
export async function verifyBearer(
  authHeader: string | undefined,
  store: TokenStore,
  devMode: boolean,
): Promise<AuthResult> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, reason: 'missing_token' };
  }

  const incoming = authHeader.slice('Bearer '.length).trim();
  if (!incoming) {
    return { ok: false, reason: 'missing_token' };
  }

  if (devMode) {
    return verifyDevToken(incoming);
  }

  return verifyProdToken(incoming, store);
}

/** Constant-time plaintext compare for dev mode. */
function verifyDevToken(incoming: string): AuthResult {
  const a = Buffer.from(incoming, 'utf8');
  const b = Buffer.from(DEV_TOKEN_PLAINTEXT, 'utf8');
  const maxLen = Math.max(a.length, b.length);
  const aPad = Buffer.alloc(maxLen, 0);
  const bPad = Buffer.alloc(maxLen, 0);
  a.copy(aPad);
  b.copy(bPad);
  let diff = 0;
  for (let i = 0; i < maxLen; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounded loop
    diff |= aPad[i]! ^ bPad[i]!;
  }
  if (diff === 0) {
    return { ok: true, identity: 'platform:test-dev' };
  }
  return { ok: false, reason: 'invalid_token' };
}

/** argon2id verify against stored hashes for prod mode. */
async function verifyProdToken(incoming: string, store: TokenStore): Promise<AuthResult> {
  for (const entry of store.entries) {
    try {
      const matched = await verify(entry.tokenHash, incoming);
      if (matched) {
        return { ok: true, identity: entry.identity };
      }
    } catch {
      // argon2 verify can throw on malformed hashes — treat as non-match
    }
  }
  return { ok: false, reason: 'invalid_token' };
}
