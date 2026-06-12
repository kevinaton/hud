---
name: obsidian-vault
description: HUD Obsidian vault conventions — kanban plugin format preservation, wiki links, embeds, frontmatter YAML, ticket file naming, safe-edit rules. Load this whenever editing `plan/Kanban.md`, `plan/tasks/Ticket NN *.md`, blueprints, or any markdown inside `plan/`. Preserves plugin invariants so the Obsidian app keeps working.
---

# HUD Obsidian Vault Conventions

The HUD vault lives at `/srv/hud/app/plan/`. It is opened by Obsidian with the **Kanban** plugin (mrjackphil/obsidian-kanban) enabled. The vault is also edited via CLI by AI agents. Both consumers must produce files the other can read without surprise.

This skill captures the mechanical rules. Strategic/design questions go to the architect.

## 1. Vault layout

```
plan/
├── Kevin HUD.md                # strategy doc (architect-owned)
├── Kanban.md                   # the board (orchestrator-owned)
├── HUD Architecture v2.canvas  # Obsidian Canvas (binary-ish JSON; do not hand-edit)
├── blueprints/
│   ├── YYMMDDNN-<slug>.md      # blueprints (architect-owned)
│   └── adr/
│       └── ADR-YYMMDDNN-<slug>.md
├── reference/
│   └── <topic>.md              # infra refs (architect-curated)
└── tasks/
    └── Ticket NN <Title>.md    # tickets (one file per atomic work unit)
```

**File naming rules:**

- **Tickets:** `Ticket NN <Imperative Title>.md` — spaces are OK; `NN` is two-digit zero-padded sequence; title is verb-first ("Add login route", not "Login route added").
- **Blueprints:** `YYMMDDNN-<kebab-slug>.md` where `YY` two-digit year, `MM` two-digit month, `DD` two-digit day, `NN` daily sequence starting at `01`.
- **ADRs:** same as blueprints with `ADR-` prefix inside `blueprints/adr/`.
- **No leading dot** on any vault file (Obsidian hides dotfiles).
- **No `__` prefix** (avoid clashing with Obsidian internals).

## 2. Wiki links

Wiki links are the primary cross-reference mechanism. Obsidian resolves them by **basename match** across the vault (case-insensitive), then by path if ambiguous.

| Syntax | Resolves to | Use when |
|---|---|---|
| `[[Ticket 03 Add login route]]` | `plan/tasks/Ticket 03 Add login route.md` | Linking a ticket from anywhere — preferred form |
| `[[Ticket 03 Add login route\|login route]]` | Same target, displayed as "login route" | When the link text should read naturally in prose |
| `[[plan/blueprints/26060502-mvp-foundation-cashflow]]` | That exact path | When two notes share a basename — use the path |
| `[[Kevin HUD]]` | `plan/Kevin HUD.md` | Linking the strategy doc |
| `![[plan/reference/caddy.md]]` | Embeds the entire note inline | Use sparingly — usually link, don't embed |
| `![[Ticket 03 Add login route#Acceptance Criteria]]` | Embeds just that heading section | Useful for kanban card summaries |

**Resolution gotchas:**

