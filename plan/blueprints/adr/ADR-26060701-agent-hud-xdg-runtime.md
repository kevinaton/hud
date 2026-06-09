---
title: agent-hud gets a dedicated XDG runtime subtree, not the tenant root
type: adr
status: accepted
author: architect
created: 2026-06-07
updated: 2026-06-07
tags:
  - architecture
  - adr
  - agents
  - server
  - xdg
  - isolation
  - security
supersedes: []
superseded-by: []
related:
  - "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
  - "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
  - "[[HUD]]"
---

# ADR-26060701 — agent-hud gets a dedicated XDG runtime subtree, not the tenant root

## Context

Per `26060503`, the `agent-hud` user (UID 2011) has `HOME=/srv/hud` and group `hud`,
sharing the tenant root with the owner user `hud` (UID 2001). The tenant root is mode
`750 hud:hud`; `/srv/hud/secrets/` is `700 hud:hud` — owned by `hud`, **not readable by
`agent-hud`**.

When `agent-hud` runs an agent CLI (Gemini, Claude, Opencode per `26060701` §8), each CLI
writes its own state to XDG paths derived from `$HOME`:

- `$XDG_CONFIG_HOME` (default `~/.config`) — CLI settings, MCP registries, persona configs.
- `$XDG_CACHE_HOME` (default `~/.cache`) — model/response caches.
- `$XDG_DATA_HOME` (default `~/.local/share`) — credentials, OAuth tokens, session state.
- `$XDG_STATE_HOME` (default `~/.local/state`) — history, logs.

With `HOME=/srv/hud` and the defaults, every CLI would scatter `agent-hud`-owned
dot-directories directly into the **tenant root** that `hud` owns. That collides with three
things this server layout already commits to:

1. **Ownership clarity.** `/srv/hud` is `hud:hud`. An `agent-hud`-owned `.config/`,
   `.cache/`, `.local/` sitting inside it breaks the "one tenant root, one owner" invariant
   and the mode `750` story (`agent-hud` would be writing into a directory it does not own,
   relying on the group-write bit, which `26060503` deliberately does **not** grant —
   `/srv/hud` is `750`, group has no `w`).
2. **Discoverability.** `26060503`'s server-map promises a fixed per-tenant subdir shape
   (`app/ data/ secrets/ logs/ runtime/ vault/ backups/`). Agent CLI dotfiles are none of
   these and would pollute the map's clean enumeration.
3. **Credential blast radius.** Agent CLIs persist OAuth tokens / API keys under
   `$XDG_DATA_HOME`. Those must live somewhere `agent-hud` owns and `hud` does not casually
   read — the mirror image of how `26060503` keeps `/srv/hud/secrets/` owned by `hud` and
   unreadable by `agent-hud`.

This ADR resolves where `agent-hud`'s XDG state lives. It is the concrete answer to the
ownership half of `26060701` OQ-2 (DB-credential propagation is separate and already decided
there — Option (c), env passthrough via `sudo -E` + sudoers `env_keep`). OQ-2 covers how the
MCP subprocess reaches the DB; **this** ADR covers where the CLI itself keeps its own runtime
state.

## Decision

**Provision a dedicated `agent-hud`-owned XDG runtime subtree and point the XDG environment
variables at it (Option B).**

```
/srv/hud/agent-runtime/            # 700 agent-hud:hud   <- agent-hud owns this, hud cannot read
├── config/                        #   $XDG_CONFIG_HOME
├── cache/                         #   $XDG_CACHE_HOME
├── data/                          #   $XDG_DATA_HOME    (OAuth tokens, API creds)
├── state/                         #   $XDG_STATE_HOME   (CLI history)
└── runtime/                       #   $XDG_RUNTIME_DIR  (sockets, ephemeral; 700)
```

Provisioned at `26060503` L0 (same pass that creates the user). The `emily` wrapper and the
`agent-hud` login profile export:

```sh
export XDG_CONFIG_HOME=/srv/hud/agent-runtime/config
export XDG_CACHE_HOME=/srv/hud/agent-runtime/cache
export XDG_DATA_HOME=/srv/hud/agent-runtime/data
export XDG_STATE_HOME=/srv/hud/agent-runtime/state
export XDG_RUNTIME_DIR=/srv/hud/agent-runtime/runtime
```

These five vars are added to the sudoers `env_keep` allowlist alongside the `HUD_AGENT_*`
and `DATABASE_URL` entries from `26060701` §A4, so they survive the `sudo -u agent-hud -E`
privilege change.

