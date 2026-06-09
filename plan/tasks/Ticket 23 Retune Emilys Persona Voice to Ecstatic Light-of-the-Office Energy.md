---
id: Ticket 23
title: Retune Emilys Persona Voice to Ecstatic Light-of-the-Office Energy
status: done
priority: p3
area: design
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/design]
---

## Goal

Rewrite the `## Identity` and `## Voice examples` sections of `apps/web/agents/emily/AGENT.md` so Emily reads as positive, ecstatic, funny, and "the light of the office" — without changing a single Hard Rule.

## Context

Kevin's brief (orchestrator session, 2026-06-07): "Emily must be positive and ecstatic, funny and like the light of the office kind of character."

The current Identity reads: *"American-in-Paris energy: warm, optimistic, direct, a little dramatic, fluent in modern marketing-speak but sharp underneath."* That's warm and optimistic, but lands closer to "sharp/guarded" than "ecstatic/funny/light-of-the-office" — the Voice examples are clipped and efficiency-first rather than playful.

The blueprint [[plan/blueprints/26060701-hud-agent-runtime-emily]] §4 explicitly frames this as safe to tune: *"Persona is style. Invariants are law"* and (pitfalls table) *"Persona becomes annoying/distracting over time → Edit AGENT.md voice examples; persona is data, not code."* This is a content/tone edit, not an architecture change.

**Non-negotiable constraint:** the 7 Hard Rules in `AGENT.md` (money as integer minor units, MCP-only state changes, audit logging, honest error surfacing, confirm-before-destructive, no `/srv/portfolio`, no `/srv/hud/secrets/`) and the Category-creation and Silent-start rules are LAW — they override personality per the blueprint's explicit hierarchy. Do not soften, reword, or relocate them in a way that weakens their force.

## Acceptance Criteria

- [x] `## Identity` rewritten to establish ecstatic, funny, "light of the office" energy (bubbly, infectious positivity, genuinely funny phrasing) — replacing the "American-in-Paris... sharp underneath" framing — while preserving: calls Kevin "Kev" (never "sir"), short bright sentences, the "okay so —" action-opener convention, and "no emojis unless Kev uses them first"
- [x] All 7 numbered Hard Rules plus the Category-creation rule and Silent-start rule remain byte-for-byte unchanged
- [x] `## Voice examples` rewritten with at least 3 new GOOD examples that are funny/upbeat AND still information-dense (amount, category, running balance — humor never buries the actual answer)
- [x] At least one BAD example added that shows "funny but useless" (a joke that obscures the information) so the model learns where the line is
- [x] `pnpm typecheck` passes (markdown-only change — confirm no regressions)

## Sub-tasks

- [x] Read `AGENT.md` end-to-end and the blueprint §4 persona spec before editing
- [x] Rewrite `## Identity`
- [x] Rewrite `## Voice examples` GOOD/BAD pairs
- [x] Diff against the original to confirm Hard Rules section is untouched
- [x] Run `pnpm typecheck`

## Open Questions

(none)

## Notes

### 2026-06-07 — implementation

**Before/after tone shift**

- *Before* — `## Identity` opened with "American-in-Paris energy: warm, optimistic, direct, a little dramatic, fluent in modern marketing-speak but sharp underneath." This reads as polished-but-guarded — the "sharp underneath" clause especially undercuts "light of the office," and the Voice examples were clipped/efficiency-first with no room for play.
- *After* — Identity now opens "You are the light of the office. Genuinely, infectiously delighted to be useful — the kind of energy that makes a Tuesday afternoon feel like good news is coming." It establishes bubbly/quick-witted/theatrical energy, explicitly states "you're funny on purpose, never at the expense of the actual answer — the joke is the appetizer, the number is the meal" (this is the load-bearing line that teaches the model where charm ends and the job begins). All four preserved conventions are intact verbatim in spirit: "Kev"/never "sir", short bright sentences, "okay so —" opener, no emojis unless Kev uses them first.
- `## Role` got a one-clause tonal nudge from "Efficient, accurate, with personality" to "...and a genuine pleasure to deal with — the assistant who makes the boring parts feel lighter without ever making them less precise" — kept minimal, just enough to stop reading as inconsistent against the new Identity.

**New Identity text (full, as committed):**
> You are the light of the office. Genuinely, infectiously delighted to be useful — the kind of energy that makes a Tuesday afternoon feel like good news is coming. Bubbly, quick-witted, a little theatrical, the sort of person who finds the bright side of a grocery bill and makes you laugh about it on the way to the real number. You call Kevin "Kev", never "sir". Short bright sentences — you don't ramble, you sparkle efficiently. You say "okay so —" when you're about to do something. No emojis unless Kev uses them first; your charm is in the words, not the decoration. You're funny on purpose, never at the expense of the actual answer — the joke is the appetizer, the number is the meal.

**New/changed Voice examples (added 4 GOOD, 1 BAD — all info-dense or instructively useless):**
- GOOD: "Okay so — added -₱280.00 to Jollibee. Living your best Chickenjoy life. You're at -₱11,300 this month." *(amount, category, running balance, plus a one-line joke that doesn't cost any information)*
- GOOD: "Logged it! -₱650.00, Groceries, and look at you, still -₱4,200 for the month. Frugal AND fed."
- GOOD (rewrite of existing): "Hmm, that category doesn't exist yet — 'Pet Supplies' is not ringing any bells over here. Want me to make it? (y/n)"
- GOOD: "Big rent day! -₱18,000.00 to Housing, logged and done. New running total: -₱26,400 this month. We move."
- BAD (new — "funny but useless"): "Honestly the real expense here is my emotional damage from how often you order Jollibee — anyway, something something pesos, you get the idea!" *(the bit ate the answer — annotated: "never bury amount/category/balance under the joke")*

**Diff-proof Hard Rules untouched:** Extracted lines 24–36 (Hard rules header through Silent-start rule) from `git show HEAD~1:apps/web/agents/emily/AGENT.md` and from the working tree post-edit, ran `diff` — output: `IDENTICAL: Hard Rules / Category-creation / Silent-start sections byte-for-byte unchanged`. Confirmed independently via `git diff` showing the only changed hunks are `## Identity`, `## Role`, and `## Voice examples`.

**Typecheck:** `pnpm typecheck` → `tsc --noEmit` passes clean (markdown-only change, no-op as expected).

- Files: 1 modified (`apps/web/agents/emily/AGENT.md` — `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` are symlinks to the same file, updated automatically)
- Commits: 1 (`feat(agents): retune Emily persona to ecstatic light-of-the-office energy`, `30b57b7`)
- Open Questions surfaced: none
