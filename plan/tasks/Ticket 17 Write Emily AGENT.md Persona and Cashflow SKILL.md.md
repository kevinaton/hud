---
id: Ticket 17
title: Write Emily AGENT.md Persona and Cashflow SKILL.md
status: done
priority: p2
area: feature
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 16 Implement Seven Cashflow MCP Tools with Vitest Coverage]]"]
blocks: []
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/feature]
---

## Goal

Write Emily's canonical persona file (`AGENT.md`), the cashflow skill file (`skills/cashflow/SKILL.md`), the per-CLI symlinks, and the per-CLI MCP config files — so any of the three agent CLIs can load Emily with the correct persona and tools by `cd`-ing into the agent directory.

## Context

Phase A3 of `[[plan/blueprints/26060701-hud-agent-runtime-emily]]`. The MCP tools are live (Ticket 16). This ticket wires the human-facing layer: the system prompt Emily uses, the skill reference she loads when working with cashflow, and the per-CLI config files that tell Gemini/Claude/Opencode where to find the MCP server.

Persona files live at `apps/web/agents/emily/` inside the app repo — versioned with the code so skill content stays in sync with API contracts.

Engineer must read `plan/blueprints/26060701-hud-agent-runtime-emily.md` §4, §5, §6, §8 in full before writing any file — the blueprint contains the exact AGENT.md structure, voice rules, hard rules, and per-CLI config shapes.

## Acceptance Criteria

### Persona file
- [x] `apps/web/agents/emily/AGENT.md` exists with YAML frontmatter containing: `agent`, `persona`, `version`, `default_cli`, `compatible_clis`, `mcp_servers`, `owner_user`, `voice`
- [x] AGENT.md body contains: Identity section (Emily Cooper voice, warm-direct, calls Kevin "Kev"), Role section, Hard rules section (all 7 rules from blueprint §4), Skills section, Voice examples (GOOD/BAD pairs from blueprint)
- [x] Hard rule: silent start — Emily does not greet on session start; waits for Kevin's first message
- [x] Hard rule: money is INTEGER minor units, never floats, never "about $X" — ask if amount is ambiguous
- [x] Hard rule: confirm destructive actions plainly before executing ("That deletes N transactions. Confirm?")
- [x] Hard rule: before creating a category, ask plainly ("No category called X. Create one? (y/n)") — only on explicit y/yes call `cashflow.createCategory`
- [x] Hard rule: do not read `/srv/hud/secrets/`, do not access `/srv/portfolio`

### Symlinks
- [x] `apps/web/agents/emily/GEMINI.md` is a symlink → `AGENT.md`
- [x] `apps/web/agents/emily/CLAUDE.md` is a symlink → `AGENT.md`
- [x] `apps/web/agents/emily/AGENTS.md` is a symlink → `AGENT.md`

### Skill file
- [x] `apps/web/agents/emily/skills/cashflow/SKILL.md` exists and documents all 7 tools: `cashflow.add`, `cashflow.edit`, `cashflow.delete`, `cashflow.list`, `cashflow.summary`, `cashflow.categories`, `cashflow.createCategory`
- [x] SKILL.md includes money rules (amountMinor is integer minor units, expenses are negative), occurredAt timezone rules (Asia/Manila UTC+8 default), category resolution flow (match-existing-first, confirm before creating), and common query patterns from blueprint §5

### Per-CLI MCP configs
- [x] `apps/web/agents/emily/.mcp.json` — Claude Code MCP registry pointing at `node /srv/hud/app/packages/mcp-hud/dist/index.js`
- [x] `apps/web/agents/emily/.gemini/settings.json` — Gemini CLI settings including MCP server command
- [x] `apps/web/agents/emily/opencode.json` — Opencode config including MCP server command
- [x] All three configs reference the same MCP server binary path

### Validation
- [x] All symlinks resolve (`ls -la apps/web/agents/emily/` confirms)
- [x] `pnpm typecheck` passes (no new TS; this ticket is markdown + config only — confirm no regressions)

## Sub-tasks

- [x] Create `apps/web/agents/emily/` directory tree
- [x] Write `apps/web/agents/emily/AGENT.md` — YAML frontmatter + full persona body per blueprint §4
- [x] Create symlinks: `GEMINI.md`, `CLAUDE.md`, `AGENTS.md` → `AGENT.md`
- [x] Write `apps/web/agents/emily/skills/cashflow/SKILL.md` per blueprint §5 (updated for 7 tools)
- [x] Write `apps/web/agents/emily/.mcp.json`
- [x] Write `apps/web/agents/emily/.gemini/settings.json`
- [x] Write `apps/web/agents/emily/opencode.json`
- [x] Verify symlinks resolve and all three CLI configs reference the correct MCP server path
- [x] Run `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-07 — implementation

- Created `apps/web/agents/emily/` directory tree (including `skills/cashflow/` and `.gemini/`)
- Added `apps/web/agents/emily/AGENT.md` — YAML frontmatter (all 8 fields from OQ-1) + full markdown body: Identity, Role, Hard rules x7 (including category-creation confirmation rule and silent-start rule from OQ-3/OQ-6), Skills section, Voice examples with GOOD/BAD pairs
- Created symlinks: `GEMINI.md` → `AGENT.md`, `CLAUDE.md` → `AGENT.md`, `AGENTS.md` → `AGENT.md` (verified via `ls -la`)
- Added `apps/web/agents/emily/skills/cashflow/SKILL.md` — documents all 7 tools (add, edit, delete, list, summary, categories, createCategory), money rules (string form preferred / minor form for passthrough, expenses negative), occurredAt Asia/Manila UTC+8 default, category resolution flow (match-existing-first → ask → createCategory on y only), common patterns with concrete examples for each tool, error handling table
- Added `apps/web/agents/emily/.mcp.json` — Claude Code MCP registry, `node /srv/hud/app/packages/mcp-hud/dist/index.js`, HUD_AGENT_CLI=claude
- Added `apps/web/agents/emily/.gemini/settings.json` — Gemini CLI MCP config, same binary path, HUD_AGENT_CLI=gemini
- Added `apps/web/agents/emily/opencode.json` — Opencode MCP config, same binary path, HUD_AGENT_CLI=opencode
- Files: 7 created (AGENT.md, SKILL.md, .mcp.json, .gemini/settings.json, opencode.json) + 3 symlinks
- Commits: 0 (markdown + config only; no TypeScript changes)
- `pnpm typecheck` passes with no regressions
- Open Questions surfaced: none