- If two files share a basename, the link resolves ambiguously — always use the path form.
- Obsidian does NOT resolve links inside code fences (```). Putting `[[link]]` inside a fence shows it as text.
- Front-matter strings containing `[[link]]` work in Dataview but not for graph view — keep links in body where possible.

## 3. Frontmatter

YAML at the very top of the file, fenced by `---` lines. Must be the first thing in the file (no blank lines before).

**Standard fields used in HUD vault:**

```yaml
---
id: T-26060501-scaffold-monorepo   # blueprints + tasks
title: Scaffold the pnpm monorepo
status: backlog                     # backlog | ready | in-progress | blocked | review | done (tasks)
                                    # draft | proposed | accepted | superseded | rejected (blueprints)
priority: p2                        # p1 (urgent) | p2 (default) | p3 | p4 (someday)
area: infra                         # feature | infra | bug | design | research
estimate: S                         # S (<2h) | M (half-day to day) | L (multi-day — consider splitting)
created: 2026-06-05                 # YYYY-MM-DD
updated: 2026-06-05
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
depends-on: []                      # list of ticket links
blocks: []
tags: [task, area/infra]
---
```

**Frontmatter rules:**

- **Always quote** values that contain wiki links: `blueprint: "[[...]]"`. YAML interprets `[[` weirdly otherwise.
- **Dates are strings** in `YYYY-MM-DD`. Do not let YAML parse them as dates (works fine as strings).
- **Empty arrays:** `[]` not omission. Keeps schema stable for Dataview queries.
- **Tags:** flat list, slash-separated for hierarchy (`area/infra`, `priority/p1`). No leading `#` inside the YAML array.
- **Status values are closed sets** — see the comments in the schema above. Inventing a new status breaks Dataview queries and Kanban sync.
- **Never write `frontmatter:` as a key inside frontmatter** (recursion). Don't laugh — it has happened.

## 4. Kanban plugin format (mrjackphil/obsidian-kanban)

The single most plugin-fragile file in the vault. Edit with care.

**Layout:**

```markdown
---

kanban-plugin: board

---

## Todo

- [ ] [[Ticket 03 Add login route]]
- [ ] [[Ticket 04 Build cashflow page]]


## In Progress

- [ ] [[Ticket 02 Set up Drizzle schema]]


## Done

- [x] [[Ticket 01 Scaffold monorepo]]




%% kanban:settings
```
{"kanban-plugin":"board","list-collapse":[false,false,false]}
```
%%
```

**Invariants — preserve these byte-for-byte:**

1. **The frontmatter must contain `kanban-plugin: board`** with blank lines as shown. The plugin parses this exact shape.
2. **Columns are `## ` (H2) headings.** Not H1, not H3.
3. **Cards are top-level list items** (`- [ ]` or `- [x]`), one per line, no nested bullets.
4. **Card content is one wiki link, nothing else.** Do not append tags, dates, or notes to the card — those live in the ticket file.
5. **The `%% kanban:settings %% ... %%` block at the bottom is plugin state.** Never modify, never reorder, never strip. If absent, the plugin works but loses per-board preferences.
6. **Blank lines between sections** are part of the format. Don't compress them.
7. **Trailing blank lines** at the end of `## Done` are tolerated by the plugin — leave them as-is.

**Adding a card:**

```markdown
## Todo

- [ ] [[Ticket 05 Add CSV importer]]    ← append at the end of the column
```

**Moving a card between columns:** delete the line from the source column, insert at the **end** of the target column. Do not reorder existing cards within a column unless explicitly priority-sorting.

**Marking done:** flip `- [ ]` → `- [x]` AND move the card to the `## Done` column. Both. The checkbox alone is not enough — the plugin renders the column, not the checkbox.

**Forbidden:**

- Adding metadata to a card line: `- [ ] [[Ticket 05]] @{2026-06-05} #area/infra` ← Kanban plugin tolerates this but the canonical home for metadata is the ticket file frontmatter. Don't duplicate.
- Nesting cards: `  - [ ] [[child ticket]]` ← breaks the plugin's column parser.
- Renaming a column ("Todo" → "Backlog") without updating the orchestrator's status-to-column mapping. Architect-approved change.
- Editing `Kanban.md` and the corresponding ticket frontmatter `status` in **separate** sessions — they must stay consistent. If you move a card, update the ticket's `status` in the same commit.

## 5. Ticket file template

```markdown
---
id: Ticket NN
title: <Imperative title — verb first>
status: todo                # todo | ready | in-progress | blocked | review | done
priority: p2
area: feature               # feature | infra | bug | design | research
estimate: S                 # S | M | L
created: YYYY-MM-DD
updated: YYYY-MM-DD
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/YYMMDDNN-slug]]"
tags: [task, area/feature]
---

## Goal

One sentence. What does "done" look like for this ticket?

## Context

Why this work is needed. Link related tickets/blueprints with `[[...]]`.

## Acceptance Criteria

- [ ] ...
- [ ] ...

## Sub-tasks

- [ ] ...
- [ ] ...

## Open Questions

(Empty at ticket creation. Engineer appends here if they hit a load-bearing ambiguity.)

## Notes

_Engineer appends progress notes here during implementation._
```

**Section discipline:**

- **Goal** is one sentence. If you need three, split the ticket.
- **Acceptance Criteria** are verifiable checkboxes. "Code is well-written" is not an AC. "All routes under `(app)/*` return 401 without a session" is.
- **Sub-tasks** are implementation steps the engineer follows. They check off as work progresses. AC checks off at the end.
- **Open Questions** is empty by default. If the orchestrator knows of an ambiguity at ticket-creation time, surface it to the architect first — don't ship a ticket with known holes.
- **Notes** is appended chronologically by the engineer (and only the engineer). Each entry is `### YYYY-MM-DD — <topic>` followed by bullets.

## 6. Embeds & transclusion

```markdown
![[Ticket 03 Add login route#Acceptance Criteria]]
```

Embeds the AC section of that ticket inline. Useful for:

- Kanban-adjacent summary views (a "Today" note that embeds AC from in-progress tickets)
- Blueprint "Tasks" sections that show the AC of generated tickets without duplicating them
- Daily-note dashboards

**Don't embed circularly** — `Note A` embeds `Note B` which embeds `Note A`. Obsidian handles it (won't crash) but the rendered output is empty.

## 7. Tags

- **Hierarchical:** `area/feature`, `area/infra`, `priority/p1`. The `/` creates parent-child relationships in the tag pane.
- **In frontmatter:** list-form, no leading `#`: `tags: [task, area/feature]`.
- **In body:** prefix with `#`: `This blocks #priority/p1 work`.
- **Reserved tags:** `#task` (every ticket file), `#blueprint`, `#adr`, `#reference`. Do not coin new top-level tags without architect approval.

## 8. Dataview queries (if present in body)

Obsidian Dataview reads frontmatter. Queries look like:

```dataview
TABLE status, priority, estimate
FROM "plan/tasks"
WHERE status != "done"
SORT priority ASC, created DESC
```

You can write queries inside any note. They render live in Obsidian. **They will not render in plain markdown viewers** — that's fine, the vault is Obsidian's primary surface.

When you write a Dataview query, ensure the fields it references actually exist in the frontmatter schema (§3). A query that references `due` when no ticket has a `due` field renders empty.

## 9. Safe-edit checklist

Before saving any change inside `plan/`:

- [ ] Frontmatter is still valid YAML (no unquoted `[[...]]`, no tabs, no trailing whitespace on lines)
- [ ] Wiki links resolve (basename or path matches an existing file or is intentionally new)
- [ ] If editing `Kanban.md`: H2 headings unchanged, `%% kanban:settings %%` block preserved, cards are top-level list items only
- [ ] If editing a ticket: `status` frontmatter matches the Kanban column the card sits in
- [ ] `updated:` field bumped to today's date when frontmatter changes
- [ ] No emojis introduced into frontmatter values (some Obsidian parsers choke on emoji in YAML keys/values)
- [ ] File ends with a single trailing newline

## 10. Forbidden patterns

```markdown
<!-- ❌ Frontmatter with unquoted wiki link -->
---
blueprint: [[plan/blueprints/26060502]]   # YAML may misparse
---

<!-- ❌ Kanban card with extra content -->
- [ ] [[Ticket 03]] — needs review #urgent  # metadata belongs in the ticket

<!-- ❌ Renaming a Kanban column without architect approval -->
## Backlog   ← was "Todo" — breaks the status→column mapping

<!-- ❌ Hand-editing the .canvas file -->
(open Obsidian Canvas instead)

<!-- ❌ Mixing tab and space indentation -->
(Obsidian normalizes on save, but you can desync with CLI edits — always use 2 spaces)

<!-- ❌ Status drift -->
# In the ticket frontmatter:
status: done
# But the Kanban card is still in `## In Progress`
```

## 11. CLI helpers

When editing programmatically:

```bash
# List all tickets
ls "plan/tasks/" | sort

# Find the highest ticket number
ls "plan/tasks/" | grep -oE '^Ticket [0-9]+' | awk '{print $2}' | sort -n | tail -1

# Find which tickets are in-progress
grep -l '^status: in-progress$' plan/tasks/*.md

# Verify all wiki links in a file resolve
# (rough check — Obsidian does the real resolution)
grep -oE '\[\[[^]]+\]\]' plan/Kanban.md
```

If Obsidian Local REST API is enabled on the operator's machine, prefer it for structured edits (PATCH on frontmatter, atomic kanban-card moves). It preserves plugin invariants better than raw file writes. API key lives in the operator's keychain, not in the vault.

## When this skill applies

- Editing `plan/Kanban.md`
- Creating or editing any file under `plan/tasks/`
- Writing new blueprints
- Adding or modifying frontmatter on any vault file
- Linking between vault notes

## When to escalate

- Renaming or restructuring the vault layout → architect approval; update this skill in the same change
- Adding a new Obsidian plugin (Dataview view, Templater template, etc.) → architect review for compatibility with existing files
- Migrating to a different kanban plugin → blueprint required
