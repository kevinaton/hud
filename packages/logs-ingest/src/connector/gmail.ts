/**
 * packages/logs-ingest/src/connector/gmail.ts
 *
 * Gmail API read-only connector — whitelist query + DKIM gate + raw storage.
 *
 * Security invariants per blueprint §1:
 *   - Scope: gmail.readonly only — connector never sends, deletes, or marks-as-read.
 *   - DKIM gate: messages without dkim=pass for d=airbnb.com → status='rejected',
 *     reason='dkim_fail'. Never reaches parsers or ledger.
 *   - Whitelist-first: q query built from enabled log_whitelist rows only.
 *   - Store raw BEFORE parsing. Raw headers + body land in log_raw first.
 *   - Idempotency: Gmail message.id → log_entries.external_ref UNIQUE.
 *   - Rate limit: cap at MAX_MESSAGES_PER_RUN messages and MAX_BODY_BYTES per message.
 */

import type { LogWhitelist } from '@hud/db';

// ---------------------------------------------------------------------------
// Constants — adjust here if limits need tuning
// ---------------------------------------------------------------------------
export const MAX_MESSAGES_PER_RUN = 200;
export const MAX_BODY_BYTES = 512 * 1024; // 512 KB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GmailCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

export interface FetchedMessage {
  id: string;
  threadId: string;
  internalDate: string; // Unix ms timestamp as string (from Gmail API)
  headers: Record<string, string>; // name → value (lowercased name)
  bodyText: string | null;
  bodyHtml: string | null;
  rawHeadersJson: string; // JSON-serialized full headers array
}

// ---------------------------------------------------------------------------
// buildWhitelistQuery
//
// Builds a Gmail API `q` search string from enabled whitelist rows.
// Only whitelisted senders are ever fetched.
//
// e.g. for ['automated@airbnb.com']:
//   from:(automated@airbnb.com) newer_than:365d
// ---------------------------------------------------------------------------
export function buildWhitelistQuery(whitelist: LogWhitelist[], sinceDate?: string): string | null {
  const senders = whitelist.filter((w) => w.enabled === 1).map((w) => w.sender);

  if (senders.length === 0) {
    return null; // Nothing to fetch — no enabled whitelist entries
  }

  const fromClause = `from:(${senders.join(' OR ')})`;
  const dateClause = sinceDate ? `after:${sinceDate}` : 'newer_than:730d';

  return `${fromClause} ${dateClause}`;
}

