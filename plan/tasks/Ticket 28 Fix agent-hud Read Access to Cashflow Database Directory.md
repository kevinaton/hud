---
id: Ticket 28
title: Fix agent-hud Read Access to Cashflow Database Directory
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-08
depends-on: ["[[Ticket 27 Provision agent-hud XDG Runtime Subtree and Wire Wrapper Env Vars]]"]
blocks: []
blueprint: null
tags: [task, area/bug]
---

## Goal

The `hud` MCP server starts and stays connected when launched as `agent-hud` — `cashflow.*` tools work end-to-end for Emily, with no `SQLITE_CANTOPEN` crash.

## Context

While verifying [[Ticket 26 Install Claude and OpenCode CLIs Globally Matching Gemini Setup]] end-to-end as `agent-hud` (after Ticket 27 fixed the CLI's own home/XDG permissions and Kevin completed the `agent-hud` Claude login + credential setup), the orchestrator hit a deeper, previously-undiscovered blocker: **the `hud` MCP server crashes immediately on connect when launched as `agent-hud`**, with this error in `/srv/hud/agent-runtime/cache/claude-cli-nodejs/-srv-hud-app-apps-web-agents-emily/mcp-logs-hud/*.jsonl`:

```
SqliteError: unable to open database file
    at new Database (.../better-sqlite3/lib/database.js:69:26)
    at file:///srv/hud/app/packages/mcp-hud/dist/lib/db.js:21:16
code: 'SQLITE_CANTOPEN'
```

**Root cause (confirmed via direct permission probes as `agent-hud`):**

```
/srv/hud/data            700 hud:hud   ← agent-hud CANNOT traverse (no group bits at all)
/srv/hud/data/hud.db     644 hud:hud   ← file itself is group/world-readable, but unreachable
```

`agent-hud` (uid 2011) is a member of group `hud` (gid 2001), but `/srv/hud/data` is mode `700` — owner-only, zero group permissions. Even though `hud.db` itself is `644` and would be readable by group members, `agent-hud` cannot get past the locked parent directory to open it. `sudo -u agent-hud test -x /srv/hud/data` and `test -r /srv/hud/data/hud.db` both fail.

**Why this slipped through every prior verification:** [[Ticket 25 Fix OpenCode MCP Config Schema Mismatch for Emily]] verified the `hud` server connects and reports `toolCount=8` — but explicitly **as `root`**, which bypasses all filesystem permission checks (the engineer's notes flagged this as a known follow-up gap: *"root is not the intended runtime user"*). [[Ticket 26 Install Claude and OpenCode CLIs Globally Matching Gemini Setup]] and [[Ticket 27 Provision agent-hud XDG Runtime Subtree and Wire Wrapper Env Vars]] both fixed real problems (CLI binary location, `agent-hud`'s own home/XDG write access) — but neither touched `/srv/hud/data`, because neither surfaced this specific gap. This is the first time the full chain has been exercised end-to-end as the actual runtime identity (`agent-hud`, logged in, MCP server launching for real), and it's the thing that's been silently blocking Emily's cashflow tools from ever working — independent of CLI install, login, or MCP-trust-approval state, all of which are now resolved.

This is the same *category* of fix as Ticket 27 (a narrow, principled permissions correction to let `agent-hud` reach what it legitimately needs without widening anything it shouldn't touch) — **route it through the architect for a recommendation before implementing**, the same way Ticket 27's `/srv/hud` home-directory fix was. Likely candidates to evaluate:

- `chmod 750 /srv/hud/data` (group-traverse + group-read on the directory; the `hud.db` file is already `644` so this alone may be sufficient) — narrowest possible change, mirrors the `750` pattern already used at the tenant root
- Confirm whether `agent-hud` also needs **write** access to `hud.db` (it does — `cashflow.add`/`edit`/`delete`/`createCategory` are state-changing MCP tools that write to this database) and whether SQLite's WAL/journal files (`hud.db-wal`, `hud.db-shm`) need the same directory-level group-write as the main file
- Whether this should also cover `/srv/hud/vault` or other `hud`-owned subtrees `agent-hud` legitimately needs at runtime (audit per `26060503`'s write-allowlist intent — "agent-hud may write under /srv/hud/{vault,data}/...")

## Acceptance Criteria

- [ ] Architect has reviewed the permission gap and recommended a specific fix (mode/ownership change, with rationale — same rigor as `ADR-26060701-agent-hud-xdg-runtime`); recorded as an ADR or amendment if the architect judges it warranted
- [ ] `/srv/hud/data` and `hud.db` (plus any SQLite sidecar files: `-wal`, `-shm`, `-journal`) are readable AND writable by `agent-hud` per the architect's recommendation
- [ ] `/srv/hud/data` does not become writable by `agent-hud` beyond what's needed for the DB file(s) — directory-level write should be scoped as narrowly as the architect advises (avoid handing `agent-hud` the ability to create/delete arbitrary files in `hud`'s data directory if a narrower option exists)
- [ ] Launching `claude --mcp-config .mcp.json --strict-mcp-config -p "..."` as `agent-hud` from `apps/web/agents/emily/` shows the `hud` server connected with all 8 tools (`ping` + 7 `cashflow.*`) — verified via the actual `mcp-logs-hud/*.jsonl` log (no `SQLITE_CANTOPEN`, no `Connection closed`)
- [ ] A live end-to-end smoke test succeeds as `agent-hud`: at minimum `cashflow.summary` or `cashflow.list` returns real data (proves read works), and ideally a round-trip add+delete of a test transaction (proves write + the `audit_log` row gets created — per `.claude/skills/hud-audit/SKILL.md` if referenced)
- [ ] Changes land in versioned provisioning sources (`ops/provision/hud-provision.sh` or wherever `/srv/hud/data`'s mode is currently set/documented) — not hand-patched live-only
- [ ] Re-running the provisioning script is idempotent

## Sub-tasks

- [ ] Delegate the permission-gap analysis to the architect (mirror the Ticket 27 flow: present the SQLITE_CANTOPEN evidence, the `700 hud:hud` finding, and the candidate fixes above; ask for a specific recommendation)
- [ ] If the architect recommends an ADR, have them draft it and link it from `26060503`
- [ ] Engineer implements the architect's recommended fix in versioned provisioning sources
- [ ] Engineer verifies via the exact AC commands (MCP log inspection + live tool call as `agent-hud`)
- [ ] Engineer commits and re-provisions the live box

## Open Questions

- Does `agent-hud` need write access to `/srv/hud/data` at the directory level (for SQLite to create `-wal`/`-shm` sidecar files on first write), or can this be scoped to file-level ACLs / a narrower mechanism? Architect to advise.

## Notes

### 2026-06-08 — orchestrator: superseded by agent-hud retirement

Kevin retired the `agent-hud` Linux user entirely on 2026-06-08 — single-operator
consolidation onto `hud`/`root` (full report in
[[Ticket 32 Commit and Reconcile Provisioning Sources After Retiring agent-hud]]).

This ticket's premise — `agent-hud` (uid 2011) cannot traverse `/srv/hud/data`
(`700 hud:hud`) to open `hud.db` — no longer applies: `agent-hud` doesn't exist,
and Emily now runs as `hud`, which **owns** `/srv/hud/data` outright (full rwx as
the directory owner — no group-traverse workaround needed). There is no
permission gap left to fix; the architect-recommended-fix sub-task and all AC as
written are moot.

**Resolution — closed as `done`, superseded (per Kevin, 2026-06-08):** no fix was
implemented because none was needed. The architecture changed underneath the
problem: `agent-hud` (the user this ticket was about) no longer exists, and
Emily's runtime identity is now `hud`, which already owns `/srv/hud/data` —
`SQLITE_CANTOPEN` cannot occur for the actual runtime user. The AC as written
describe a permission fix for a user that has been retired; closing rather than
implementing them is the correct outcome of the consolidation decision recorded
in [[Ticket 32 Commit and Reconcile Provisioning Sources After Retiring agent-hud]].

### 2026-06-07 — discovered during Ticket 26 end-to-end verification

Found by the orchestrator while verifying Ticket 26 as `agent-hud` post-login (Kevin had just completed the one-time `agent-hud` Claude login and credential setup, and approved running `claude --mcp-config .mcp.json --strict-mcp-config` to bypass a stuck project-trust-approval UI flow — that part now works cleanly). The `hud` server attempted to start, crashed with `SQLITE_CANTOPEN` within ~700ms every time, confirmed reproducible via direct `sudo -u agent-hud test -r/-x` probes against `/srv/hud/data` and `/srv/hud/data/hud.db`. This is now the single remaining blocker to Emily's cashflow tools working as designed — everything else in the chain (binary install, `agent-hud` home/XDG permissions, login, MCP config schema, MCP trust approval) is confirmed working.

**Per Kevin's explicit instruction: do not delegate yet — ticket created and parked in Todo to avoid spending further effort/tokens until he's ready to proceed.**
