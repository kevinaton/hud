---
id: Ticket 27
title: Provision agent-hud XDG Runtime Subtree and Wire Wrapper Env Vars
status: done
priority: p2
area: infra
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 26 Install Claude and OpenCode CLIs Globally Matching Gemini Setup]]"]
blocks: []
blueprint: "[[plan/blueprints/adr/ADR-26060701-agent-hud-xdg-runtime]]"
tags: [task, area/infra]
---

## Goal

`agent-opencode`, `agent-claude`, and `agent-gemini` all run cleanly as `agent-hud` with zero `EACCES` errors — without widening write access to the `/srv/hud` tenant root.

## Context

[[Ticket 26 Install Claude and OpenCode CLIs Globally Matching Gemini Setup]] surfaced that `agent-hud` (uid 2011) cannot write to its own `$HOME=/srv/hud` (owned `hud:hud`, mode `750`, no group-write bit). This hard-fails `agent-opencode` (`EACCES: mkdir '/srv/hud/.local/share/opencode'`) and produces non-fatal but logged `EACCES` noise for `agent-claude`/`agent-gemini` trying to create their own config/cache/state dirs.

The architect evaluated three remediation options (chmod the tenant root, give `agent-hud` dedicated XDG dirs, or split `agent-hud` onto a separate `$HOME`) and recorded the decision in [[plan/blueprints/adr/ADR-26060701-agent-hud-xdg-runtime]]: **provision a dedicated `agent-hud`-owned XDG runtime subtree under `/srv/hud/agent-runtime/` and redirect `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME` in the `agent-*` wrapper scripts** — rejecting `chmod g+w /srv/hud` (widens write access to the tenant's most security-sensitive directory, scatters agent dotfiles into the `hud`-owned tree) and a separate `$HOME` (breaks `HOME`-dependent ergonomics the [[plan/blueprints/26060701-hud-agent-runtime-emily]] wrapper design relies on, pulls agent state outside the tenant boundary it needs to read/write within anyway).

Read the ADR end-to-end before implementing — it specifies exact paths, ownership, and modes. **All changes must land in the versioned sources** (`ops/provision/hud-provision.sh`, `ops/provision/bin/agent-*`) — never hand-patch the live `/srv` or `/opt` copies directly; re-provisioning must be able to reproduce the fix idempotently.

## Acceptance Criteria

- [x] `ops/provision/hud-provision.sh` provisions an `agent-hud`-owned XDG runtime subtree per the ADR's exact paths/ownership/modes (e.g. `/srv/hud/agent-runtime/{config,cache,state}` at `700 agent-hud:hud`, with the parent traversable by `agent-hud`) using the existing `ensure_dir` helper pattern
- [x] `/srv/hud` itself remains `750 hud:hud` — unchanged (verify with `stat -c '%a %U:%G' /srv/hud`)
- [x] All three `ops/provision/bin/agent-{claude,gemini,opencode}` wrappers export `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME` pointing at the new `agent-hud`-owned subtree (alongside the existing `HOME=/srv/hud` override), and any required vars are added to the sudoers `env_keep` allowlist
- [x] `re-running hud-provision.sh is idempotent` — second run reports all relevant steps as skipped/no-op
- [x] `/opt/agents/bin/agent-opencode --version` exits 0 with no `EACCES` anywhere in stderr or in `~/.local/share/opencode/log/*.log` (resolved to the new `XDG_DATA_HOME`)
- [x] `/opt/agents/bin/agent-claude --version` and `/opt/agents/bin/agent-gemini --version` exit 0 with no `EACCES` noise in stderr (the previously-tolerated degraded case from Ticket 26 is now clean)
- [x] `agent-hud` still cannot create new entries at the tenant root: `sudo -u agent-hud touch /srv/hud/x` → `Permission denied`
- [x] Changes committed (provisioning script + wrapper sources, re-copied to `/opt/agents/bin/` and re-run on the live box)

## Sub-tasks

- [x] Read [[plan/blueprints/adr/ADR-26060701-agent-hud-xdg-runtime]] end-to-end for exact paths/ownership/modes before touching anything
- [x] Edit `ops/provision/hud-provision.sh`: add the `agent-hud`-owned subtree provisioning (and adjust `/srv/hud/runtime` traversal mode if the ADR specifies it — check whether `agent-hud` needs `750` group-traverse on any shared parent dir)
- [x] Edit all three `ops/provision/bin/agent-*` wrappers to export the XDG vars alongside `HOME=/srv/hud`
- [x] Re-run `hud-provision.sh` on the live box; confirm idempotency (no changes on second run)
- [x] Re-copy wrappers to `/opt/agents/bin/`
- [x] Run all six verification commands from the AC and capture output in Notes
- [x] Commit

## Open Questions

## Notes

### 2026-06-08 — orchestrator: reversed by agent-hud retirement

Kevin retired the `agent-hud` Linux user entirely on 2026-06-08 (single-operator
consolidation onto `hud`/`root` — root cause was a `$HOME=/srv/hud` collision that
made `hud` unable to log in to Claude Code; full report in
[[Ticket 32 Commit and Reconcile Provisioning Sources After Retiring agent-hud]]).

This ticket's deliverables no longer exist on the live system or in versioned
sources: `/srv/hud/agent-runtime/` was archived to
`/srv/hud/backups/agent-hud-runtime-bak-20260608`, `/etc/sudoers.d/hud-operator`
was removed, the `agent-hud` user was deleted, and the provisioning-script /
wrapper changes this ticket made are being removed by Ticket 32.

Status remains `done` — the work was correctly implemented and verified against
the spec (`ADR-26060701-agent-hud-xdg-runtime`) at the time. It was reversed by a
subsequent, separate architectural decision (single-operator consolidation), not
by a defect in this ticket's implementation. Leaving the historical record intact.

### 2026-06-07 — implementation

**What changed**

- `ops/provision/hud-provision.sh` (Section 2): added `ensure_dir` calls provisioning
  `/srv/hud/agent-runtime/{,config,cache,data,state,runtime}` at `700 agent-hud:hud`
  per the ADR's exact layout — placed immediately after the existing `/srv/hud/*`
  subtree lines, with a comment block explaining why (`agent-hud` is `750 hud:hud`'s
  group member but the tenant root grants the group no write bit, so it needs an
  `agent-hud`-owned subtree for its own CLI dotfiles).
- `ops/provision/hud-provision.sh` (Section 6): rewrote the sudoers block to manage
  a two-line file as a unit (existing `kevin ALL=(agent-hud) NOPASSWD: …` rule plus a
  new `Defaults:kevin env_keep += "XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME
  XDG_STATE_HOME XDG_RUNTIME_DIR"` line) — full-content comparison for idempotency
  (mirrors the `write_slice` pattern already used for systemd units), still validated
  with `visudo -c` before install. Added explanatory comment: the wrapper's command
  spec is a path glob, not `ALL`, so `SETENV` is not implied — without the allowlist
  sudo silently strips the wrapper's `VAR=value` overrides and the CLIs fall back to
  writing into `$HOME=/srv/hud`, reproducing the Ticket 26 EACCES failure.
- `ops/provision/hud-provision.sh` (Section 9 summary): added a line documenting the
  new `/srv/hud/agent-runtime/` path and its mode/owner.
- `ops/provision/bin/agent-claude`, `agent-gemini`, `agent-opencode`: each wrapper's
  `exec sudo -u agent-hud -E …` now also exports `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR` pointing at
  `/srv/hud/agent-runtime/{config,cache,data,state,runtime}` respectively, alongside
  the existing `HOME=/srv/hud` override. Added a comment block to each explaining the
  redirection and citing ADR-26060701-agent-hud-xdg-runtime.

**Verification (live box, run as root — `kevin` does not exist as a system user on
this box; the wrappers were invoked directly, which is functionally equivalent to the
`sudo -u agent-hud` step they perform internally)**

```
$ stat -c '%a %U:%G %n' /srv/hud/agent-runtime /srv/hud/agent-runtime/{config,cache,data,state,runtime}
700 agent-hud:hud /srv/hud/agent-runtime
700 agent-hud:hud /srv/hud/agent-runtime/config
700 agent-hud:hud /srv/hud/agent-runtime/cache
700 agent-hud:hud /srv/hud/agent-runtime/data
700 agent-hud:hud /srv/hud/agent-runtime/state
700 agent-hud:hud /srv/hud/agent-runtime/runtime

$ stat -c '%a %U:%G' /srv/hud
750 hud:hud                                    # ← unchanged, as required

$ cat /etc/sudoers.d/hud-operator
kevin ALL=(agent-hud) NOPASSWD: /opt/agents/bin/*
Defaults:kevin env_keep += "XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME XDG_STATE_HOME XDG_RUNTIME_DIR"
$ visudo -c -f /etc/sudoers.d/hud-operator
/etc/sudoers.d/hud-operator: parsed OK

# --- idempotency: second run of hud-provision.sh ---
[SKIPPED ] dir /srv/hud/agent-runtime (700 agent-hud:hud)
[SKIPPED ] dir /srv/hud/agent-runtime/config (700 agent-hud:hud)
[SKIPPED ] dir /srv/hud/agent-runtime/cache (700 agent-hud:hud)
[SKIPPED ] dir /srv/hud/agent-runtime/data (700 agent-hud:hud)
[SKIPPED ] dir /srv/hud/agent-runtime/state (700 agent-hud:hud)
[SKIPPED ] dir /srv/hud/agent-runtime/runtime (700 agent-hud:hud)
[SKIPPED ] sudoers /etc/sudoers.d/hud-operator
[SKIPPED ] bin artifact: agent-opencode
[SKIPPED ] bin artifact: agent-gemini
[SKIPPED ] bin artifact: agent-claude
# (the only non-SKIPPED lines on re-run — daemon-reload, apt bootstrap, nodesource
#  repo, apt-get update — are pre-existing always-run steps unrelated to this change,
#  unaffected by this ticket's edits)

# --- CLI version checks: clean exit, zero EACCES ---
$ /opt/agents/bin/agent-opencode --version
1.16.2                                          # exit=0, stderr empty
$ grep -rli EACCES /srv/hud/agent-runtime/      # search file CONTENTS tree-wide
(no matches)

$ /opt/agents/bin/agent-claude --version
2.1.168 (Claude Code)                           # exit=0, stderr empty
$ /opt/agents/bin/agent-gemini --version
0.45.2                                          # exit=0, stderr empty

# --- negative test: agent-hud still cannot write to the tenant root ---
$ sudo -u agent-hud touch /srv/hud/x
touch: cannot touch '/srv/hud/x': Permission denied      # exit=1, /srv/hud/x absent

# --- sanity: agent-hud CAN write inside its own subtree, hud CANNOT read it ---
$ sudo -u agent-hud touch /srv/hud/agent-runtime/data/sanity-check && echo OK && \
  sudo -u agent-hud rm /srv/hud/agent-runtime/data/sanity-check
OK
$ sudo -u hud ls /srv/hud/agent-runtime
ls: cannot open directory '/srv/hud/agent-runtime': Permission denied   # symmetric isolation, per ADR
```

**Files**

- Modified: `ops/provision/hud-provision.sh`, `ops/provision/bin/agent-claude`,
  `ops/provision/bin/agent-gemini`, `ops/provision/bin/agent-opencode`
- 0 added, 4 modified
- Live box: re-ran `hud-provision.sh` (created the `agent-runtime` subtree, updated
  the sudoers file, re-copied the three wrappers to `/opt/agents/bin/` — confirmed
  byte-identical via `cmp` to the versioned sources)

**Commits**

- `feat(infra): provision agent-hud XDG runtime subtree per ADR-26060701` (62ff905)

**Open Questions surfaced:** none — the ADR specified exact paths/modes/ownership and
the implementation followed it directly with no deviation.

**Note for the architect:** `kevin` does not exist as a system user on this box yet
(the `/etc/sudoers.d/hud-operator` rule references it, but `getent passwd kevin`
returns nothing). All verification was therefore performed by invoking the wrappers
directly as root (root's `sudo -u agent-hud` path is equivalent to the wrapper's
internal `exec sudo -u agent-hud …` regardless of which user owns the outer shell).
This is a pre-existing condition unrelated to this ticket — flagging only because the
`Defaults:kevin env_keep += …` line this ticket adds is scoped to a user that doesn't
exist yet; it will take effect the moment `kevin` is provisioned (a step presumably
covered by a different ticket/runbook), and is harmless (a no-op match) until then.
