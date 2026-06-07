---
title: Build vault stays local — prod /vault is born blank in Phase 2
type: adr
status: superseded
author: architect
created: 2026-06-06
updated: 2026-06-07
tags:
  - architecture
  - adr
  - vault
  - repo
  - deploy
  - security
supersedes: []
superseded-by: ["operator-decision-2026-06-07"]
related:
  - "[[plan/blueprints/adr/ADR-26060501-vault-client-model]]"
  - "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
  - "[[plan/reference/Obsidian vault management]]"
  - "[[HUD]]"
---

> **SUPERSEDED 2026-06-07 by operator decision.** D1 (untrack `plan/` via `.gitignore`) was never executed and is now voided. `plan/` stays tracked in git and coexists with the codebase. D2 (prod `/srv/hud/vault/` born empty) and D3–D6 remain valid independently.

# ADR-26060602 — Build vault stays local; prod /vault is born blank in Phase 2

## Context

Two distinct Obsidian vaults exist in the HUD lifecycle and they have been informally conflated:

1. **Build vault** — `~/Documents/Project/HUD/plan/` on the MacBook. Contains construction-time artifacts: blueprints, ADRs, tickets, Kanban, reference docs, the Canvas. Authored by architect + orchestrator + engineer (Claude Code agents) and the operator. Currently tracked in git (commit `a2873ae`) and would, by default, land on Hetzner at `/srv/hud/app/plan/` once the deploy mechanism in `26060503` runs.

2. **Prod vault** — `/srv/hud/vault/` on the Hetzner box per `26060503` §2 and `HUD.md` Phase 2. Knowledge layer of the HUD: journal, research, monthly finance reports, kanban card bodies, project plans, decisions. Synced to MacBook via Syncthing per `ADR-26060501`. Read/written by the operator (MacBook Obsidian), agents (via `vault-api`), and eventually Nexus in Phase 5.

The build vault is **construction debris**. It documents how HUD was built. It has no role in the steady-state HUD product and would actively pollute the prod vault if mixed in. The prod vault must be born blank — a clean knowledge space the operator moves into after construction.

`ADR-26060501` named the prod-vault client model but said nothing about the build vault. `26060503` provisions an empty `/srv/hud/vault/` directory at L0 but does not explicitly forbid build-vault content from migrating in. This ADR closes both gaps.

