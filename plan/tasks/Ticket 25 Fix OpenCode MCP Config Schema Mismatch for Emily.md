---
id: Ticket 25
title: Fix OpenCode MCP Config Schema Mismatch for Emily
status: done
priority: p2
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 24 Fix Emily MCP Config Path Drift and Clean Up Stray Test Artifacts]]"]
blocks: []
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/bug]
---

## Goal

Launching `opencode` from `apps/web/agents/emily/` starts cleanly and connects to the `hud` MCP server — no `ConfigInvalidError` on startup.

## Context

User-reported on 2026-06-07: running `opencode` as root from `apps/web/agents/emily/` fails immediately with:

```
Error: 4 of 5 requests failed: Unexpected server error. Check server logs for details.
Affected startup requests: config.providers, provider.list, app.agents, config.get
```

Orchestrator traced the real cause in `/root/.local/share/opencode/log/2026-06-07T*.log`:

```
ERROR ... error=ConfigInvalidError
[cause]: SchemaError: Expected { "type": "local", ... } | { "type": "remote", ... },
  got {"hud":{"command":"node","args":[...],"env":{...}}}
  at ["mcp"]["servers"]
  Missing key at ["mcp"]["servers"]["enabled"]
```

`apps/web/agents/emily/opencode.json` writes the `hud` MCP server block in the old/wrong shape (`command` as a string, `args` array, `env` object — the Claude `.mcp.json` shape). The installed `opencode` binary (v1.16.2, `/root/.opencode/bin/opencode`) validates against a newer schema that requires `type: "local" | "remote"`, `command` as a **string array**, a required `enabled` boolean, and `environment` (not `env`) for env vars — see [OpenCode MCP servers docs](https://opencode.ai/docs/mcp-servers/).

This slipped through [[Ticket 24 Fix Emily MCP Config Path Drift and Clean Up Stray Test Artifacts]] because the `opencode` binary wasn't installed on the box at the time — the engineer could only cross-check the config shape at the SDK level, not launch the real CLI (their notes explicitly flag this as "an infra gap, noted but out of scope"). The binary is now present, so the drift surfaces.

**Correct shape (per OpenCode docs):**
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "hud": {
        "type": "local",
        "command": ["node", "/srv/hud/app/packages/mcp-hud/dist/index.js"],
        "enabled": true,
        "environment": {
          "DATABASE_URL": "/srv/hud/data/hud.db",
          "HUD_AGENT_ACTOR": "agent:emily",
          "HUD_AGENT_NAME": "emily",
          "HUD_AGENT_CLI": "opencode"
        }
      }
    }
  }
}
```

## Acceptance Criteria

- [x] `apps/web/agents/emily/opencode.json` rewritten to the `type`/`command`-array/`enabled`/`environment` schema that `opencode` v1.16.2 (the installed version — re-check at implementation time in case it's been updated) actually validates
- [x] Launching `opencode` from `apps/web/agents/emily/` starts without any `ConfigInvalidError` in `~/.local/share/opencode/log/*.log`
- [x] The `hud` MCP server connects and all 7 `cashflow.*` tools (plus `ping`) are listed/available in the running session
- [x] Change committed with the corrected schema (no stale `command`/`args`/`env` shape left anywhere in the file)

## Sub-tasks

- [x] Confirm the installed `opencode` version (`opencode --version`) and its current MCP config schema (docs + `--help` + a minimal valid config test if needed)
- [x] Rewrite `opencode.json`'s `mcp.servers.hud` block to the correct schema
- [x] Launch `opencode` from the persona dir; confirm clean startup (check the log file for `ConfigInvalidError`)
- [x] Confirm the `hud` MCP server lists all 7 `cashflow.*` tools + `ping`
- [x] Commit

## Open Questions

## Notes

### 2026-06-07 — implementation

**Root cause (confirmed, refined from the ticket's hypothesis):** `opencode.json` wrote the `hud` MCP server in the Claude `.mcp.json` shape (`command` string + `args` array + `env` object) under `mcp.servers.hud`. The installed binary (confirmed `opencode --version` → `1.16.2`, at `/root/.opencode/bin/opencode`) validates against a schema where:

1. `command` must be a string array, `enabled` is required, `environment` (not `env`) — as the ticket suspected, AND
2. **the bigger surprise:** `mcp` has **no `servers` wrapper at all** — it's a *flat* map `mcp.<name> -> {type, command[], enabled, environment}`. The ticket's suggested `mcp.servers.hud.{...}` shape (matching the published docs example at opencode.ai/docs/mcp-servers) **also fails validation** on this binary — `"servers"` gets parsed as if it were itself a server-name entry, whose value `{hud: {...}}` doesn't match `McpLocalConfig | McpRemoteConfig | {enabled}`. That's why the original error path is `["mcp"]["servers"]` / `["mcp"]["servers"]["enabled"]` — the validator is complaining about `servers` as an entry, not about a nested `hud.enabled`.

I confirmed this empirically (not just from docs) by:
- Pulling the live JSON Schema from `https://opencode.ai/config.json` and inspecting `$defs.Config.properties.mcp` → `additionalProperties: anyOf[McpLocalConfig | McpRemoteConfig | {enabled, required:[enabled]}]` — i.e. `mcp` itself is the flat map, confirming the docs *page* example (`mcp.servers.*`) is stale relative to the bundled schema.
- Testing four candidate shapes against `opencode debug config` in a scratch dir (`/tmp/oc-test-dir`, deleted after): (a) original `servers.hud.{command,args,env}` → fails; (b) `servers.hud.{type,command[],enabled,environment}` (the ticket's suggested fix) → **still fails**, same `mcp.servers` / `mcp.servers.enabled` error; (c) `servers.{enabled, hud: {...}}` → validates but silently drops `hud` from resolved config (not usable); (d) flat `mcp.hud.{type,command[],enabled,environment}` → **validates AND connects**.

**Corrected config** (`apps/web/agents/emily/opencode.json`):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hud": {
      "type": "local",
      "command": ["node", "/srv/hud/app/packages/mcp-hud/dist/index.js"],
      "enabled": true,
      "environment": {
        "DATABASE_URL": "/srv/hud/data/hud.db",
        "HUD_AGENT_ACTOR": "agent:emily",
        "HUD_AGENT_NAME": "emily",
        "HUD_AGENT_CLI": "opencode"
      }
    }
  }
}
```

**Verification method:** ran the real `/root/.opencode/bin/opencode` binary (v1.16.2) as **root** (the only user it's currently installed for — see Open Questions/follow-up note below) directly from `/srv/hud/app/apps/web/agents/emily/`:

- `opencode debug config` — resolves the config cleanly, `mcp.hud` shows the full corrected block with no validation error.
- `opencode mcp list` — prints `● ✓ hud  connected   node /srv/hud/app/packages/mcp-hud/dist/index.js` / `1 server(s)`.
- Fresh log `~/.local/share/opencode/log/2026-06-07T163353.log` (grepped for `ConfigInvalidError` → **none found**), relevant clean-startup lines:
  ```
  INFO ... directory=/srv/hud/app/apps/web/agents/emily creating instance
  INFO ... service=config path=/srv/hud/app/apps/web/agents/emily/opencode.json loading
  INFO ... service=mcp key=hud type=local found
  INFO ... service=mcp key=hud mcp stderr: [mcp-hud] starting v0.1.0 actor=agent:emily/opencode
  INFO ... service=mcp key=hud mcp stderr: [mcp-hud] connected via stdio, ready for tool calls
  INFO ... service=mcp key=hud toolCount=8 create() successfully created client
  ```
- `toolCount=8` matches "7 `cashflow.*` + `ping`". Confirmed the exact 8 by reading `packages/mcp-hud/src/tools/index.ts` (`ping`) and `packages/mcp-hud/src/tools/cashflow.ts` (`cashflow.add`, `cashflow.edit`, `cashflow.delete`, `cashflow.list`, `cashflow.summary`, `cashflow.categories`, `cashflow.createCategory`) — 7 cashflow tools + ping = 8, exactly matching the connected client's reported tool count.

**Binary/user used for verification — flagged as a follow-up concern:** `opencode` v1.16.2 is currently only installed at `/root/.opencode/bin/opencode` (root's home), not for the `hud`/`agent-hud` user that the blueprint (`26060701`, §"Multi-CLI portability") specifies as the actual runtime identity (`ssh hud && cd .../emily && opencode`). I verified as root because that's the only working binary on the box right now — the config file itself is user-agnostic (it's read from cwd, not `$HOME`), so the fix is correct regardless of which user launches it. But **root is not the intended runtime user** — this is the same "infra gap" Ticket 24 flagged (binary not installed for the right user). Worth a follow-up ticket to install/symlink `opencode` for `hud`/`agent-hud` so `emily opencode` actually works end-to-end as designed. Not blocking this ticket — the schema-correctness goal is fully met and verified against the real validator.

**Files:** 1 modified (`apps/web/agents/emily/opencode.json`)
**Commits:** 1 (`fix(emily): correct opencode MCP config schema for v1.16.2 binary` — `6c05e82`)
**Open Questions surfaced:** none in the ticket's Open Questions section (the binary-install-for-`hud`-user gap is noted above as a follow-up candidate, consistent with what Ticket 24 already flagged — not duplicating an OQ here).
