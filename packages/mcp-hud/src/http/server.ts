/**
 * HTTP/SSE transport server for mcp-hud.
 *
 * Wraps the MCP SDK StreamableHTTPServerTransport with:
 *   1. Bearer token authentication (argon2id verify against mcp-tokens.yaml)
 *   2. ACL enforcement (mcp-acl.yaml) — deny-by-default, deny wins over allow
 *   3. Per-identity token-bucket rate limiting (60 writes/min, 600 reads/min, burst 10)
 *   4. Per-call audit logging via AsyncLocalStorage (tool handlers pick up identity)
 *   5. Structured metric log line per call: mcp.request.count{identity, tool, status}
 *
 * Identity from the bearer token is injected into httpRequestStorage so that
 * the tool handlers' resolveCtxFromEnv() reads it instead of HUD_AGENT_ACTOR.
 * This means one audit_log row per call with the correct platform:<name> actor.
 *
 * Transport selection: MCP_TRANSPORT=http triggers this module.
 *                      MCP_TRANSPORT=stdio (or unset) leaves stdio path unchanged.
 */

import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { uuidv7 } from 'uuidv7';
import type { AclStore } from './acl.js';
import { checkAcl } from './acl.js';
import type { TokenStore } from './auth.js';
import { verifyBearer } from './auth.js';
import { httpRequestStorage } from './context.js';
import { RateLimiter } from './rate-limit.js';

export type { AclStore, TokenStore };
export type { RateLimiter };

const VERSION = '0.1.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Emits a structured metric log line per call.
 * Format: [mcp-hud] mcp.request.count identity=<id> tool=<tool|-> status=<code>
 * Scrape-friendly: one line per request, parseable by log aggregators.
 */
function emitMetric(identity: string, tool: string | null, status: number): void {
  const toolLabel = tool ?? '-';
  process.stderr.write(
    `[mcp-hud] mcp.request.count identity=${identity} tool=${toolLabel} status=${status}\n`,
  );
}

/**
 * Emits a Sentry-style breadcrumb for 4xx/5xx responses.
 * Writes a structured JSON line to stderr (wire to Sentry SDK if DSN configured).
 */
function emitBreadcrumb(
  identity: string,
  tool: string | null,
  status: number,
  message: string,
  mcpRequestId: string,
): void {
  if (status < 400) return;
  const crumb = {
    level: status >= 500 ? 'error' : 'warning',
    category: 'mcp.request',
    message,
    data: { identity, tool: tool ?? '-', status, mcpRequestId },
    timestamp: new Date().toISOString(),
  };
  process.stderr.write(`[mcp-hud] breadcrumb ${JSON.stringify(crumb)}\n`);
}

