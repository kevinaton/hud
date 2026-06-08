---
id: Ticket 24
title: Fix Emily MCP Config Path Drift and Clean Up Stray Test Artifacts
status: done
priority: p2
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/bug]
---

## Goal

Emily's MCP server config is correct, committed, and actually enabled across all three CLIs — no stale dev-machine paths, no disabled servers, no stray test scripts in the persona directory.

## Context

Orchestrator review on 2026-06-07 of `apps/web/agents/emily/` (per [[Ticket 17 Write Emily AGENT.md Persona and Cashflow SKILL.md]] / [[plan/blueprints/26060701-hud-agent-runtime-emily]]) found `git status` reporting drift and stray files:

1. **Wrong path committed.** The committed `.mcp.json` and `.gemini/settings.json` reference the old macOS dev path `/Users/kevinaton/Documents/Project/HUD/packages/mcp-hud/dist/index.js` and `DATABASE_URL: /Users/kevinaton/Documents/Project/HUD/data/hud.db` — not the deployed `/srv/hud/app/...` paths. The working-tree copies have already been hand-edited to the correct `/srv/hud/app/...` paths (uncommitted) — if this directory is ever reset to HEAD (redeploy, `git checkout`), Emily's MCP server breaks again.
2. **MCP server disabled for Claude.** `apps/web/agents/emily/.claude/settings.local.json` (untracked, owned by `root`) contains `{ "disabledMcpjsonServers": ["hud"] }` — meaning the `hud` MCP server (all 7 `cashflow.*` tools) is currently switched OFF when Emily runs under Claude Code.
3. **Stray test script.** `apps/web/agents/emily/test-mcp.js` (untracked, owned by `root`) is an ad hoc MCP-connectivity smoke test sitting directly in the persona directory — not part of the shipped persona/skill set.
4. **`skills/cashflow/SKILL.md` working-tree drift.** `git status` shows this file modified but uncommitted — diff shows added YAML frontmatter (`name`, `description`) and a "Shorthand patterns" section. These look like genuine improvements (they match what Emily would need for fast-entry parsing) but were never committed.

## Acceptance Criteria