A secondary question came up in this discussion: whether to access the prod vault via `obsidian-headless` (Obsidian's official npm sync CLI) over SSH. That tool requires an Obsidian Sync subscription and introduces a second sync transport alongside Syncthing — a path `ADR-26060501` already foreclosed. This ADR records the explicit rejection so it does not resurface.

## Decision

### D1. The build vault never reaches the production server.

`plan/` is a MacBook-local working surface. It is excluded from anything that lands on Hetzner. Mechanism: **A1 — untrack via `.gitignore`** (chosen over deploy-time rsync excludes and the two-repo alternatives evaluated in this session).

Operator-executed git commands (to be run by orchestrator or operator, not by the architect):

```bash
git rm -r --cached plan/
echo "plan/" >> .gitignore
git add .gitignore
git commit -m "untrack plan/ — build vault stays local-only"
```

Effect:
- `plan/` stays on disk locally; Obsidian continues to open it normally.
- All future blueprints, tickets, Kanban edits are invisible to git.
- Any future Hetzner deploy mechanism (`git clone`, `git pull`, rsync from the repo) produces a working tree with no `plan/` directory.
- Historical commits still contain `plan/` content — this is acceptable while the repo remains private. If/when the repo is published, a `git filter-repo` history scrub is the follow-up (separate ADR if needed).

### D2. The production `/srv/hud/vault/` is created empty at L0 and stays empty until Phase 2.

The provisioning script defined under `26060503` Phase L0 creates `/srv/hud/vault/` and **verifies it contains zero files** at the end of the provisioning run. No content from `plan/` is copied in. No content from anywhere else is copied in. Phase 2 (Knowledge layer) is the first time markdown enters the prod vault, and that content is authored fresh by the operator on the MacBook (or written by agents through `vault-api`).

Concrete provisioning requirement (added to `26060503` L0 spec via this ADR, not by editing the blueprint):

```bash
# in the L0 provisioning script
install -d -o hud -g hud -m 0750 /srv/hud/vault
test -z "$(ls -A /srv/hud/vault)" || { echo "FATAL: /srv/hud/vault is not empty"; exit 1; }
```

### D3. If a build-time artifact is permanently useful, it is *re-authored*, not copied.

Some build-time docs (e.g. infra reference notes like `plan/reference/caddy.md`, `plan/reference/secrets.md`) describe steady-state knowledge that operator-Kevin will want to revisit after HUD ships. The temptation will be to drag those files into `/srv/hud/vault/reference/` at Phase 2 launch. **Do not.**

Rule: any build-vault note whose content survives into the prod vault is **rewritten** as a fresh prod-vault note — stripped of build-phase context (ticket references, "to be built", "Phase 0", architect/orchestrator/engineer roles), retitled if needed, and committed to the prod vault's intended structure (see Open Question OQ-2 below). The build vault stays a pristine record of how HUD was built; the prod vault stays a pristine record of what HUD knows.

### D4. Single `main` branch for now. No `dev` → `main` split.

The release-discipline benefit of a `dev → main` workflow does not pay for itself until there is a real deploy target (Hetzner, Phase 1). For Phase 0 (local-first MVP) a single `main` branch with feature branches for risky work is sufficient. Revisit at the start of Phase 1, when "deployable vs not" becomes a meaningful distinction.

If `dev → main` is adopted later, the procedure is recorded in `Open Questions` below for retrieval.

### D5. `obsidian-headless` is explicitly *not* adopted.

Considered: running `obsidian-headless` (npm `obsidian-headless`, Obsidian official) on Hetzner against an Obsidian Sync remote vault, so the operator could "connect from anywhere." Rejected.

Reasons:
- `ADR-26060501` picked Syncthing as the MacBook ↔ `/srv/hud/vault/` sync transport. Adding Obsidian Sync as a second concurrent transport doubles the consistency surface for zero functional gain.
- Obsidian Sync is a paid subscription ($4–10/mo) and an external trust boundary. `Obsidian vault management.md` already rejected it on self-hosting grounds.
- The hard constraint in the upstream docs ("Do not use both the desktop app Sync and Headless Sync on the same device") creates a foot-gun on the MacBook.
- Editing the prod vault from a Hetzner SSH session does not require any Obsidian tool. `nvim`/`vim` on the markdown files is the correct interface — Syncthing propagates the edits to MacBook Obsidian within seconds.

If Obsidian Sync ever becomes interesting (e.g. for iPhone capture without standing up WebDAV), it is re-evaluated against the deferred iPhone path in `26060402` and `ADR-26060501`, not retrofitted here.

### D6. `obsidian-cli` (Yakitrak Go binary) is also *not* adopted on the server.

It is a remote-control CLI for a *running GUI* Obsidian instance. Hetzner has no GUI. Not applicable.

## Alternatives Considered

- **A2 — Keep `plan/` tracked; exclude at deploy time via `rsync --exclude=plan/`.** Rejected as the primary mechanism. Works correctly but couples the rule to the deploy mechanism, which is not yet fully defined in `26060503`. A1 holds even if the deploy mechanism later changes from `git pull` to artifact-based to image-based. Defense-in-depth recommendation: the deploy script in `26060503` should *also* exclude `plan/` even if it is already gitignored. Two layers, same answer.
- **A3 — Move `plan/` to a separate repo (`HUD-plan`).** Rejected for now. Highest one-time cost (history split, two repos to clone). Becomes attractive if/when the HUD code repo is published — at that point a separate planning repo keeps build-phase strategy private. Not blocking; convert later if needed.
- **Branch-based separation (`dev` has `plan/`, `main` does not).** Rejected. Merging `dev → main` re-introduces `plan/` on every merge unless workarounds (`.gitattributes merge=ours`, filter-branch on release, custom merge scripts) are layered on. All of those cost more than `A1` and accomplish the same outcome less reliably.
- **Adopt `dev → main` workflow now.** Rejected as premature; revisit at Phase 1 cutover. Documented in OQ-3 for retrieval.

## Security & Threat Model

This ADR narrows two trust boundaries; it does not introduce new ones.

**Trust boundaries affected:**
- **Build vault (`plan/`) ↔ production filesystem (`/srv/hud/`)** — previously implicit, now explicit: zero flow. Build-vault content cannot reach the production filesystem through any deploy path.
- **Prod vault (`/srv/hud/vault/`) ↔ MacBook** — unchanged, governed by `ADR-26060501` (Syncthing).
- **Operator ↔ third-party sync services** — `obsidian-headless` / Obsidian Sync explicitly rejected; no new third-party trust boundary opened.

**STRIDE:**

- **Spoofing** — N/A; no new identity surface.
- **Tampering** — N/A; no new write paths.
- **Repudiation** — Improved. The build vault now stays in a single, version-controlled-locally working surface (MacBook + git history on the dev machine), reducing the surface area where untracked edits could occur.
- **Information disclosure** — **Primary security benefit of this ADR.** Build-vault content includes pre-deployment threat models, AppArmor rule drafts, secret-handling rationale, attacker-model exposition (`26060503` §Security). Shipping that body of text to a publicly-reachable production server (even gated by CF Access) is unnecessary exposure of adversary-useful information. D1 + D2 eliminate that exposure.
- **Denial of service** — N/A; no new request paths.
- **Elevation of privilege** — N/A; no new processes.

**Controls (mapped to threats):**

| Threat | Control | Layer |
|---|---|---|
| Build-vault content exfiltrated via deploy | `plan/` in `.gitignore`; deploy script also excludes `plan/` (belt-and-braces) | Repo + deploy |
| Prod vault polluted with build noise at Phase 2 launch | L0 provisioning script asserts `/srv/hud/vault/` is empty | Provisioning |
| Operator habitually copies build notes into prod vault | D3 ("re-author, do not copy") + Phase 2 launch checklist | Convention |
| Third-party sync service compromise | Not opened — `obsidian-headless` rejected | N/A |
| Historical `plan/` content visible in git history | Repo stays private; if published, follow-up `git filter-repo` ADR | Repo access |

**Residual risk:**
- Historical commits on `main` still contain build-vault content. Acceptable while repo is private. Becomes a real risk only if repo is published; that event triggers a separate history-scrub ADR.
- Operator-discipline failure (D3): nothing mechanically prevents the operator from `cp -r ~/Documents/Project/HUD/plan/* /srv/hud/vault/` at Phase 2 launch. Mitigation is procedural — a Phase 2 launch checklist that includes the "re-author, do not copy" rule. Acceptable; the cost of a mechanical enforcement (e.g. a watcher that deletes `plan/`-shaped files in `/srv/hud/vault/`) exceeds the risk.

## Consequences

**Positive**
- `plan/` and `/srv/hud/vault/` are formally distinct, with a one-way "never crosses" rule.
- The prod vault starts as a clean knowledge surface; no Phase 0 noise pollutes Phase 2's launch state.
- Single `main` branch keeps git operations simple through MVP.
- `obsidian-headless` rejection prevents an attractive nuisance that would otherwise reopen the sync-transport debate quarterly.
- The build vault remains co-located with the code repo (cross-linkable from blueprints to commit SHAs, useful for traceability).

**Negative**
- Historical commits on the repo still contain `plan/`. A future "open-source HUD" event would require a history rewrite.
- The "re-author, do not copy" rule (D3) depends on operator discipline; no mechanical enforcement.
- Operator must execute the `git rm --cached` + `.gitignore` commands manually; architect cannot run them.

**Neutral**
- The deploy mechanism described in `26060503` (`/srv/hud/app/` as a git checkout) continues to work, just with `plan/` absent from the working tree.
- `ADR-26060501`'s Syncthing-only commitment is preserved unchanged.

## Open Questions

- **OQ-1. Build vault lifetime after Phase 5.** Three options: (i) `plan/` is archived to a tarball and stops growing; (ii) `plan/` keeps living, used for v2 / ongoing strategy; (iii) `plan/` moves to a sibling location outside the HUD repo entirely. **Trigger:** decide at Phase 5 cutover. **Default if undecided:** (ii) — `plan/` keeps growing alongside HUD's continued evolution.
- **OQ-2. Prod-vault folder structure.** `/srv/hud/vault/` will need a top-level structure (`journal/`, `research/`, `finance/monthly/`, `decisions/`, `kanban/`?). Suggested but not ratified. **Trigger:** ratify in the Phase 2 Knowledge-layer blueprint (`blueprints/<future-date>-knowledge-layer-vault-init.md`). Must avoid build-vault folder names (`blueprints/`, `tasks/`).
- **OQ-3. When to introduce `dev` → `main`.** Suggested trigger: 1–2 weeks before the first Hetzner deploy (mid-Phase 1). Recorded procedure for that moment:

  ```bash
  git branch -m main dev
  git push -u origin dev
  git checkout -b main
  git push -u origin main
  # then on GitHub: set main as default branch + branch protection
  ```

  This is *not* executed by this ADR.

- **OQ-4. Historical `plan/` scrub.** If/when the HUD code repo is ever published, a `git filter-repo --path plan/ --invert-paths` run + force push is the right tool, followed by a fresh clone from contributors. Tracked here as a known future operation; not scheduled.

## Related Documents

- `plan/HUD.md` — overall HUD architecture and roadmap; Phase 2 (Knowledge) is the trigger for D2.
- `plan/blueprints/adr/ADR-26060501-vault-client-model.md` — establishes Syncthing as the MacBook ↔ prod-vault transport; this ADR builds on that decision and explicitly rejects `obsidian-headless` as an alternative.
- `plan/blueprints/26060503-multi-tenant-server-layout.md` — defines `/srv/hud/vault/` provisioning at L0; D2 in this ADR specifies that provisioning must verify the directory is empty.
- `plan/reference/Obsidian vault management.md` — sync reference; already rejects paid Obsidian Sync on self-hosting grounds.
- `plan/blueprints/26060402-obsidian-iphone-sync-webdav.md` — iPhone WebDAV blueprint, currently deferred; mentioned here only because Obsidian Sync (if ever reconsidered) would intersect that decision.

## Tasks

Tickets to be created by the orchestrator:

- Ticket NN — Untrack `plan/` from git and add to `.gitignore` (executes D1 commands above)
- Ticket NN — Update the L0 provisioning script in `26060503` to assert `/srv/hud/vault/` is empty (D2)
- Ticket NN — (Phase 1 trigger) Decide whether to adopt `dev → main` branching at Hetzner cutover (OQ-3)
- Ticket NN — (Phase 2 trigger) Ratify prod-vault folder structure (OQ-2)
