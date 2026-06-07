/**
 * MCP tool aggregator.
 *
 * Registers all tools on the provided McpServer instance.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerCashflowTools } from './cashflow.js';

/**
 * Registers the `ping` tool — a health-check confirming the server is alive.
 *
 * Input:  {} (empty)
 * Output: { ok: true, ts: <ISO timestamp> }
 */
function registerPing(server: McpServer): void {
  server.tool(
    'ping',
    'Returns ok:true and a server-side ISO timestamp. Use this to confirm the MCP server is alive.',
    {},
    async () => {
      const ts = new Date().toISOString();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true, ts }),
          },
        ],
      };
    },
  );
}

/**
 * Registers all tools on the server.
 * Called once at startup from src/index.ts.
 */
export function registerTools(server: McpServer): void {
  registerPing(server);
  registerCashflowTools(server);
}

// Re-export the input schema for ping (used in tests)
export const PingInputSchema = z.object({});