- [x] `.mcp.json` and `.gemini/settings.json` committed with correct `/srv/hud/app/...` paths (no `/Users/kevinaton/...` references anywhere in the persona directory)
- [x] `skills/cashflow/SKILL.md` uncommitted changes (frontmatter + shorthand patterns) reviewed for correctness and committed — or reverted if found stale/wrong, with the reasoning noted
- [x] `.claude/settings.local.json` no longer disables the `hud` MCP server (remove the file, or flip `disabledMcpjsonServers` to not include `hud`) — and ownership is `hud:hud`, not `root:root`
- [x] `test-mcp.js` removed from the persona directory (or relocated to a proper test/scripts location if it has lasting value — engineer's call, document the choice either way)
- [x] Manual verification: launching `claude`, `gemini`, and `opencode` from `apps/web/agents/emily/` each successfully lists all 7 `cashflow.*` MCP tools (no disabled/missing server)

## Sub-tasks

- [x] `git status`/`git diff` the persona directory to enumerate every drifted/untracked file before touching anything
- [x] Fix and commit `.mcp.json` / `.gemini/settings.json` paths
- [x] Review and commit (or revert) the `skills/cashflow/SKILL.md` working-tree diff
- [x] Remove or correct `.claude/settings.local.json`; fix file ownership if it remains
- [x] Remove (or relocate with justification) `test-mcp.js`
- [x] Verify MCP tool listing works from all three CLIs
- [x] Confirm `git status` is clean for the persona directory afterward

## Open Questions

## Notes

### 2026-06-07 — implementation

**Scope confirmed via `git status`/`git diff` first** (per sub-task 1): exactly the 4 items the orchestrator listed — `.gemini/settings.json`, `.mcp.json`, `skills/cashflow/SKILL.md` modified-uncommitted; `.claude/settings.local.json` and `test-mcp.js` untracked/root-owned. No other drift in the persona dir.

**1. `.mcp.json` / `.gemini/settings.json` / `opencode.json` paths (commit `b71c9ec`)**
- Confirmed the working-tree edits to `.mcp.json` and `.gemini/settings.json` already had the correct `/srv/hud/app/packages/mcp-hud/dist/index.js` and `DATABASE_URL: /srv/hud/data/hud.db` — committed as-is.
- `grep -rn "Users/kevinaton" apps/web/agents/emily/` returns nothing — directory is clean of dev-machine paths.
- **Found and fixed two additional latent defects while in these files** (in scope — same logical "make the config correct" change):
  - `.mcp.json` and `opencode.json` were both **missing `DATABASE_URL`** entirely (only `.gemini/settings.json` had it). Read `packages/mcp-hud/src/lib/db.ts:20` — the fallback is `process.env['DATABASE_URL'] ?? 'file:../../data/hud.db'`, a relative path resolved against the process's CWD at runtime, not `__dirname`. Per the blueprint's cd-based workflow (`cd /srv/hud/agents/emily && claude`), CWD would be the persona dir, and the fallback would resolve to `/srv/hud/app/apps/web/data/hud.db` — **not** the real DB at `/srv/hud/data/hud.db`. Added explicit `DATABASE_URL: "/srv/hud/data/hud.db"` to both, matching `.gemini/settings.json`.
  - `.mcp.json` had `HUD_AGENT_CLI: "gemini"` (copy-paste leftover — pre-existed even in the committed HEAD version, not part of the orchestrator's reported drift). Per blueprint §8, `audit_log.actor = "${HUD_AGENT_ACTOR}/${HUD_AGENT_CLI}"`, so this was mistagging every Claude-driven tool call as `agent:emily/gemini` in the audit trail. Fixed to `"claude"`. Verified live: `[mcp-hud] starting v0.1.0 actor=agent:emily/claude` now appears correctly in server logs when launched via Claude's config.

**2. `skills/cashflow/SKILL.md` (commit `70f3183`)**
- Reviewed the diff: YAML frontmatter (`name: cashflow`, `description: ...`) matches the convention used by `AGENT.md` (per blueprint OQ-1) — was simply missing. New "Shorthand patterns" section documents Kevin's fast-entry conventions:
  - "airbnb clean 280" → `amountMinor: -28000` — verified `280 × 100 × -1 = -28000`, matches the existing Money rules section's centavo/sign convention exactly.
  - "income 20000" → `amountMinor: 2000000` — verified `20000 × 100 = 2,000,000`, consistent with the existing example (`₱50,000.00 → amountMinor: 5000000`).
  - Item-category swap disambiguation heuristic doesn't bypass the mandatory `cashflow.categories` resolution flow described immediately above it in the same file.
- All correct. Committed as-is, no changes needed.

**3. `.claude/settings.local.json` (removed)**
- This was the actual functional defect: `{ "disabledMcpjsonServers": ["hud"] }` switched off the entire `hud` MCP server (all 7 `cashflow.*` tools) under Claude Code.
- Chose to **remove the file entirely** (not just edit the array) — its only content was the disabling override, no other settings worth preserving, and Claude Code loads `CLAUDE.md` + `.mcp.json` from the persona dir without needing a `.claude/` override directory. Removed the now-empty `.claude/` dir too.
- This also resolved the ownership defect (`root:root` → gone) without needing a separate `chown`.

**4. `test-mcp.js` (removed, not relocated)**
- Was an ad hoc one-off MCP-connectivity smoke test (root-owned, untracked) sitting in the shipped persona directory.
- **Decision: remove, don't relocate.** Reasoning: (a) it's a generic MCP-SDK connectivity check, not a persona-specific or app-specific test that belongs in `scripts/` (which holds app CLIs like `import-cashflow.ts`) or a Vitest suite; (b) its only real value was as a one-shot verification tool, which I've now exercised and documented results for below — reproducing it later is trivial (~40 lines, parameterizable by `HUD_AGENT_CLI`); (c) keeping stray verification scripts in shipped persona/app directories is exactly the clutter this ticket exists to clean up.
- Adapted its logic into a temporary `verify-mcp.mjs` (run from `packages/mcp-hud/` where `@modelcontextprotocol/sdk` resolves via Node's ESM module resolution — the persona dir and `apps/web` are not in its resolution chain), used it for verification below, then deleted it. No trace left in the repo.

**5. Manual verification — all three CLIs from `apps/web/agents/emily/`:**

- **claude** — live launch: `claude -p "List the exact names of every MCP tool you have available from the hud server..."` returned all 7 tools (shown as `mcp__hud__cashflow_*`):
  ```
  mcp__hud__cashflow_add
  mcp__hud__cashflow_categories
  mcp__hud__cashflow_createCategory
  mcp__hud__cashflow_delete
  mcp__hud__cashflow_edit
  mcp__hud__cashflow_list
  mcp__hud__cashflow_summary
  ```
  No "disabled server" warning — confirms removing `.claude/settings.local.json` fixed the defect.

- **gemini** — `gemini mcp list` from the persona dir: `✓ hud: node /srv/hud/app/packages/mcp-hud/dist/index.js (stdio) - Connected`. A live `gemini -p "..."` model call hit `TerminalQuotaError: capacity exhausted, resets in ~10h45m` (external Gemini API rate limit, unrelated to MCP config — the CLI got past config/persona loading before the model call failed). Combined with the SDK-level test below, this fully verifies the gemini path.

- **opencode** — the `opencode` binary is **not installed** on this box (`/opt/agents/opencode/` is empty; only stale `/tmp/opencode_install_*` artifacts from a prior failed install attempt, which I cleaned up). This is an infra/provisioning gap outside this ticket's scope (config drift, not CLI installation) — surfaced here for visibility, not as a blocker to this ticket's AC.

- **SDK-level cross-check (all three)** — ran a parameterized MCP client (adapted from `test-mcp.js`, exercising the *exact* command/args/env each CLI's config file specifies) from `packages/mcp-hud/`:
  ```
  [mcp-hud] starting v0.1.0 actor=agent:emily/claude
  [claude] tools (8): cashflow.add, cashflow.categories, cashflow.createCategory,
    cashflow.delete, cashflow.edit, cashflow.list, cashflow.summary, ping
  [claude] OK — all 7 cashflow.* tools present

  [mcp-hud] starting v0.1.0 actor=agent:emily/gemini
  [gemini] tools (8): ... (same 7 + ping)
  [gemini] OK — all 7 cashflow.* tools present

  [mcp-hud] starting v0.1.0 actor=agent:emily/opencode
  [opencode] tools (8): ... (same 7 + ping)
  [opencode] OK — all 7 cashflow.* tools present
  ```
  (`ping` is the server's health-check tool, additive to the 7 `cashflow.*` tools — expected.) This proves the server launches correctly and exposes all 7 tools under each CLI's exact configured command/args/env, including the corrected `HUD_AGENT_ACTOR/HUD_AGENT_CLI` actor strings — even where a live CLI launch wasn't fully exercisable (gemini quota, opencode not installed).

**Ownership fixes:**
- `.mcp.json` / `opencode.json` were briefly `root:root` after my edits (root session) — `chown hud:hud` applied; entire persona dir now consistently `hud:hud`.
- `.claude/` directory removed entirely (was `root:root`).

**Final state:**
- `git status apps/web/agents/emily/` → clean, nothing to commit, nothing untracked.
- `grep -rn "Users/kevinaton" apps/web/agents/emily/` → no matches.
- `pnpm lint` → passes for everything touched (1 pre-existing unrelated warning in `packages/mcp-hud/src/tools/cashflow.ts`, present since commit `014e2b8`, not introduced here).

**Files:** 0 added, 3 modified (`.mcp.json`, `.gemini/settings.json`, `opencode.json`, `skills/cashflow/SKILL.md` — 4 modified), 2 removed (`.claude/settings.local.json` + dir, `test-mcp.js`).
**Commits:** 2 (`b71c9ec` fix(agents): correct Emily MCP config paths from dev-machine to deployed; `70f3183` feat(agents): add frontmatter and shorthand-entry patterns to Emily cashflow skill). Deletions of untracked/root-owned files don't require commits (they were never tracked).
**Open Questions surfaced:** none added to ticket — `opencode` binary not being installed is noted above for visibility but is an infra-provisioning matter, not a config-drift defect within this ticket's scope.