/** Sends a plain JSON error response. */
function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  const body = JSON.stringify({ error: code, message });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/** Extracts a client IP from the request. */
function getIpAddress(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() ?? 'unknown';
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Reads the entire request body as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Attempts to extract the tool name from a parsed JSON-RPC body.
 * Returns null if not a tools/call request.
 */
function extractToolName(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  if (obj['method'] !== 'tools/call') return null;
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const params = obj['params'];
  if (!params || typeof params !== 'object') return null;
  // biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
  const name = (params as Record<string, unknown>)['name'];
  return typeof name === 'string' ? name : null;
}

type McpReqWithAuth = IncomingMessage & {
  auth?: import('@modelcontextprotocol/sdk/server/auth/types.js').AuthInfo;
};

// ---------------------------------------------------------------------------
// Server config
// ---------------------------------------------------------------------------

export interface HttpServerConfig {
  /** TCP port to listen on. */
  port: number;
  /** Bind address. '127.0.0.1' for loopback-only (dev and prod default). */
  host: string;
  /** Whether this is dev mode (controls auth path). */
  devMode: boolean;
  /** Token store for bearer auth verification. */
  tokenStore: TokenStore;
  /** ACL store for per-identity tool access control. */
  aclStore: AclStore;
  /** Token-bucket rate limiter (shared, stateful, one instance per daemon). */
  rateLimiter: RateLimiter;
}

// ---------------------------------------------------------------------------
// POST request handler — auth + ACL + transport dispatch
// ---------------------------------------------------------------------------

/** Result of the auth+ACL pre-check step. */
type PreCheckResult =
  | { ok: true; identity: string; toolName: string | null; parsedBody: unknown }
  | { ok: false };

/** Runs auth + body parsing + ACL for a POST /mcp request. */
async function handlePostPrecheck(
  req: IncomingMessage,
  res: ServerResponse,
  tokenStore: TokenStore,
  aclStore: AclStore,
  devMode: boolean,
  ipAddress: string,
  mcpRequestId: string,
): Promise<PreCheckResult> {
  const authHeader = req.headers.authorization as string | undefined;
  const authResult = await verifyBearer(authHeader, tokenStore, devMode);

  if (!authResult.ok) {
    process.stderr.write(
      `[mcp-hud] 401 ${authResult.reason} ip=${ipAddress} reqId=${mcpRequestId}\n`,
    );
    sendError(res, 401, 'unauthorized', 'Missing or invalid bearer token');
    return { ok: false };
  }

  const { identity } = authResult;

  let parsedBody: unknown;
  try {
    const rawBody = await readBody(req);
    parsedBody = JSON.parse(rawBody);
  } catch {
    sendError(res, 400, 'bad_request', 'Invalid JSON body');
    return { ok: false };
  }

  const toolName = extractToolName(parsedBody);
  if (toolName !== null) {
    const aclResult = checkAcl(aclStore, identity, toolName);
    if (!aclResult.allowed) {
      process.stderr.write(
        `[mcp-hud] 403 acl_deny identity=${identity} tool=${toolName} reason=${aclResult.reason} reqId=${mcpRequestId}\n`,
      );
      sendError(res, 403, 'forbidden', 'tool_not_allowed_for_identity');
      return { ok: false };
    }
  }

  return { ok: true, identity, toolName, parsedBody };
}

/** Runs auth for a non-POST (GET/DELETE/etc.) request. */
async function handleNonPostPrecheck(
  req: IncomingMessage,
  res: ServerResponse,
  tokenStore: TokenStore,
  devMode: boolean,
  ipAddress: string,
  mcpRequestId: string,
): Promise<{ ok: true; identity: string } | { ok: false }> {
  const authHeader = req.headers.authorization as string | undefined;
  const authResult = await verifyBearer(authHeader, tokenStore, devMode);

  if (!authResult.ok) {
    process.stderr.write(
      `[mcp-hud] 401 ${authResult.reason} ip=${ipAddress} reqId=${mcpRequestId}\n`,
    );
    sendError(res, 401, 'unauthorized', 'Missing or invalid bearer token');
    return { ok: false };
  }

  return { ok: true, identity: authResult.identity };
}

// ---------------------------------------------------------------------------
// Main server factory
// ---------------------------------------------------------------------------

/**
 * Creates and starts an HTTP/SSE MCP server with auth, ACL, and audit.
 *
 * Returns a stop function that closes the HTTP listener.
 */
export async function startHttpServer(
  mcpServer: McpServer,
  config: HttpServerConfig,
): Promise<{ stop: () => Promise<void> }> {
  const { port, host, devMode, tokenStore, aclStore, rateLimiter } = config;

  // Stateless transport — omitting sessionIdGenerator activates stateless mode.
  // Cast to Transport to satisfy exactOptionalPropertyTypes: the SDK concrete
  // class exposes onclose as '(() => void) | undefined' rather than the
  // optional-property form required by the Transport interface.
  const transport = new StreamableHTTPServerTransport({}) as unknown as Transport &
    StreamableHTTPServerTransport;

  await mcpServer.connect(transport as Transport);

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';
    const method = req.method?.toUpperCase() ?? 'GET';

    if (!url.startsWith('/mcp')) {
      sendError(res, 404, 'not_found', 'Not found');
      return;
    }

    const ipAddress = getIpAddress(req);
    const userAgent = `mcp-hud/${VERSION}`;
    const mcpRequestId = uuidv7();

    if (method === 'POST') {
      const pre = await handlePostPrecheck(
        req,
        res,
        tokenStore,
        aclStore,
        devMode,
        ipAddress,
        mcpRequestId,
      );
      if (!pre.ok) return;

      const { identity, toolName } = pre;

      // Rate limiting — after auth + ACL, before dispatching to transport.
      const rlResult = rateLimiter.consume(identity, toolName);
      if (!rlResult.allowed) {
        const retryAfter = String(rlResult.retryAfterSec);
        res.setHeader('Retry-After', retryAfter);
        sendError(res, 429, 'rate_limited', 'Too many requests');
        emitMetric(identity, toolName, 429);
        emitBreadcrumb(identity, toolName, 429, 'rate_limited', mcpRequestId);
        process.stderr.write(
          `[mcp-hud] 429 rate_limited identity=${identity} tool=${toolName ?? '-'} retryAfter=${retryAfter}s reqId=${mcpRequestId}\n`,
        );
        return;
      }

      emitMetric(identity, toolName, 200);

      const ctx = { identity, ipAddress, mcpRequestId, userAgent };
      await httpRequestStorage.run(ctx, () =>
        transport.handleRequest(req as unknown as McpReqWithAuth, res, pre.parsedBody),
      );
      return;
    }

    const pre = await handleNonPostPrecheck(req, res, tokenStore, devMode, ipAddress, mcpRequestId);
    if (!pre.ok) return;

    const { identity } = pre;

    // Non-POST (GET/DELETE for session management) — count as read, no ACL check needed.
    const rlResult = rateLimiter.consume(identity, null);
    if (!rlResult.allowed) {
      const retryAfter = String(rlResult.retryAfterSec);
      res.setHeader('Retry-After', retryAfter);
      sendError(res, 429, 'rate_limited', 'Too many requests');
      emitMetric(identity, null, 429);
      emitBreadcrumb(identity, null, 429, 'rate_limited', mcpRequestId);
      return;
    }

    emitMetric(identity, null, 200);

    const ctx = { identity, ipAddress, mcpRequestId, userAgent };
    await httpRequestStorage.run(ctx, () =>
      transport.handleRequest(req as unknown as McpReqWithAuth, res),
    );
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(port, host, () => {
      process.stderr.write(
        `[mcp-hud] HTTP/SSE listening on ${host}:${port} (${devMode ? 'dev' : 'prod'} mode)\n`,
      );
      resolve();
    });
    httpServer.once('error', reject);
  });

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
