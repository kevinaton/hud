/**
 * HUD MCP Server entry point.
 *
 * Process model: short-lived, one per Gemini (or Claude / Opencode) session.
 * Gemini spawns: node packages/mcp-hud/dist/index.js
 *
 * Transport: stdio (stdin → MCP protocol → stdout).
 *
 * Identity: reads HUD_AGENT_ACTOR and HUD_AGENT_CLI once at boot via identity.ts.
 *           getActorString() returns the composed "agent:<persona>/<cli>" string
 *           for use in audit_log.actor on all tool writes.
 *
 * DB: imports the web app's Drizzle client (shared DATABASE_URL env path).
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Resolve identity at boot — warns to stderr if env vars are missing.
import { getActorString } from './identity.js';

// Import DB to force the connection to open at boot, exercising DATABASE_URL.
import { db } from './lib/db.js';

// Register all tools.
import { registerTools } from './tools/index.js';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  // Log actor identity to stderr (Gemini does not display stderr to the user).
  process.stderr.write(`[mcp-hud] starting v${VERSION} actor=${getActorString()}\n`);

  // Verify DB connection is usable (synchronous ping via SQLite pragma).
  // This surfaces DATABASE_URL misconfiguration before any tool call fails.
  try {
    db.run(
      // SQLite PRAGMA select — lightweight connectivity check.
      // Returns a single row; we discard the result.
      'SELECT 1',
    );
  } catch (err) {
    process.stderr.write(`[mcp-hud] FATAL: DB connection failed: ${String(err)}\n`);
    process.exit(1);
  }

  const server = new McpServer({
    name: 'mcp-hud',
    version: VERSION,
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[mcp-hud] connected via stdio, ready for tool calls\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`[mcp-hud] FATAL: ${String(err)}\n`);
  process.exit(1);
});
