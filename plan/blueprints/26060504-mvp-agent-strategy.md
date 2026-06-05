---
title: Agent Strategy for MVP Build — One Builder, Tiered Helpers
type: blueprint
status: proposed
author: architect
created: 2026-06-05
updated: 2026-06-05
tags:
  - architecture
  - agents
  - workflow
  - mvp
  - cost
  - claude
  - gemini
supersedes: []
superseded-by: []
related:
  - "[[plan/Kevin HUD.md]]"
  - "[[plan/blueprints/26060502-mvp-foundation-cashflow.md]]"
  - "[[plan/blueprints/26060503-multi-tenant-server-layout.md]]"
---

# Agent Strategy for MVP Build — One Builder, Tiered Helpers

## Context

The MVP (per `26060502`) is ~11 person-days of work across scaffold, design system, DB, auth, cashflow read, cashflow write, CSV importer, and production config. The user is one operator with three CLI backends available — Claude (Opus + Sonnet), Gemini (Flash, free tier), Opencode — per Layer 2 of `Kevin HUD.md`.

The question: do we use **one full-stack engineer agent** or **specialist agents per domain (frontend / backend / DB)**?

The hidden question underneath: **how do we minimize token cost without hurting output quality?**

Both questions have the same answer once you separate the two axes that actually matter:

- **Domain axis** (frontend / backend / DB) — wrong axis for a Next.js monorepo. Server Components mix both in one file. 80% of MVP tasks are cross-cutting. Splits create handoff overhead without parallelism.
- **Role axis × model-tier axis** (architect, builder, scaffolder, reviewer, tester × Opus / Sonnet / Flash) — right axes. Each role's value is correlated with model intelligence in a different way, and we route to the cheapest model that produces correct output for that role.

## Strategic Objective

- **3 months (MVP):** Ship the MVP with a single Builder agent (Claude Sonnet) carrying the codebase, supported by Gemini Flash for mechanical work and review passes. Total MVP build cost stays under **$50** in API spend (rough target — see cost model below).
- **12 months:** Same agent strategy scales to Phase 1 (Hetzner deploy + Telegram bot) and Phase 2 (vault/notes) without restructuring. The "one Builder" pattern survives because the codebase stays cohesive.
- **24 months:** When the system genuinely warrants parallelism (multiple feature branches, multiple operators, or autonomous agents doing scheduled work via `schedule` skill), we revisit. Until then, the single-Builder pattern is the floor.

## Current State

- **Three CLI backends available** per `Kevin HUD.md` Layer 2: Claude CLI, Gemini CLI, Opencode CLI. Rate-limit-aware routing planned ("cheap model first (Gemini free), escalate to Claude when needed") but not yet implemented as a router — at MVP build time, the operator chooses which CLI to invoke.
- **No agent identity separation in place yet.** Multi-tenant blueprint (`26060503`) defines `agent-hud` user + `agent-claude`/`agent-gemini`/`agent-opencode` wrappers, but these are for the deployed server (post-MVP). During MVP build (laptop), the operator runs CLIs as themselves.
- **No `skills/` tree yet.** `Kevin HUD.md` Layer 3 names skills (`categorize-transaction`, `monthly-report`, …) but those are runtime/agent skills, not build-time skills.
- **Architect role exists** (this role, you talking to me right now) — produces blueprints, no code. Already separated.
- **Builder/Reviewer/Tester roles do not exist yet** as conscious choices — the operator currently runs "Claude does everything" implicitly.

## Proposed Approach

### The split: role × model tier, not domain

