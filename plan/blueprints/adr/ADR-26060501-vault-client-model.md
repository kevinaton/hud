---
title: Vault Client Model — MacBook now, Nexus last, iPhone deferred
type: adr
status: accepted
author: architect
created: 2026-06-05
updated: 2026-06-06
tags:
  - architecture
  - adr
  - vault
  - nexus
  - obsidian
supersedes: []
superseded-by: []
related:
  - "[[plan/reference/Obsidian vault management]]"
  - "[[HUD]]"
  - "[[plan/blueprints/26060402-obsidian-iphone-sync-webdav]]"
---

# ADR-26060501 — Vault Client Model

## Context

The HUD's Knowledge layer is an Obsidian vault: a folder of markdown (plus `.canvas` JSON, plus Kanban-plugin markdown) on the Hetzner server at `/vault`, treated as the single source of truth.

Earlier planning (see `26060402-obsidian-iphone-sync-webdav.md` and `Obsidian vault management.md`) called for three clients to be online during MVP: MacBook native Obsidian, iPhone native Obsidian via WebDAV+Remotely Save, and a future browser client.

After brainstorming, we are simplifying. The iPhone path is deferred until the need is proven. Nexus — the in-browser vault client embedded as a tab inside the HUD dashboard — becomes the second client and the **last** thing built in the HUD roadmap. For Phases 0–4 there is exactly one human-driven writer to `/vault` (MacBook Syncthing) plus the agent runtime via `vault-api`.

This ADR records that decision and the principles that constrain Nexus when it eventually ships.

## Decision

1. **Client order is fixed: MacBook → Nexus → (iPhone, deferred).**
   - MacBook native Obsidian over Syncthing is the only human-driven vault client from Phase 0 through Phase 4.
   - Nexus (browser, inside HUD) is the second human-driven client, shipped in the last phase of the HUD roadmap.
   - iPhone Obsidian is **deferred** — revisited only when "I really wish I could capture this from my phone" becomes a recurring pain. When that happens, the choice is between (a) native Obsidian + WebDAV per the existing blueprint, or (b) making Nexus mobile-responsive.

2. **Nexus is a tab inside the HUD dashboard**, served at `hud.kevinaton.com/nexus`. It is not a separate site, not a separate deploy, and not a separate auth surface. It inherits HUD's Cloudflare Access policy.

3. **Nexus scope is a strict subset of Obsidian**: Canvas, Kanban, Note editor. No graph view, no plugin runtime, no Dataview, no Templater. If a feature outside this subset is needed, the answer is "open Obsidian on the MacBook," not "extend Nexus."

4. **Nexus shares `vault-api` with the agent runtime.** One Node/TypeScript service exposes both MCP (for agents) and HTTP/WebSocket (for Nexus). One audited code path touches `/vault`. No forked file I/O.

5. **Format fidelity is non-negotiable.** Nexus reads and writes `.canvas` JSON and Kanban-plugin markdown in byte-compatible form with native Obsidian. The `%% kanban:settings %%` block is preserved verbatim. This is the entire reason Nexus can coexist with native Obsidian on the same `/vault`.

6. **No new source of truth.** SQLite (Litestream-backed) is the database. `/vault` is the knowledge filesystem. Redis is ephemeral. Nexus does not introduce a fourth.

### Frontend / Backend stack (recorded, not implementation-detailed)

- **Frontend:** shadcn/ui (Radix + Tailwind), React. Canvas via React Flow (matches `.canvas` node/edge semantics 1:1). Note editor via CodeMirror 6 in source mode with a toggle preview pane. Markdown rendering pipelined through a strict sanitizer (DOMPurify-class).
- **Backend:** `vault-api` Node/TS service, dual transport (MCP + HTTP/WS), file-watcher (inotify/chokidar) pushing change events over SSE so the browser tab reflects MacBook edits in seconds.
- **Concurrency policy:** last-writer-wins with `.conflict-<timestamp>.md` sidecars. Matches the iPhone WebDAV policy if/when iPhone is revived. Only becomes load-bearing in Phase 5 when there are two writers.

## Alternatives Considered