// ---------------------------------------------------------------------------
// checkDkim
//
// Returns true if the Authentication-Results header contains a valid DKIM
// pass for the given domain.
//
// The header looks like (one or more lines may be combined by Gmail):
//   Authentication-Results: mx.google.com;
//     dkim=pass header.i=@airbnb.com header.s=... header.b=...;
//
// We accept the message only if at least one DKIM entry is 'pass' and
// the header.i (identity) contains the expected domain.
// ---------------------------------------------------------------------------
export function checkDkim(authResultsHeader: string | undefined, domain: string): boolean {
  if (!authResultsHeader) return false;

  // Split on semicolons to get individual authentication results
  const parts = authResultsHeader.split(';');

  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();

    // Must be a DKIM result
    if (!trimmed.startsWith('dkim=')) continue;

    // Must be 'pass'
    if (!trimmed.startsWith('dkim=pass')) continue;

    // Must reference the expected domain or any subdomain of it.
    // Airbnb sends via email.airbnb.com (SendGrid), so header.i=@email.airbnb.com
    // Accept: @airbnb.com  OR  @<sub>.airbnb.com  OR  d=airbnb.com
    const domainLower = domain.toLowerCase();
    if (
      trimmed.includes(`@${domainLower}`) ||
      trimmed.includes(`.${domainLower}`) ||
      trimmed.includes(`d=${domainLower}`)
    ) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// refreshAccessToken
//
// Exchanges a refresh token for a new access token using Google's token
// endpoint. Returns the new access token.
// ---------------------------------------------------------------------------
export async function refreshAccessToken(creds: GmailCredentials): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail token refresh failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

// ---------------------------------------------------------------------------
// listMessageIds
//
// Fetches message IDs matching the given query. Paginates up to
// MAX_MESSAGES_PER_RUN messages. Returns an array of Gmail message IDs.
// ---------------------------------------------------------------------------
export async function listMessageIds(
  accessToken: string,
  query: string,
  pageToken?: string,
  accumulated: string[] = [],
): Promise<string[]> {
  if (accumulated.length >= MAX_MESSAGES_PER_RUN) {
    return accumulated.slice(0, MAX_MESSAGES_PER_RUN);
  }

  const params = new URLSearchParams({
    q: query,
    maxResults: String(Math.min(100, MAX_MESSAGES_PER_RUN - accumulated.length)),
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail messages.list failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    messages?: { id: string }[];
    nextPageToken?: string;
  };

  const ids = (json.messages ?? []).map((m) => m.id);
  const all = [...accumulated, ...ids];

  if (json.nextPageToken && all.length < MAX_MESSAGES_PER_RUN) {
    return listMessageIds(accessToken, query, json.nextPageToken, all);
  }

  return all.slice(0, MAX_MESSAGES_PER_RUN);
}

// ---------------------------------------------------------------------------
// fetchMessageDetail
//
// Fetches a single message's full content (format=full).
// Extracts headers, body_text, body_html.
// Enforces MAX_BODY_BYTES limit on the raw body parts.
// ---------------------------------------------------------------------------
export async function fetchMessageDetail(
  accessToken: string,
  messageId: string,
): Promise<FetchedMessage> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gmail messages.get failed for ${messageId} (${res.status}): ${body}`);
  }

  const msg = (await res.json()) as GmailApiMessage;

  // Build header map (lowercased keys for easy lookup)
  const rawHeaders: { name: string; value: string }[] = msg.payload?.headers ?? [];
  const headers: Record<string, string> = {};
  for (const h of rawHeaders) {
    headers[h.name.toLowerCase()] = h.value;
  }

  // Extract body parts
  const { bodyText, bodyHtml } = extractBodyParts(msg.payload, 0);

  return {
    id: msg.id,
    threadId: msg.threadId,
    internalDate: msg.internalDate,
    headers,
    bodyText,
    bodyHtml,
    rawHeadersJson: JSON.stringify(rawHeaders),
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface GmailApiMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload?: GmailPayload;
}

interface GmailPayload {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPayload[];
}

function decodeBase64Url(encoded: string): string {
  // Gmail uses URL-safe base64 (- and _ instead of + and /)
  const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(standard, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function extractBodyParts(
  payload: GmailPayload | undefined,
  depth: number,
): { bodyText: string | null; bodyHtml: string | null } {
  if (!payload || depth > 10) return { bodyText: null, bodyHtml: null };

  const mimeType = payload.mimeType ?? '';

  // Leaf node with body data
  if (payload.body?.data && !payload.parts?.length) {
    const decoded = decodeBase64Url(payload.body.data);
    // Enforce body size limit
    const truncated = decoded.length > MAX_BODY_BYTES ? decoded.slice(0, MAX_BODY_BYTES) : decoded;

    if (mimeType === 'text/plain') return { bodyText: truncated, bodyHtml: null };
    if (mimeType === 'text/html') return { bodyText: null, bodyHtml: truncated };
    return { bodyText: null, bodyHtml: null };
  }

  // Multipart — recurse into parts and merge results
  if (payload.parts?.length) {
    let bodyText: string | null = null;
    let bodyHtml: string | null = null;

    for (const part of payload.parts) {
      const { bodyText: pt, bodyHtml: ph } = extractBodyParts(part, depth + 1);
      if (pt) bodyText = (bodyText ?? '') + pt;
      if (ph) bodyHtml = (bodyHtml ?? '') + ph;
    }

    return { bodyText, bodyHtml };
  }

  return { bodyText: null, bodyHtml: null };
}