| Role | Model | Invocation frequency (MVP) | Why this tier |
|---|---|---|---|
| **Architect** | Claude Opus (or Sonnet 4.5 for cost-conscious sessions) | ~5–10 sessions across MVP | Strategic design, blueprints, ADRs. Rare, high-leverage. Quality of architecture compounds. *Already this role today.* |
| **Builder** | Claude Sonnet 4.5 | **Primary** — most MVP hours | Writes code that must be correct first try across DB / API / UI. Holds the full codebase mental model. The token-cost workhorse. |
| **Scaffolder** | Gemini Flash (free) or Opencode | ~per task | Mechanical generation: `shadcn add`, Drizzle migrations from schema diff, Vitest stubs, README boilerplate. Free model is sufficient because the output is template-shaped. |
| **Reviewer** | Gemini Flash (free), occasionally Sonnet | Once per PR / per phase exit | Pattern-matches the diff against blueprints + invariants. Catches "you wrote a `float` for money" and "you didn't write an audit_log entry" without re-deriving the design. |
| **Tester** | Claude Sonnet 4.5 | Once per task | Writes meaningful Vitest cases (not template stubs). Needs to understand intent. |

**The Builder is one agent, full-stack.** It owns DB schema, Drizzle queries, API route handlers, Server Components, Client Components, Tailwind theme, shadcn primitives, auth flows, and tests. The Reviewer is a second agent (different session, smaller model) that audits the Builder's output against the blueprints — not against a domain.

### Why not split Builder by domain?

| Split | What you get | What you pay |
|---|---|---|
| Single Builder (proposed) | One mental model of the codebase. Schema change ripples in one session: edit `schema.ts` → regen types → update API → update form → update render. ~one context load per session. | Larger active context window; risk of context drift on long sessions (mitigated by `/compact` and skill scoping). |
| Frontend / Backend / DB split | "Cleaner" boundaries on paper. | (1) Re-context tax: each agent loads blueprints + relevant files per session = ~20–40k input tokens × 3 agents × every handoff. (2) Handoff prompts: "Backend wrote X, now do Y" duplicates state. (3) No parallelism — operator is one person; agents run sequentially. (4) Decision drift: "amounts are INTEGER minor units" gets restated in three skills instead of once. (5) Server Components in Next.js mix frontend + backend in one file, so the split has no clean file boundary. |
| Frontend / Backend split (2 agents) | Slightly better than 3-way split. | Same handoff tax, just halved. Still wrong axis. |

For a small monolithic Next.js codebase, domain splitting is **structurally inappropriate** — the framework doesn't enforce those seams, so the agents wouldn't either.

### Token cost model (rough, MVP-end)

Assumptions: 11 days of work, ~6 productive Builder hours/day, ~10k tokens in / 3k tokens out per Builder turn average, ~20 turns/day.

**Single Builder (Sonnet) strategy (proposed):**

| Line item | Tokens | Rate | Cost |
|---|---|---|---|
| Builder input (Sonnet) | 11d × 20 turns × 10k = 2.2M in | $3.00 / 1M | $6.60 |
| Builder output (Sonnet) | 11d × 20 turns × 3k = 660k out | $15.00 / 1M | $9.90 |
| Architect (Opus) | ~10 sessions × 50k in / 10k out = 500k in / 100k out | $15 / $75 | $7.50 + $7.50 = $15.00 |
| Scaffolder (Flash, free) | — | — | $0 |
| Reviewer (Flash, free) | — | — | $0 |
| Tester (rolled into Builder) | included above | — | included |
| **Total** | — | — | **~$31.50** |

**Domain-split (3 Sonnet agents) strategy (rejected):**

| Line item | Tokens | Rate | Cost |
|---|---|---|---|
| Each agent loads ~25k of context (blueprints + relevant files) per session | 3 agents × 3 sessions/day × 11 days × 25k = 2.475M in (context only) | $3.00 / 1M | $7.43 just to "open the file" |
| Productive turns (3 agents share the workload but each turn still costs) | 11d × 20 turns × 10k in = 2.2M in / 660k out | $3 / $15 | $16.50 |
| Handoff prompts (~5k each, ~30/day) | 11d × 30 × 5k = 1.65M in / 0.5M out | $3 / $15 | $12.45 |
| Architect | (same as above) | — | $15.00 |
| **Total** | — | — | **~$51.40** |

**Domain split is ~63% more expensive for the same MVP, with no schedule improvement.** Numbers are approximate; the *direction* of the gap is what matters, not the precise dollar figures.

### Workflow per MVP sub-phase

For each of the eight MVP sub-phases (0.1 through 0.8 in `26060502`):

