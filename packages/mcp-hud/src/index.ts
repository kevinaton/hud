/**
 * HUD MCP Server entry point.
 *
 * Transport is selected by MCP_TRANSPORT env var:
 *   stdio (default) — per-session stdio, spawned by Gemini/Claude/Opencode.
 *                     Emily's existing path. Completely unchanged.
 *   http             — long-running HTTP/SSE daemon with bearer auth + ACL.
 *                     Selected when MCP_TRANSPORT=http.
 *
 * Safety hatch (HTTP mode only):
 *   HUD_MCP_MODE=dev  — fixture ACL, hardcoded dev token, binds 127.0.0.1 only,
 *                       writes actor='platform:test-dev'. Safe for local development.
 *   HUD_MCP_MODE=prod — reads real mcp-tokens.yaml + mcp-acl.yaml; refuses to start
 *                       if files absent or not mode 600.
 *
 * Port: MCP_HTTP_PORT (default 7610)
 * Host: always 127.0.0.1 (Tailscale serve handles external exposure)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Resolve identity at boot — warns to stderr if env vars are missing.
import { getActorString } from './identity.js';

// Import DB to force the connection to open at boot, exercising DATABASE_URL.
import { db } from './lib/db.js';

// Register all tools.
import { registerTools } from './tools/index.js';

// HTTP transport type imports (for type-checking; modules loaded lazily in HTTP mode)
import type { AclStore } from './http/acl.js';
import type { TokenStore } from './http/auth.js';
import type { RateLimiter } from './http/rate-limit.js';

const VERSION = '0.1.0';

// biome-ignore lint/complexity/useLiteralKeys: well-known env var
const MCP_TRANSPORT = process.env['MCP_TRANSPORT'] ?? 'stdio';
// biome-ignore lint/complexity/useLiteralKeys: well-known env var
const HUD_MCP_MODE = process.env['HUD_MCP_MODE'] ?? 'dev';
// biome-ignore lint/complexity/useLiteralKeys: well-known env var
const MCP_HTTP_PORT = Number.parseInt(process.env['MCP_HTTP_PORT'] ?? '7610', 10);
// biome-ignore lint/complexity/useLiteralKeys: well-known env var
const MCP_TOKENS_PATH = process.env['MCP_TOKENS_PATH'] ?? '/srv/hud/secrets/mcp-tokens.yaml';
// biome-ignore lint/complexity/useLiteralKeys: well-known env var
const MCP_ACL_PATH = process.env['MCP_ACL_PATH'] ?? '/srv/hud/secrets/mcp-acl.yaml';

async function main(): Promise<void> {
  // Verify DB connection
  try {
    db.run('SELECT 1');
  } catch (err) {
    process.stderr.write(`[mcp-hud] FATAL: DB connection failed: ${String(err)}\n`);
    process.exit(1);
  }

  const server = new McpServer({
    name: 'mcp-hud',
    version: VERSION,
  });

  registerTools(server);

  if (MCP_TRANSPORT === 'http') {
    await startHttpMode(server);
  } else {
    // stdio mode — original path, completely unchanged
    process.stderr.write(`[mcp-hud] starting v${VERSION} actor=${getActorString()}\n`);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[mcp-hud] connected via stdio, ready for tool calls\n');
  }
}

/**
 * Builds a RateLimiter and applies per-identity overrides from the loaded ACL store.
 * Each identity in the ACL that has a `rateLimit` field gets its buckets pre-configured.
 */
async function buildRateLimiter(aclStore: AclStore): Promise<RateLimiter> {
  const { RateLimiter: RL } = await import('./http/rate-limit.js');
  const limiter: RateLimiter = new RL();
  for (const [identity, entry] of Object.entries(aclStore.identities)) {
    if (entry.rateLimit) {
      limiter.configure(identity, entry.rateLimit);
    }
  }
  return limiter;
}

async function startHttpMode(server: McpServer): Promise<void> {
  const { loadTokenStore, buildDevTokenStore } = await import('./http/auth.js');
  const { loadAclStore, buildDevAclStore } = await import('./http/acl.js');
  const { startHttpServer } = await import('./http/server.js');

  let tokenStore: TokenStore;
  let aclStore: AclStore;
  let devMode: boolean;

  if (HUD_MCP_MODE === 'prod') {
    // Prod mode: read real files; fail loud if absent or wrong perms
    process.stderr.write(`[mcp-hud] starting v${VERSION} mode=prod transport=http\n`);
    try {
      tokenStore = loadTokenStore(MCP_TOKENS_PATH, true);
      aclStore = loadAclStore(MCP_ACL_PATH, true);
    } catch (err) {
      process.stderr.write(`[mcp-hud] FATAL: ${String(err)}\n`);
      process.stderr.write(
        '[mcp-hud] FATAL: Cannot start in prod mode without valid secret files (mode 600)\n',
      );
      process.exit(1);
    }
    devMode = false;
  } else {
    // Dev mode: fixture ACL + hardcoded dev token; bind loopback only
    if (HUD_MCP_MODE !== 'dev') {
      process.stderr.write(
        `[mcp-hud] WARNING: unknown HUD_MCP_MODE="${HUD_MCP_MODE}", defaulting to dev\n`,
      );
    }
    process.stderr.write(
      `[mcp-hud] starting v${VERSION} mode=dev transport=http (loopback only)\n`,
    );
    process.stderr.write(
      '[mcp-hud] WARNING: dev mode uses hardcoded token. Never use in production.\n',
    );
    tokenStore = buildDevTokenStore();
    aclStore = buildDevAclStore();
    devMode = true;
  }

  const rateLimiter = await buildRateLimiter(aclStore);

  await startHttpServer(server, {
    port: MCP_HTTP_PORT,
    host: '127.0.0.1', // always loopback; tailscale serve handles external
    devMode,
    tokenStore,
    aclStore,
    rateLimiter,
  });

  process.stderr.write('[mcp-hud] HTTP/SSE ready. Press Ctrl-C to stop.\n');

  // Keep the process alive
  await new Promise<void>((resolve) => {
    process.on('SIGTERM', resolve);
    process.on('SIGINT', resolve);
  });

  process.stderr.write('[mcp-hud] shutting down\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`[mcp-hud] FATAL: ${String(err)}\n`);
  process.exit(1);
});