- **Build iPhone WebDAV at MVP (current `Obsidian vault management.md` plan).** Rejected for now: it ships a sync surface (Caddy WebDAV + Remotely Save + Cloudflare Service Token) before there is even finance data to capture from a phone. Defer until a real need shows up.
- **Make Nexus a standalone site at `nexus.kevinaton.com`.** Rejected: two auth surfaces, two deploys, no functional gain. The HUD is the one logged-in surface.
- **Build Nexus earlier in the roadmap (e.g. Phase 2).** Rejected: every earlier phase is reachable through SSH + CLI + agents. A browser editor for the vault is a quality-of-life upgrade, not a capability gate. It belongs at the end.
- **Use tldraw for Canvas.** Rejected: visually closer to Obsidian but uses its own internal data model — round-tripping to/from `.canvas` JSON is lossy on edges. React Flow maps to `.canvas` semantics directly.
- **Use Tiptap / WYSIWYG for the Note editor.** Rejected for now: serialization-to-markdown drift would silently reformat files that native Obsidian and any future iPhone client also write. CodeMirror in source mode preserves byte fidelity.
- **Recreate Obsidian plugins (Dataview, graph, Templater) inside Nexus.** Rejected: that is rebuilding Obsidian. Nexus is a subset by design.

## Security & Threat Model

This ADR records a client-ordering and scope decision. It does not itself introduce a new trust boundary — the boundaries it commits to are:

- **Nexus inherits HUD's Cloudflare Access boundary** (Cloudflare → Tunnel → Caddy → HUD app). No new public surface.
- **Nexus runs as a dedicated unix user** (e.g. `nexus`) with group-write on `/vault` only — confirmed in the Phase-5 implementation blueprint, not here.
- **iPhone WebDAV trust boundary is shelved.** The Cloudflare Service Token, basic-auth pair, and `vault.kevinaton.com` hostname described in `Obsidian vault management.md` are **not provisioned** under this ADR. When iPhone is revived, that blueprint is reactivated as-is or replaced.

A full STRIDE pass for Nexus belongs in the Phase-5 implementation blueprint (`blueprints/<future-date>-nexus-web-vault-client.md`), not in this ADR. Reason: the threats depend on the concrete API surface (HTTP routes, WS events, attachment upload), which is not designed yet.

## Consequences

**Positive**
- Phase 0–4 has one human-driven vault writer. No conflict policy needed for MVP. Operational simplicity.
- `Obsidian vault management.md` becomes simpler: Syncthing + GitHub backup is the whole story until Nexus.
- `vault-api` design can be driven by agent needs first, then extended for Nexus once those needs are validated.
- HUD remains the single logged-in surface — no second auth domain to maintain.

**Negative**
- No mobile capture during Phases 0–4. If the user wants to jot a note from their phone, they SSH via Termius and run an agent command, or wait until they're at the MacBook. Acceptable trade for now.
- Prior blueprint work on iPhone WebDAV (`26060402`) is shelved, not deleted. Doc maintenance debt: the `Obsidian vault management.md` reference doc needs a "deferred" banner so future-Kevin doesn't think WebDAV is in flight. (Companion to this ADR.)
- Nexus ships late. Until then, Canvas and Kanban edits go through native Obsidian on the MacBook only.

**Neutral**
- The vault contract (`/vault` canonical, `.canvas` and Kanban-md format fidelity, no new source of truth) is unchanged and now stated more explicitly.

## Open Questions

- When does "iPhone deferred" get revisited? Suggested trigger: the user notes ≥3 missed captures in a single month, or starts traveling for >1 week with no MacBook. No calendar date.
- Does Nexus need any keyboard-shortcut parity with Obsidian (e.g. `Cmd+P` quick switcher)? Decide in the Phase-5 blueprint.
- Attachments folder convention (`/vault/_attachments/…`) is implied but not ratified. Decide in the Phase-5 blueprint.

## Related Documents

- `plan/HUD.md` — overall HUD architecture and roadmap.
- `plan/reference/Obsidian vault management.md` — vault sync reference; needs a "deferred" banner on the iPhone WebDAV sections (companion change to this ADR).
- `plan/blueprints/26060402-obsidian-iphone-sync-webdav.md` — iPhone sync blueprint, now shelved; reactivate if/when the deferral trigger fires.
