---
id: Ticket 44
title: Write Andrea Persona and hud-cashflow-policy Skill for Hermes
status: done
priority: p2
area: feature
estimate: S
locus: local
created: 2026-06-09
updated: 2026-06-09
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]]"
tags: [task, area/feature]
---

## Goal

Author the Andrea persona file and `hud-cashflow-policy.md` skill for deployment into `/srv/hermes/data/skills/andrea/` so Hermes has a named persona (OQ-7: resolved as **Andrea**) and hard operational rules governing its HUD cashflow tool use before the container goes live.

## Context

Phase B5 skill half of [[plan/blueprints/26060901-hermes-distributed-tenant-and-mcp-bridge]] §4 + OQ-7 (resolved 2026-06-10: Andrea is the operator-facing persona name for Hermes, counterpart to Emily on HUD). Same persona/runtime separation as Emily/Gemini in `26060701` §8 — Hermes is the runtime, Andrea is the character.

This ticket has zero dependencies and can start immediately — it is pure local authoring, no server access needed.

Skill deployment: `scripts/setup-hermes.sh` (from [[Ticket 42 Author Hermes docker-compose and Provisioning Script]]) rsyncs `apps/hermes-policy/skills/andrea/` into `/srv/hermes/data/skills/andrea/`. A deploy step is added to that script here (coordinate with Ticket 42 — if 42 lands first, the rsync step is added there; if 44 lands first, it is added to the script in a follow-up edit).

Key hard rules from the blueprint for `hud-cashflow-policy.md`:
- Before any `cashflow.add`: restate item + amount + category to the operator; await explicit confirmation
- Never retry a 403 or 401; surface them honestly
- On 429: show the `Retry-After` wait time; do not retry immediately
- Never attempt a denied tool and claim it worked

## Acceptance Criteria

- [x] `apps/hermes-policy/skills/andrea/persona.md` committed: Andrea's voice and identity (external to HUD, Hermes-powered, honest about capabilities and limits), hard behavioral rules, and relationship to Emily (peers, not the same agent)
- [x] `apps/hermes-policy/skills/andrea/hud-cashflow-policy.md` committed: confirm-before-add rule (restate item + amount + category, await confirmation); honest error surfacing for 401/403/429; no workarounds for denied tools
- [x] A deploy/rsync step exists in `scripts/setup-hermes.sh` that copies `apps/hermes-policy/skills/andrea/` into `/srv/hermes/data/skills/andrea/` with correct ownership (`agent-hermes:agent-hermes`); step is idempotent
- [x] `pnpm typecheck` passes (no TS changes expected, but verify no lint regressions)

## Sub-tasks

- [x] Create `apps/hermes-policy/skills/andrea/` directory
- [x] Write `persona.md` (Andrea identity, voice, hard rules, peer relationship with Emily)
- [x] Write `hud-cashflow-policy.md` (cashflow tool operational policy per blueprint §9)
- [x] Add rsync deploy step to `scripts/setup-hermes.sh` (or coordinate with Ticket 42 author if that ticket lands first)
- [x] Verify rsync step is idempotent
- [x] Run `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-09 — implementation

- Added `apps/hermes-policy/skills/andrea/persona.md`: Andrea's identity, voice, hard behavioral rules (confirm-before-act, honest error surfacing for 401/403/429, denied tool table), and peer relationship with Emily. Voice is warm-grounded-direct, distinct from Emily's theatrical/bubbly register. No emojis. No auto-retry. No fabricated results.
- Added `apps/hermes-policy/skills/andrea/hud-cashflow-policy.md`: full operational policy — confirm-before-add with exact restatement format, integer minor units, category resolution flow (calling cashflow.categories, no createCategory), 401/403/429/400/404/other error handling, and an explicit summary table of what Andrea can and cannot do. Denied tools (edit/delete/createCategory) documented with "redirect to Emily" instruction.
- Added `scripts/setup-hermes.sh`: rsync step deploying `apps/hermes-policy/skills/andrea/` to `/srv/hermes/data/skills/andrea/` on the Hetzner host with `agent-hermes:agent-hermes` ownership. Script is idempotent (rsync --delete + chown). `--dry-run` flag prints intended commands without executing them. Coordination note for Ticket 42 included in-script. Script marked executable (0755).
- `pnpm typecheck` passes cleanly (no TS changes in this ticket).
- Files: 3 added, 0 modified
- Commits: 1 (`feat(hermes): add Andrea persona, hud-cashflow-policy skill, and setup-hermes.sh rsync step`)
- Open Questions surfaced: none
