# HUD Claude Skills

Project-specific invariants and patterns the HUD engineer agent (and any Claude session running in this repo) loads on demand.

## Discovery

Skills live at `.claude/skills/<name>/SKILL.md`. Claude Code auto-discovers them. The Opencode engineer agent (`.opencode/agent/engineer.md`) loads them via the matrix in its system prompt.

## Loading matrix

### Engineer (`.claude/agents/engineer.md`)

| Ticket touches | Load |
|---|---|
| Any HUD code | `hud-stack` (always) |
| Any vault file (ticket Notes, AC checkboxes, frontmatter) | `obsidian-vault` |
| Money, amounts, balances, deltas | `hud-money` |
| Any state-changing route or DB write | `hud-audit` |
| `packages/db/`, `apps/web/lib/db/`, schema, migrations | `hud-db` |
| Auth flows, sessions, signup/login/logout, CSRF, rate limit | `hud-auth` |
| `components/`, pages, layouts, fonts, theme | `hud-ui` |
| `scripts/import-cashflow.ts` | `hud-csv-import` |

### Orchestrator (`.claude/agents/orchestrator.md`)

| Always |
|---|
| `obsidian-vault` |

The orchestrator does not load `hud-*` code skills. If a ticket needs a code-skill rule reflected in AC, the orchestrator references the skill by path in the ticket's Context — the engineer loads it at implementation time.

## Skill list

- **hud-stack** — versions, file layout, commands, cross-stack conventions
- **hud-money** — INTEGER minor units invariant; the four functions
- **hud-audit** — every state change writes one `audit_log` row in the same transaction
- **hud-db** — Drizzle + SQLite patterns; userId-first parameter convention
- **hud-auth** — argon2id, opaque sessions, CSRF double-submit, rate limit, lockout
- **hud-ui** — cyberpunk design tokens, fonts, geometry, closed component set
- **hud-csv-import** — emoji-stripped categories, time-format parser, idempotent upsert
- **obsidian-vault** — kanban-plugin format preservation, wiki links, frontmatter rules, safe-edit checklist for `plan/`

## Updating skills

Skills are governed artifacts. To change a rule:

1. The architect approves the change (or this is part of an approved blueprint).
2. Update the SKILL.md in the same PR as the code that needs the new rule.
3. Cite the blueprint and the rationale in the PR description.

Do not let code and skills drift. If you find code that violates a skill, **either** fix the code **or** update the skill to reflect new reality — never both at once, never neither.
