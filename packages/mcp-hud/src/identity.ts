/**
 * Agent identity module.
 *
 * Reads HUD_AGENT_ACTOR and HUD_AGENT_CLI once at process start.
 * Both are set by the wrapper in /opt/agents/bin/emily before Gemini spawns
 * this MCP server.
 *
 * Actor format: "agent:<persona>/<cli>" — matches audit_log CHECK constraint:
 *   actor LIKE 'agent:%/%'
 *
 * Examples: "agent:emily/gemini", "agent:emily/claude", "agent:emily/opencode"
 */

// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
const ACTOR_ENV = process.env['HUD_AGENT_ACTOR'];
// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
const CLI_ENV = process.env['HUD_AGENT_CLI'];

const DEFAULT_ACTOR = 'agent:unknown';
const DEFAULT_CLI = 'unknown';

if (!ACTOR_ENV || !CLI_ENV) {
  const missing: string[] = [];
  if (!ACTOR_ENV) missing.push('HUD_AGENT_ACTOR');
  if (!CLI_ENV) missing.push('HUD_AGENT_CLI');
  process.stderr.write(
    `[mcp-hud] WARNING: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set. Defaulting actor to 'agent:unknown/unknown'. Set these env vars in the emily wrapper before invoking Gemini.\n`,
  );
}

const resolvedActor = ACTOR_ENV ?? DEFAULT_ACTOR;
const resolvedCli = CLI_ENV ?? DEFAULT_CLI;

/**
 * Returns the composed actor string for use in audit_log.actor.
 *
 * Format: "${HUD_AGENT_ACTOR}/${HUD_AGENT_CLI}"
 * Example: "agent:emily/gemini"
 *
 * Always matches the CHECK constraint: actor LIKE 'agent:%/%'
 * (because HUD_AGENT_ACTOR must begin with 'agent:').
 */
export function getActorString(): string {
  return `${resolvedActor}/${resolvedCli}`;
}
