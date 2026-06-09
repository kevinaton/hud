/**
 * Shared types for the HTTP/SSE transport layer.
 */

/** A resolved bearer-token identity (loaded from mcp-tokens.yaml). */
export interface TokenEntry {
  /** The identity string written to audit_log.actor, e.g. 'platform:hermes-gateway' */
  identity: string;
  /** argon2id hash of the token, e.g. "$argon2id$v=19$..." */
  tokenHash: string;
}

/** Parsed mcp-tokens.yaml structure. */
export interface TokensFile {
  tokens: TokenEntry[];
}

/** One ACL entry (per identity) from mcp-acl.yaml. */
export interface AclEntry {
  allow?: string[];
  deny?: string[];
}

/** Parsed mcp-acl.yaml structure. */
export interface AclFile {
  identities: Record<string, AclEntry>;
}

/** Result of a token auth check. */
export type AuthResult =
  | { ok: true; identity: string }
  | { ok: false; reason: 'missing_token' | 'invalid_token' };

/** Result of an ACL tool-access check. */
export type AclResult = { allowed: true } | { allowed: false; reason: string };