```
1. Architect (Opus, 1 session)
   - Confirm blueprint section relevant to this sub-phase is current
   - Update blueprint if scope drifted; produce a task note
   - Hand off: "Builder, implement task T-...; respect skills/{db,auth,hud-ui,money}.md"

2. Builder (Sonnet, 1–3 sessions)
   - Load: CLAUDE.md, task note, blueprint section, relevant skill(s)
   - Implement: schema → API → UI → test (one cohesive change)
   - Write: code + Vitest + audit_log call sites
   - Commit: small, named commits per logical unit

3. Reviewer (Flash, 1 session at PR time)
   - Load: git diff, blueprint Security & Threat Model section, skills/money.md, skills/audit.md
   - Audit: invariants check — INTEGER money? audit_log written? requireSession() at top of API? Zod on all inputs?
   - Output: pass / fix-list

4. Builder (Sonnet, 0–1 session)
   - Apply Reviewer fixes if any
   - Tag the sub-phase commit

5. Architect (Opus, 0–1 session)
   - Mark sub-phase exit criteria met in the blueprint
   - Update kanban
```

Steps 2 and 3 are where 90% of token spend lives. Step 3 on Flash is the unlock — paid review is overkill for invariants checking.

### Skills (build-time, in `/opt/agents/skills/build/` locally and on server later)

Each skill is a small markdown file (~500–2000 tokens) loaded **only when relevant**. Skills are not loaded by default — the operator (or a future router) names them on invocation.

| Skill file | Loaded when | Content |
|---|---|---|
| `skills/build/db.md` | Editing schema, migrations, queries | Drizzle patterns, transaction rules, the `(userId, ...)`-first parameter convention, INTEGER-minor-units rule |
| `skills/build/auth.md` | Editing `lib/auth/*` or auth routes | argon2 params, cookie attrs, session rotation, CSRF double-submit, rate-limit budgets |
| `skills/build/hud-ui.md` | Editing UI components | Cyberpunk tokens (`#0FB8C9` cyan, Orbitron, hazard stripes), shadcn extension patterns, Money component contract |
| `skills/build/money.md` | Touching anything with `amount` | INTEGER minor units, parser/formatter contract, currency display rules, lint ban on `float` near money |
| `skills/build/audit.md` | Any state-changing action | Required `audit_log` insert: actor, action, entity, entity_id, payload_json, ip_address. Trigger trigger trigger. |
| `skills/build/test.md` | Writing tests | Vitest patterns, fixture conventions, what to mock vs not |
| `skills/build/csv-import.md` | Editing `scripts/import-cashflow.ts` only | Emoji-strip rule, time-format parser table, idempotency via `external_id` |

**Loading rule:** Builder loads `CLAUDE.md` (always) + the **active task note** + **only the skills referenced by that task note**. This is the single biggest token-cost lever — never load skills the task doesn't need.

A typical Builder session for the auth sub-phase loads: `CLAUDE.md` (~3k) + task note (~1k) + `skills/build/db.md` (~1.5k) + `skills/build/auth.md` (~2k) + `skills/build/audit.md` (~1k) = **~8.5k context tokens** before any code. Compare to a "load everything" agent that might carry 40–60k of irrelevant context every turn.

### Agent identity at build time vs deploy time

| Where | Operator runs as | Agent CLI runs as | Audit trail |
|---|---|---|---|
| Local laptop (MVP build) | `kevinaton` (macOS) | Same user — no separation needed; `git log` is the audit | git commit author |
| Hetzner (post-deploy) | `kevin` via SSH-over-CF-Tunnel | `agent-hud` via `agent-claude`/`agent-gemini` wrappers | `audit_log.actor = 'agent:claude'` (per `26060503` OQ-5) |

During the MVP build phase, identity separation is not worth setting up locally. Git commit signatures + Claude's own session logs provide enough trail. The wrapper-based separation kicks in when we deploy.

## Alternatives Considered