`HOME` stays `/srv/hud` (the `/etc/passwd` entry from `26060503` is unchanged), so the
tenant-root conventions, the `cd /srv/hud/agents/emily` canonical path, and the per-tenant
`CLAUDE.md` discovery all keep working. Only the *XDG* targets are redirected. Subtree mode is
`700 agent-hud:hud`: `agent-hud` reads/writes its own runtime; `hud` (the tenant owner) cannot
read agent credentials, and cross-tenant `portfolio` already cannot reach `/srv/hud` at all.

This adds one row to the server-map under the `hud` tenant: `Agent runtime:
/srv/hud/agent-runtime (agent-hud:hud, 700)`.

## Consequences

**Positive**

- Tenant root stays `hud:hud` with no foreign-owned dot-directories; the `750` invariant and
  the clean subdir enumeration in the server-map both hold.
- Agent credentials (OAuth/API tokens under `data/`) are owner-isolated to `agent-hud` at the
  filesystem layer — symmetric with `hud`-owned `/srv/hud/secrets/`. Neither user can read the
  other's secrets; both still fall inside the `/srv/hud` tenant boundary that `26060503`
  enforces against `portfolio`.
- All three CLIs (Gemini/Claude/Opencode) and any future agent persona inherit the same
  redirection for free — it is environment-level, not per-CLI config.
- Backup/exclude policy is trivially expressible: one path (`agent-runtime/`) to exclude from
  Litestream/snapshot (it is regenerable cache + re-auth-able tokens), one path to back up if
  re-auth friction is undesirable. No hunting for scattered dotfiles.
- Cleanly extends to `agent-portfolio` later: mirror as `/srv/portfolio/agent-runtime/`
  `700 agent-portfolio:portfolio` with no new pattern to learn.

**Negative / costs**

- Five extra env vars to keep correct across the wrapper, the login profile, and the sudoers
  `env_keep`. If a CLI is launched *without* the profile (e.g. a bare `sudo -u agent-hud claude`
  outside the wrapper), it falls back to `~/.config` etc. under `/srv/hud` — the exact mess
  this avoids. Mitigation: set the exports in `agent-hud`'s shell profile (`/srv/hud/.profile`
  is `hud`-owned and not writable by `agent-hud`; instead place them in a root-provisioned
  `/etc/profile.d/agent-hud-xdg.sh` guarded by `[ "$(id -un)" = agent-hud ]`), so the
  redirection holds even outside the wrapper. Provision test asserts
  `sudo -u agent-hud env | grep XDG_DATA_HOME` returns the subtree path.
- One more directory in the L0 provisioning script and one more line in the server-map.
- `$XDG_RUNTIME_DIR` conventionally lives on tmpfs with per-login lifecycle managed by
  `pam_systemd`. Here it is a plain dir on disk. Acceptable for a single-operator agent
  runtime (no multi-session race, no security requirement for tmpfs); noted so a future reader
  does not assume systemd-managed semantics.

## Alternatives Considered (rejected)

- **A — chmod the tenant root to let `agent-hud` write its dotfiles in `/srv/hud` directly.**
  Why not: breaks the `750 hud:hud` invariant, forces a group-write bit on the tenant root
  (widening every group member's reach), and scatters `agent-hud`-owned credentials into a
  `hud`-owned tree — inverting the ownership clarity `26060503` is built on.

- **C — give `agent-hud` a separate home outside the tenant (e.g. `/home/agent-hud` or
  `/var/lib/agent-hud`).**
  Why not: pulls agent state *out* of the `/srv/hud` tenant boundary, so it no longer rides
  the tenant's perms, backup, and slice story; breaks `26060503`'s "everything for a tenant
  lives under `/srv/<tenant>`" rule and the `cd /srv/hud/agents/emily` ergonomics that depend
  on `HOME=/srv/hud`; and creates a third place to reason about for isolation against
  `portfolio`.

- **D — leave XDG defaults, accept dotfiles in `/srv/hud`.**
  Why not: this is the status quo problem statement, not a fix — it produces exactly the
  ownership collision, map pollution, and credential-placement ambiguity this ADR exists to
  remove.

## Links

- Supplies the ownership answer for `26060503` §2 (filesystem layout) — adds the
  `agent-runtime/` subtree and one server-map row.
- Resolves the CLI-runtime-state half of `26060701` OQ-2 (DB-credential passthrough remains
  Option (c) as decided there; this ADR is additive, not a change to that decision).