**A. Single Sonnet agent for everything (no Architect, no Reviewer, no skills).**
- Pro: Maximally simple. One CLI, one session per day.
- Con: Architect work (this blueprint, `26060502`, `26060503`) was worth doing in Opus — they were strategic. Sonnet would have produced thinner blueprints, missing trade-offs. Reviewer work on Sonnet is also wasteful — Flash matches blueprints to diffs just fine.
- **Rejected.** Tier-flat is leaving cost on the table.

**B. Three domain-specialist Builders (frontend / backend / DB).**
- See cost model above. ~63% more expensive, no speed gain.
- **Rejected** as the primary structure. *May* be useful in Phase 4+ (web chat, agent-api service) when those become genuinely independent services with stable interfaces — revisit then.

**C. Two Builders (Frontend + Backend).**
- Same tax structure as C, halved. Still wrong axis for a Next.js codebase.
- **Rejected.**

**D. Autonomous swarm (multiple Builders working in parallel on different tasks).**
- Pro: Throughput if it actually works.
- Con: Two Builders editing the same monorepo create merge conflicts the operator has to referee. Token cost of conflict resolution > cost of sequential work. Plus: no human-in-the-loop bandwidth gain — Kevin is still the bottleneck on review.
- **Rejected at MVP.** Reconsider once tasks are genuinely independent (e.g. building Phase 1 Telegram bot in parallel with Phase 2 vault sync).

**E. All-Gemini-Flash (free tier) Builder.**
- Pro: $0 in API cost.
- Con: Sonnet's correctness margin on cross-cutting refactors and security-sensitive auth code is worth $20 on an $30 budget. Cheap fix to a wrong implementation costs more than the right implementation.
- **Rejected for Builder; accepted for Scaffolder and Reviewer.**

## Security & Threat Model

This is a process/methodology blueprint. It does not change the production trust boundary defined in `26060503`. STRIDE coverage is **not changed** by the agent strategy:

- **Spoofing.** Build-time agents act as the operator (laptop). Runtime agents act as `agent-hud` (server). No spoofing surface added by this blueprint.
- **Tampering.** Builder writes code; review gate (Reviewer + git commit + human PR review) catches malicious or incorrect output. Prompt injection during build is bounded: Builder reads blueprints, task notes, and codebase only — no untrusted user input feeds the Builder during MVP build.
- **Repudiation.** Git history is the build-time audit trail. Every Builder commit is signed by the operator's git config. Reviewer findings are documented in PR comments.
- **Information disclosure.** Builder occasionally reads `.env.example` and blueprint references to secrets *patterns* but never actual secrets — secrets live in sops-encrypted files the Builder is instructed not to decrypt. Skill `skills/build/secrets.md` codifies this.
- **Denial of service.** Rate limits at the model provider; not architecturally relevant.
- **Elevation of privilege.** Build-time agents run as the operator on the laptop. No privilege escalation surface.

**One material risk this blueprint introduces:** *agent over-confidence on cross-cutting changes.* A single Builder editing across DB / API / UI can introduce a subtle invariant break (e.g. one place uses cents, one uses pesos) that a domain-split agent would have surfaced as a merge issue. **Control:** the Reviewer's primary job is invariant checking (money, auth, audit_log) — this is precisely what makes the Reviewer pass non-negotiable, even when the Builder claims it's done.

## Risks & Mitigations

| Risk | Detection | Response |
|---|---|---|
| Builder context drifts mid-session on long phases | Builder's own quality drop, repeated re-reading of files | `/compact`; end session; reload with smaller skill set |
| Token spend overruns the $50 budget | Daily Anthropic console check; per-session token counters | Pause; profile which session bloated context; tighten skill scoping |
| Reviewer (Flash) misses a real invariant break | Operator does a manual `git grep` for known invariants before tagging a sub-phase as done | Add the missed pattern to `skills/build/<role>.md` so next review catches it |
| Operator skips Reviewer step to ship faster | Manual checklist at sub-phase exit | Make Reviewer a `pre-tag` hook in the kanban workflow — phase isn't "done" until review marker is set |
| Skill files drift from reality | Builder writes code that contradicts the skill file | Reviewer flags it as either "code is wrong" or "skill is stale"; Architect resolves |
| Builder over-relies on Opus for tasks Sonnet can handle | Cost report shows Opus tokens > Architect's share | Operator routes Opus only to Architect work; default to Sonnet for everything else |

## Phased Implementation

This is a methodology blueprint, not a build plan — adoption is a single step before MVP work starts.

| Step | Outcome | Effort | Exit criteria |
|---|---|---|---|
| 1 — Skills tree scaffold | `/opt/agents/skills/build/{db,auth,hud-ui,money,audit,test,csv-import}.md` exist with the contents listed above | S (2 hours) | Files exist; Builder can be invoked with `--skills db,money,audit` and observably uses them |
| 2 — Role conventions in CLAUDE.md | Top-level repo `CLAUDE.md` documents: "When you invoke `claude`, you are the Builder. When invoking `gemini review`, you are the Reviewer. Architect work happens in this blueprint vault, not in the app repo." | S (30 min) | Conventions documented; operator can point a new agent session at `CLAUDE.md` and get correct role context |
| 3 — Kanban gates | Each MVP task card has an explicit `review:` checkbox that flips only after Reviewer pass | S (15 min) | Kanban template updated; first MVP task uses the gate |
| 4 — Cost monitor | Daily script (`hud-cost-today`) that pulls token spend from Anthropic + Google APIs and prints a one-line summary | S (1 hour) | Script runs locally; reports yesterday's spend in <2 sec |

Total adoption cost: ~half a day before MVP build starts.

## Success Criteria

- One Builder agent (Claude Sonnet) ships sub-phases 0.1–0.8 of `26060502` end-to-end.
- Total API spend for MVP build stays under **$50** (target; hard ceiling $80 — re-evaluate strategy if breached).
- Every sub-phase exits with a Reviewer pass. Reviewer is Gemini Flash (free) on at least 6 of 8 sub-phases.
- Zero MVP defects in the invariants-check categories (money is INTEGER, auth on every route, audit_log on every write) — verifiable via `git grep` at MVP exit.
- The seven skill files exist and are referenced by their corresponding tasks.
- Token cost per Builder session averages **≤ 15k input / ≤ 4k output** (skill scoping working as designed).

## Open Questions

- **OQ-1. Which Claude model for Builder — Sonnet 4.5 or a Claude 4 Haiku tier if available?** Sonnet is the default recommendation. If Haiku-tier reliably writes Drizzle + Next.js correctly under skill scoping, drop in cost is ~3–4×. Worth a one-day spike at sub-phase 0.1 to test.
- **OQ-2. Architect on Opus or Sonnet?** Opus produces noticeably stronger blueprints (this one included). For HUD's 5–10 architect sessions, Opus's premium is justified. Confirm.
- **OQ-3. Should Reviewer ever escalate to Sonnet?** Recommendation: yes, but only at PR review for auth-touching diffs (sub-phase 0.4) and money-touching diffs (sub-phases 0.5, 0.6, 0.7). Flash handles the rest.
- **OQ-4. Does the operator want `hud-cost-today` to also alert on per-session spikes (>30k input tokens), or is the daily summary sufficient?**
- **OQ-5. Where do skill files live during MVP build — in the HUD app repo (`apps/web/skills/build/`) or in this vault (`plan/skills/build/`)?** Recommendation: vault. Skills are architect-owned artifacts that govern how the Builder works, not application code. Vault keeps them separable from the app's runtime skills (Phase 3+).
- **OQ-6. Do we want a "Pair" mode for tricky auth code — Sonnet drafts, Opus reviews same session — instead of Builder + Reviewer separate sessions?** Pair mode is more expensive but tighter feedback loop. Recommendation: skip for MVP; revisit if auth review surfaces hard issues.

## Debt Incurred

None. The strategy is the minimum viable agent split; we are not deferring anything that should be done now.

## Tasks

To be generated after Open Questions are resolved:

- `T-26060515-skills-tree-scaffold` (Step 1)
- `T-26060516-claude-md-role-conventions` (Step 2)
- `T-26060517-kanban-review-gate` (Step 3)
- `T-26060518-cost-monitor-script` (Step 4)
