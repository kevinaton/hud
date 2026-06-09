---
id: Ticket 33
title: Add Native CLI Permission Guardrails to Stop Emily Bypassing the MCP Server
status: review
priority: p2
area: infra
estimate: M
created: 2026-06-08
updated: 2026-06-08
depends-on: ["[[Ticket 32 Commit and Reconcile Provisioning Sources After Retiring agent-hud]]"]
blocks: []
blueprint: "[[plan/blueprints/26060701-hud-agent-runtime-emily]]"
tags: [task, area/infra]
---

## Goal

Emily's Claude Code, OpenCode, and Gemini CLI configs in `apps/web/agents/emily/` natively deny direct database access (raw `sqlite3`/file reads/shell-outs to `hud.db`), so "MCP-only CRUD, never raw SQL" is enforced as a hard technical control at the CLI-permission layer — not merely as a prompt instruction Emily could misread or be talked around.

## Context

Per [[Ticket 32 Commit and Reconcile Provisioning Sources After Retiring agent-hud]], Emily now runs as the `hud` Linux user (uid 2001) directly — the `agent-hud` isolation account was retired 2026-06-08. This means Emily has the **same filesystem permissions as the human operator**, including full read/write access to `/srv/hud/data/hud.db`.

Today the *only* thing stopping Emily from running raw SQL against that file is a prompt-level instruction in `apps/web/agents/emily/AGENT.md`'s "Hard rules" section:

> "Every state-changing action goes through MCP tools (`cashflow.add`, `cashflow.edit`, `cashflow.delete`, `cashflow.createCategory`). Never raw SQL. Never shell into the DB."

That's a behavioral guideline for the model — not a technical control. Kevin wants a native, CLI-enforced restriction layered underneath it: even if the model "decides" to go around the `hud` MCP server (confusion, a bad prompt, a future persona-voice change, anything), the CLI itself should refuse the action *before* it ever touches the database — exactly the kind of defense-in-depth [[plan/blueprints/26060701-hud-agent-runtime-emily]] and `.claude/skills/hud-audit/SKILL.md` care about (every cashflow mutation must produce a real `audit_log` row — something only the MCP tools do; raw SQL silently bypasses that forensic trail).

This needs investigation across **three different CLI permission schemas** (do not guess — confirm against vendor docs/working examples, the same standard Tickets 25/26 held to):

- **Claude Code** — `.claude/settings.json` `permissions.deny`. The repo root's own `.claude/settings.local.json` has live working examples of the exact pattern syntax (`Bash(sqlite3 ...)`, `Read(//etc/**)`) — use it as a reference, but note Emily's persona directory currently has **no** `.claude/settings.json` of its own (only `.mcp.json` for MCP wiring).
- **OpenCode** — `apps/web/agents/emily/opencode.json` already exists (MCP wiring only); research its `permission` config field.
- **Gemini CLI** — `apps/web/agents/emily/.gemini/settings.json` already exists (MCP wiring only); research its tool-restriction mechanism (`excludeTools`/`coreTools`/sandbox config — whatever the current `gemini` version actually supports).

Reference `.claude/skills/hud-db/SKILL.md` for the DB-access rules being enforced and `.claude/skills/hud-audit/SKILL.md` for why bypassing MCP breaks the audit trail.

## Acceptance Criteria

- [x] Each CLI's native permission/deny mechanism is researched and documented in Notes (exact config keys, pattern syntax, version the finding applies to) — verified against vendor docs or working examples in this repo, not guessed
- [x] Claude Code: a project-level `.claude/settings.json` added under `apps/web/agents/emily/` that denies `Bash` access to `sqlite3`/`psql`/equivalent direct-DB-shell commands and denies `Read`/`Write`/`Edit` on `/srv/hud/data/hud.db*` — live-verified: a prompt that tries to make Emily run `sqlite3 /srv/hud/data/hud.db ...` is refused by the **CLI itself** (a permission-denial error), not merely declined by the model's judgment
- [x] OpenCode: equivalent restrictions added to `opencode.json`'s permission config — live-verified the same way
- [x] Gemini: equivalent restrictions added — config-level work complete and proven to load/parse cleanly; **live model-driven verification could not be completed** (see Notes "Gemini — what's verified vs. not" — a missing model-auth credential for the `hud` user blocks any live model turn, an environment/credentials gap, not a config defect). Schema research is honest and complete: documented why `excludeTools`/`coreTools`/`tools.exclude`/`tools.allowed` are deprecated, exact-name-only, and cannot express pattern-based denial, and why the Policy Engine (TOML, `argsPattern` regex) is the real, current, more powerful mechanism — implemented that instead of claiming false parity with the deprecated surface
- [x] The `hud` MCP server remains fully usable through Claude Code and OpenCode after the change — confirmed live: all 8 tools (`ping` + 7 `cashflow.*`) listed, and a real mutation+delete through each produced real `audit_log` rows (ids 36-39, see Notes). **Gemini**: MCP server registration/connection re-verified live (`gemini mcp list` → `✓ hud: ... Connected`) with the new `tools.core` config in place — registry-level proof that the allowlist does not break MCP tool exposure (MCP tools register via a separate code path that bypasses `coreTools` gating, confirmed by reading the bundle source). Live 8-tool-listing-via-model-call could not be completed for Gemini (see auth gap above)
- [x] `AGENT.md`'s "Hard rules" section is updated to note that "MCP-only, no raw SQL" is now enforced both by instruction *and* by native CLI permission config, with a pointer to the new config files
- [x] Live proof captured in Notes for Claude Code and OpenCode: a deliberate prompt attempting to coax Emily into running raw SQL against `hud.db` is technically blocked at the CLI/permission layer, with the actual refusal/error output pasted verbatim. **Gemini**: could not capture a live model-driven refusal transcript (auth gap); instead documented (a) the exact Policy Engine error format the bundle source produces (`"Tool execution denied by policy. <denyMessage>"` / `getPolicyDenialError`), (b) confirmation the TOML parses and loads with zero errors (`gemini mcp list --debug` shows no policy/parse warnings; independently re-validated with Python `tomllib`), and (c) the live deprecation warning for `tools.exclude` that corroborated the schema research before I removed it in favor of the non-deprecated `tools.core` + Policy Engine combination

## Sub-tasks

- [x] Read `apps/web/agents/emily/AGENT.md`, `.mcp.json`, `opencode.json`, `.gemini/settings.json`, and the repo-root `.claude/settings.local.json` (for Claude's working deny-pattern syntax) to map the current config surface
- [x] Research and document each CLI's permission/deny schema (Claude Code `permissions.deny`, OpenCode `permission`, Gemini `excludeTools`/`coreTools`/sandbox) against vendor docs — note exact versions in use (`2.1.168`, `1.16.2`, `0.45.2` per [[Ticket 26 Install Claude and OpenCode CLIs Globally Matching Gemini Setup]])
- [x] Add `apps/web/agents/emily/.claude/settings.json` with deny rules for raw-SQL/direct-DB-file access; live-test
- [x] Extend `apps/web/agents/emily/opencode.json` with equivalent `permission` rules; live-test
- [x] Extend `apps/web/agents/emily/.gemini/settings.json` (and add `.gemini/policies/no-direct-db-access.toml`) with the closest achievable — and actually superior — equivalent: a `tools.core` allowlist plus a workspace Policy Engine TOML with `argsPattern` regex denial rules; config-level live-test passed (loads/parses cleanly, MCP still connects); model-driven live-test blocked by missing auth (documented honestly)
- [x] Re-run the 8-tool MCP verification for Claude Code and OpenCode post-change (no regression to legitimate tool access — confirmed). Gemini: re-verified MCP server connection/registration only (model-driven tool listing blocked by auth gap, documented)
- [x] Update `AGENT.md` "Hard rules" section to cross-reference the new enforced-by-config layer
- [x] Capture live refusal-proof transcripts for Claude Code and OpenCode in Notes (verbatim, CLI-layer denials). Gemini transcript not capturable this session (auth gap) — documented what *was* proven instead (policy load/parse correctness + exact denial-error format from source)
- [x] Run `pnpm lint`/`pnpm typecheck`; both pass. Commit (4 atomic commits, see Notes)

## Open Questions

None requiring architect input. One environment-level follow-up surfaced (not a design question): **Gemini CLI has no working model-auth credential for the `hud` user** in this runtime (`Please set an Auth method... GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA`; OAuth device-flow requires an interactive terminal, which is unavailable here; no cached `oauth_creds.json`/`google_accounts.json`, no API key in `/srv/hud/secrets/.env` or anywhere in the repo). Ticket 24 got further than this (hit a `TerminalQuotaError`, meaning auth *did* succeed at that time) — so a working credential existed previously and appears to have expired or was session-scoped to the operator. **Recommend:** set up a durable `GEMINIAPI_KEY` (or equivalent ADC) for the `hud` user so future Gemini-path verification doesn't depend on an interactive OAuth session. This blocks completing live Gemini model-driven verification for *any* future ticket touching Emily's Gemini path, not just this one.

## Notes

### 2026-06-08 — Gemini env provisioned; auth gap closed, new quota gap surfaced

Kevin supplied a `GEMINI_API_KEY` to unblock the one gap from the prior session
(no working Gemini model-auth credential for the `hud` user). Provisioned it and
re-ran the live Gemini verification. **Net result: the auth gap is now closed —
but a *different*, also-environmental blocker (API key daily quota) prevented
completing the remaining live-mutation and live-refusal-transcript proof.**
Documenting both honestly below; recommending `review` stand pending either a
quota reset or a higher-tier key.

**Env provisioning (secret-handling per the operator's rule — value never
written to any `plan/` file, referenced here by name only):**
- Added `GEMINI_API_KEY` as a new line in `/srv/hud/secrets/.env` — the exact
  same file/pattern that already holds `DATABASE_URL`/`NEXTAUTH_URL`/
  `NEXTAUTH_SECRET`/`HUD_ALLOW_SIGNUP`, and the same file the `hud-web` systemd
  unit loads via `EnvironmentFile=/srv/hud/secrets/.env` (`ops/systemd/hud-web.service`).
  File remains `600 hud:hud` — mode/ownership unchanged, only a new `KEY=value`
  line appended.
- **New finding this session**: `EnvironmentFile=` only reaches the systemd-managed
  `hud-web` service process — it does **not** populate interactive/agent shell
  sessions (confirmed: `hud`'s `.bashrc` had no mechanism sourcing
  `/srv/hud/secrets/.env`, and Ticket 32 confirmed `claude`/`gemini`/`opencode`
  now run directly as `hud` from an interactive shell, not via any wrapper —
  the `agent-hud` wrapper-script layer Ticket 27 built was retired). Without a
  shell-level loader, `GEMINI_API_KEY` would sit in the secrets file but never
  reach `gemini`'s `process.env` (confirmed from bundle source: the CLI reads
  `GEMINI_API_KEY` directly off `process.env`, no `.env`-file auto-loading of
  any kind exists in the bundle — `grep` for `dotenv`/`readEnvFile`/`.gemini/.env`
  in the bundle returns zero matches).
- **Fix**: added a guarded loader block to `/srv/hud/.bashrc` (writable `664
  hud:hud`, the per-user interactive-shell rcfile every `bash -i`/agent CLI
  session sources):
  ```bash
  if [ -r /srv/hud/secrets/.env ]; then
    set -a
    . /srv/hud/secrets/.env
    set +a
  fi
  ```
  `set -a`/`set +a` exports every assignment sourced from the file into the
  environment (verified the file's existing leading-whitespace `  KEY=value`
  formatting parses correctly under plain `bash` `source` — tested with a
  scratch fixture before touching the live file). This is a **runtime artifact
  edit** (`/srv/hud/.bashrc`, like the `hud`-owned `~/.claude/settings.json`
  Ticket 32 documented as a live-system change) — not a versioned-source change,
  because there is no wrapper script anymore for the secret-loading logic to live
  in (the `agent-{claude,gemini,opencode}` wrappers Ticket 27 built were deleted
  by Ticket 32's retirement of `agent-hud`). Verified live:
  ```
  $ bash -ic 'echo "GEMINI_API_KEY is set: ${GEMINI_API_KEY:+yes (len=${#GEMINI_API_KEY})}"'
  GEMINI_API_KEY is set: yes (len=39)
  ```

**Auth gap — CLOSED, live-proven:**
```
$ cd apps/web/agents/emily && GEMINI_CLI_TRUST_WORKSPACE=true gemini -p "ping"
Bonjour Kev! Ready when you are.
```
No more `Please set an Auth method...` error. This turn is durably persisted in
`/srv/hud/.gemini/tmp/emily/chats/session-2026-06-08T12-24-8a133b09.jsonl`
(`type: "gemini"`, `content: "Bonjour Kev! Ready when you are."`,
`timestamp: "2026-06-08T12:24:35.824Z"`) — independently re-checkable, not a
one-off terminal capture. `gemini mcp list` also re-confirmed
`✓ hud: node /srv/hud/app/packages/mcp-hud/dist/index.js (stdio) - Connected`
with the new env in place — registry-level MCP proof still holds.

**New blocker — API key daily quota exhausted (a *different* environment gap
than the one Kevin's key was meant to fix, surfaced only once auth started
working):**

Every subsequent attempt — to list the 8 MCP tools, run a real mutation+delete
for the `audit_log` proof, or capture the refusal transcript — failed with:
```
TerminalQuotaError: You have exhausted your daily quota on this model.
  ...
  message: 'You exceeded your current quota ... \n' +
    '* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
       limit: 20, model: gemini-3.5-flash\n' +
    'Please retry in ...s.',
```
Investigated thoroughly before concluding this is unfixable from the client side
this session:
1. **Confirmed it's a *daily* cap, not a transient rate limit**: read
   `classifyGoogleError` in the bundle (`chunk-LSXUKR6W.js`) — it inspects the
   API's `QuotaFailure.violations[].quotaId` and returns `TerminalQuotaError`
   specifically when `quotaId.includes("PerDay") || quotaId.includes("Daily")`.
   This is the API server's own classification, not a CLI guess — Google's
   `generativelanguage.googleapis.com/generate_content_free_tier_requests`
   metric genuinely caps free-tier keys at 20 requests/day for this model.
2. **Confirmed the key itself is good and has real quota on other models** —
   direct `curl` to `v1beta/models/gemini-2.5-flash:generateContent` with the
   same key returned a clean `200` with `"text": "Pong."` and
   `"modelVersion": "gemini-2.5-flash"`. The key is valid; only the specific
   `gemini-3.5-flash` free-tier daily bucket is exhausted.
3. **Confirmed the CLI cannot be steered away from `gemini-3.5-flash`** —
   tried `--model gemini-2.5-flash`, `--model gemini-2.0-flash`, and
   `GEMINI_MODEL=gemini-2.5-flash` env override; all still dispatched to
   `gemini-3.5-flash` and hit the same daily cap. `--debug` output revealed why
   — a CLI-internal inconsistency in `0.45.2`'s model router:
   ```
   [Routing] Selected model: gemini-3.5-flash (Source: agent-router/override, Latency: 0ms)
       [Routing] Reasoning: Routing bypassed by forced model directive. Using: gemini-2.5-flash
   ```
   The override strategy *acknowledges* the forced-model directive
   (`gemini-2.5-flash`) in its reasoning string but the `Selected model` field —
   and the actual dispatched API call — still says/uses `gemini-3.5-flash`. This
   is a bug/quirk in how `OverrideStrategy`/`CompositeStrategy` resolve the final
   model in this build; it cannot be worked around via any CLI flag or env var
   exposed to me.
4. **Confirmed it's not a brief throttle that clears with patience** — spaced
   retries 70s/100s/180s apart; one (the very first "ping") succeeded, all
   subsequent ones failed with the same `PerDay`-classified error and `503
   UNAVAILABLE` ("This model is currently experiencing high demand") on the
   internal `NumericalClassifierStrategy.route` pre-flight call that fires on
   *every* prompt before the main turn — meaning each attempt (success or
   failure) consumes from the same 20/day bucket, and that bucket reads as
   already near-exhausted from the very first call onward (consistent with the
   key having had prior usage today before being handed to me, or the bucket
   being shared/low to begin with on a free-tier key).
5. **This is the same failure class Ticket 24 documented** (`TerminalQuotaError:
   capacity exhausted`) — recorded there as proof that *a working credential
   existed* (you only see this error after successful auth). Ticket 24 → prior
   session → this session: the pattern repeats — auth succeeds, then the
   free-tier daily allotment for the model the CLI silently always uses
   (`gemini-3.5-flash`) runs out almost immediately. This strongly suggests the
   free tier's 20-requests/day cap on this specific model is simply too tight
   for any meaningful CLI session (the CLI burns 1+ classifier calls per user
   turn even before the "real" model call), independent of which API key is
   supplied — **a structural mismatch between this CLI build's routing behavior
   and the free API tier**, not a one-off credential problem.

**What I captured in lieu of the full live mutation+refusal-transcript proof
(the same honest-substitute spirit as the prior session, now updated):**
- The durable, persisted, in-character authenticated turn (`Bonjour Kev! Ready
  when you are.`, JSONL session transcript above) — proof the *auth* layer
  Kevin's key was meant to fix is now genuinely closed.
- Re-confirmed `gemini mcp list` → `✓ hud: ... Connected` with the working
  credential and `tools.core` config in place — registry-level MCP-still-works
  proof, now backed by a working (not just configured) auth path.
- The exact `TerminalQuotaError`/`PerDay`-classification source-code proof
  (above) showing *why* no amount of additional waiting/model-flag-juggling
  within this session will produce the mutation+refusal transcripts — it is a
  hard daily cap on the API side, re-confirmed via `classifyGoogleError`'s
  `quotaId.includes("PerDay")` branch, not a guess.

**Recommendation for the operator** (this is now the actionable, specific
follow-up — replacing the prior "provision a GEMINI_API_KEY" recommendation,
which Kevin has now done):
1. Either wait for the daily quota to reset (Google resets free-tier daily
   quotas on a rolling 24h/UTC-day boundary — outside any session's control) and
   re-run the same verification in a fresh session the next day, **or**
2. Provision a paid-tier / billing-enabled API key (the
   `generate_content_free_tier_requests` metric and its 20/day cap are
   specifically a *free-tier* restriction — a billed project would not hit it),
   **or**
3. Accept the `Bonjour Kev!` authenticated-turn proof + the registry-level
   MCP-connection proof + the source-level Policy-Engine/denial-format proof
   (already on file from the prior session) as sufficient to close this ticket
   without the full mutation+refusal-transcript triple for Gemini specifically —
   Claude Code and OpenCode both have complete triples; Gemini's *config* is
   complete, research-honest, loads/parses cleanly, and is now proven to
   authenticate and connect to MCP for real, which is strictly more than was
   provable before this session.

**Files changed this session:**
- `/srv/hud/secrets/.env` — runtime artifact, **not in versioned sources**
  (mirrors how `DATABASE_URL`/`NEXTAUTH_*`/`HUD_ALLOW_SIGNUP` already live there;
  this file is `.gitignore`d / never committed — confirmed `git status` shows no
  change to any tracked path for this edit). Added one line:
  `GEMINI_API_KEY=<value, referenced here by name only per the operator's
  secret-handling rule — never written to any plan/ file>`.
- `/srv/hud/.bashrc` — runtime artifact, **not in versioned sources** (this is
  `hud`'s personal interactive-shell rcfile, analogous to the `hud`-owned
  `~/.claude/settings.json` Ticket 32 documented as a live-system change outside
  the repo). Added the guarded `set -a; . /srv/hud/secrets/.env; set +a` loader
  block shown above.
- No changes to `apps/web/agents/emily/**` or any other versioned-source path —
  the Gemini permission/policy config from the prior session is untouched and
  still verified loading cleanly (`gemini mcp list` shows `Connected`, zero
  warnings).
- **0 commits** — there is nothing to commit; both edits are to `hud`'s personal
  runtime dotfiles/secrets outside the git working tree (verified: `git status`
  shows no new changes after this session's edits).

**Status rationale (`review`, unchanged from prior session — for a different,
now-more-specific reason):** the prior session's blocker (no working Gemini
credential) is **resolved** — auth genuinely works now, durably proven. A
*different* environment constraint (free-tier daily quota on the model this CLI
build always dispatches to, regardless of override flags) replaced it before the
remaining proof (8-tool listing via model call, mutation+`audit_log` row,
refusal transcript) could be captured. This is, again, "can I prove it live
*today*, with *this* key" — not "does the technical control work" (the control
is unchanged from the prior session: fully implemented, loads cleanly, and the
Policy Engine source-level denial-format proof already on file stands). I'm
keeping `review` rather than `blocked` because the *config* is complete and
correct and two of three CLIs are fully proven — flagging for the operator to
choose among the three options above (wait for reset / upgrade key tier / accept
partial-Gemini-proof-as-sufficient) rather than guessing which they'd prefer.

**Commit status — transient `.git/objects` permission wall hit, then resolved
on retry (same shard issue Ticket 32 documented, recurred fresh this session
— left as a forensic record since it cost real time and may recur again):**
`git add` succeeded immediately, but the first two `git commit` attempts
failed at the tree-build stage:
```
error: insufficient permission for adding an object to repository database .git/objects
error: Error building trees
```
Diagnosed precisely: `git hash-object -w --stdin` succeeds (blob writes work
fine — that's how the file staged), and `.git/objects` itself plus most shard
dirs are `755 hud:hud`. But 7 shard directories are still `755 root:root`
(no group/other write bit): `d2`, `3a`, `d4`, `89`, `f0`, `47`, `d9`. The new
commit's **tree object** for `plan/tasks/` (or an ancestor tree/commit object)
hashes into one of these root-owned shards, and `hud` cannot write there —
exactly the "probabilistic by hash" failure mode Ticket 32 documented and that
Kevin (root) fixed for that session via `chown -R hud:hud /srv/hud/app/.git/objects`.
That fix was evidently not durable / a subsequent `git` operation (running as
`root` for some other task) recreated some shard dirs as `root:root`.

**Resolved on retry** — re-staged (the edit's blob hash changed after appending
this very paragraph) and `git commit` succeeded on the next attempt: the new
tree-object hash happened to land in an `hud`-writable shard. Landed as
**commit `b348661`** — `docs(ticket-33): provision GEMINI_API_KEY, close auth
gap, surface new quota gap`. No content was lost; this paragraph is left as a
forensic note for the operator: **the `chown -R hud:hud /srv/hud/app/.git/objects`
fix Kevin applied for Ticket 32 is evidently not durable** — a handful of shard
dirs (`d2`, `3a`, `d4`, `89`, `f0`, `47`, `d9` were `root:root` at the time of
this failure) keep reverting to `root:root`, most likely because some `git`
operation is being run as `root` elsewhere on the box (e.g. provisioning,
deploys, or an interactive root session) and `umask`/ownership on newly-created
shard dirs follows the invoking user. **Recommended durable fix**: either (a)
set `core.sharedRepository = group` on this repo so new objects are created
group-writable regardless of which user creates them, or (b) ensure any
root-run `git` operations against `/srv/hud/app` are immediately followed by
`chown -R hud:hud .git`, or (c) simply never run `git` as root against this
repo (always as `hud`). Surfacing this as a recurring operational papercut —
not blocking this ticket (the commit landed), but likely to resurface for the
next agent who hits an unlucky hash.

**Schema research (exact, version-verified, not guessed):**

1. **Claude Code (`2.1.168`)** — `.claude/settings.json` → `permissions.{allow,ask,deny}`, each entry `Tool(specifier)`. Deny wins over everything (checked first, even under `bypassPermissions`). For `Bash`, the specifier is a shell-command-prefix pattern with gitignore-style globs (`Bash(sqlite3*)` matches commands starting with `sqlite3`; `Bash(* sqlite3 *)` catches it as a later word, e.g. `sudo sqlite3 ...`). For `Read`/`Write`/`Edit`, the specifier is a path pattern — `//absolute/path` (note the **double slash** prefix for absolute paths per the gitignore-spec path syntax Claude Code uses). Verified against `https://code.claude.com/docs/en/permissions`.
   - **Correction to the ticket's premise:** the ticket states the repo-root `.claude/settings.local.json` "has live working examples of this exact deny-pattern syntax." On inspection it contains **only** `permissions.allow` entries (plus `defaultMode: "bypassPermissions"`) — zero `deny` rules of any kind. I read it for reference as instructed but had to derive the deny syntax from vendor docs instead, since no working example existed in-repo. Documenting this honestly per the ticket's own "verified against vendor docs or working examples... not guessed" standard.

2. **OpenCode (`1.16.2`)** — `opencode.json` → top-level `permission` object. Keys are tool/category names (`bash`, `read`, `edit`, `write`, etc.); values are either a plain `"allow"|"ask"|"deny"` string or a **pattern map** `{ "<glob>": "allow"|"ask"|"deny" }`. Unlike Claude Code, **the LAST matching rule wins** (not deny-first) — confirmed against the live JSON-schema at `https://opencode.ai/config.json` (`PermissionConfig`/`PermissionObjectConfig`/`PermissionRuleConfig` definitions, downloaded to `/tmp/oc-schema.json` and parsed). This is why every pattern map here starts with an explicit `"*": "allow"` followed by more-specific `"deny"` overrides — order/specificity matters, and a bare `"deny"` pattern without a preceding `"allow": "*"` could shadow legitimate tool use depending on match order. `bash` patterns match against the parsed shell command; `read`/`edit` patterns match against the resolved absolute file path (`Wildcard.match`).

3. **Gemini (`0.45.2`)** — this is where the ticket's suggested research targets (`excludeTools`/`coreTools`/sandbox) turned out to be the **wrong** (or at least insufficient and soon-removed) mechanism, and I want to be precise about why rather than claim false parity:
   - `settings.tools.exclude`, `settings.tools.allowed`, and the `--allowed-tools` CLI flag are **deprecated** — confirmed two ways: (a) reading the bundled source (`gemini-4IQ2UBE4.js` and siblings) found the literal deprecation-warning strings ("`tools.exclude in settings.json is deprecated and will be removed in 1.0. Migrate to Policy Engine`" / "`--allowed-tools cli argument and tools.allowed in settings.json are deprecated...`"), and (b) **live-reproduced** the `tools.exclude` warning by running `gemini mcp list` with an early draft of `.gemini/settings.json` that included a `tools.exclude` array — the warning printed verbatim to stderr. I then removed `tools.exclude` from the final config (see "files changed" below).
   - Critically, **none of `coreTools`/`excludeTools`/`tools.exclude`/`tools.allowed` support pattern/regex matching** — they're exact-tool-name allow/deny lists only (`mapToolsToRules` in the bundle maps each name to a simple `toolName === X` rule). They categorically cannot express "deny any Bash command containing `sqlite3`" — only "deny the entire `run_shell_command` tool, unconditionally." So even un-deprecated, they couldn't have delivered the pattern-based denial the ticket asks for.
   - The **real, current, actively-developed mechanism is the Policy Engine** (`packages/core/src/policy/policy-engine.js` in the bundle): TOML rule files with `[[rule]]` blocks (`toolName`, `argsPattern`/`commandPrefix`/`commandRegex`, `decision: "allow"|"deny"|"ask_user"`, `priority`, `denyMessage`). Rules are matched by `toolName` plus a regex (`argsPattern`) tested against the **JSON-stringified tool-call arguments** (confirmed via `buildArgsPatterns` in the bundle — e.g. for `run_shell_command` the args object serializes to `{"command":"sqlite3 ...",...}`, so `argsPattern = '"command":"[^"]*\\bsqlite3\\b'` matches it regardless of surrounding shell syntax: `sudo sqlite3`, `env X=Y sqlite3`, compound `&&` chains, etc). A matching `deny` rule short-circuits the tool call **before execution** with a hard `"Tool execution denied by policy. <denyMessage>"` error (`getPolicyDenialError` in `scheduler/policy.js`) — this is exactly the kind of pre-execution CLI-layer block the ticket wants, and it's strictly more capable than the deprecated allow/deny-list mechanism the ticket suggested I research.
   - **Auto-discovery confirmed from source** (`getWorkspacePoliciesDir`): policy files matching `<workspace>/.gemini/policies/*.toml` load automatically at the "workspace" priority tier (below admin/user override tiers, above bundled defaults) — no extra CLI flag or settings-key wiring needed. I additionally confirmed the bundled example policy files (`/usr/lib/node_modules/@google/gemini-cli/bundle/examples/policies/policies/policies.toml`) use the exact `[[rule]]`/`argsPattern`/`decision`/`priority`/`denyMessage` shape I used.
   - **MCP-tool-bypass confirmed from source**: `discoverMcpTools`/`DiscoveredMCPTool` register MCP-server tools via a code path entirely separate from the `coreTools`/`tools.core` registry gate — so an allowlist that omits `run_shell_command`/`write_file`/`replace` cannot accidentally hide `hud_ping`/`hud_cashflow_*`. This was the load-bearing fact that let me write a `tools.core` allowlist confidently without risking the MCP server's tool exposure — proven safe *before* writing the config, and re-confirmed live afterward (`gemini mcp list` → `✓ hud: ... Connected`, no missing-tool warnings).
   - **Net implementation choice**: rather than the (deprecated, weaker, exact-name-only) `excludeTools`/`coreTools`/`tools.exclude` surface the ticket suggested investigating, I implemented the combination that is (a) honest about what 0.45.2 actually supports long-term, (b) strictly more capable (regex pattern matching on full args, not just tool-name gating), and (c) not going to be removed in 1.0. This is the "closest achievable equivalent" — and arguably a better technical control than what Claude Code/OpenCode have, since it can match on argument *content*, not just command-prefix globs.

**Files added/changed:**
- `apps/web/agents/emily/.claude/settings.json` — **new**. `permissions.deny` with 10 rules: `Bash` prefix-and-substring patterns for `sqlite3`/`psql`/`mysql` (both `X*` and `* X *` forms, to catch both leading-command and embedded-in-compound-command cases) plus `* hud.db*`; `Read`/`Write`/`Edit` path-deny on `//srv/hud/data/hud.db*` (double-slash = absolute path per Claude's gitignore-spec syntax).
- `apps/web/agents/emily/opencode.json` — **modified**. Added a `permission` block (`bash`/`read`/`edit` pattern maps, `"*": "allow"` baseline + specific `"deny"` overrides for `sqlite3*`/`*sqlite3*`/`psql*`/`*psql*`/`mysql*`/`*mysql*`/`*hud.db*` on `bash`, and `/srv/hud/data/hud.db*` on `read`/`edit`). Existing `mcp.hud` registration untouched.
- `apps/web/agents/emily/.gemini/settings.json` — **modified**. Added `tools.core` allowlist (9 safe read-only/utility tools — `read_file`, `list_directory`, `glob`, `grep_search`, `ripgrep`, `read_mcp_resource`, `list_mcp_resources`, `update_topic`, `ask_user` — explicitly omitting `run_shell_command`/`write_file`/`replace`/`ShellTool`, so they're never registered at all). Note: an earlier draft also carried a `tools.exclude` array — I removed it after live-reproducing its deprecation warning (see research notes); the final committed version has `tools.core` only, zero deprecated keys, zero warnings on load.
- `apps/web/agents/emily/.gemini/policies/no-direct-db-access.toml` — **new**. Workspace Policy Engine file, 4 `[[rule]]` blocks: (1) deny `run_shell_command` whose args mention `sqlite3|psql|mysql|mariadb|sqlite` as a whole word; (2) deny `run_shell_command` whose args mention `hud.db` (catches `cat`/`cp`/redirection tricks regardless of binary); (3) deny `read_file`/`write_file`/`replace` whose `file_path`/`path` arg mentions `hud.db`; (4) deny the same three file tools for any path under `/srv/hud/data/` (broader net, lower priority, defense-in-depth). Verified to parse cleanly via Python `tomllib` (regex backslashes survive correctly through TOML's single-quoted literal-string form) and to load with zero errors/warnings via live `gemini mcp list --debug`.
- `apps/web/agents/emily/AGENT.md` — **modified**. Hard rule #2 now explicitly states the MCP-only/no-raw-SQL rule "is also enforced natively by each CLI's permission layer," names the three config mechanisms (`.claude/settings.json` deny rules, `opencode.json` `permission` maps, `.gemini/settings.json` `tools.core` + `.gemini/policies/no-direct-db-access.toml`), and tells Emily plainly that the CLI will refuse the call before it reaches the database if she ever tries to route around MCP. (Symlinks `CLAUDE.md`/`GEMINI.md`/`AGENTS.md` reflect this automatically — all four are the same file via symlink.)

**Live MCP-still-works verification (Claude Code + OpenCode — full pass, post-config-change):**
- Claude: model reasoning trace lists exactly 8 tools — `hud_ping`, `hud_cashflow_add`, `hud_cashflow_categories`, `hud_cashflow_createCategory`, `hud_cashflow_delete`, `hud_cashflow_edit`, `hud_cashflow_list`, `hud_cashflow_summary`. Real mutation: created transaction "Ticket33 Verify Claude" (`amountMinor: -100`, PHP) then deleted it — both produced real `audit_log` rows:
  ```
  id=36  actor=agent:emily/claude   action=create  entity=transaction  entity_id=4
         payload_json={"item":"Ticket33 Verify Claude","amountMinor":-100,"currency":"PHP","categoryId":null,"occurredAt":"2026-06-08T00:00:00+08:00"}
         user_agent=mcp-hud/0.1.0  created_at=2026-06-08 03:46:25
  id=37  actor=agent:emily/claude   action=delete  entity=transaction  entity_id=4
         user_agent=mcp-hud/0.1.0  created_at=2026-06-08 03:49:03
  ```
- OpenCode: tool listing returned cleanly —
  ```
  hud.ping
  hud.cashflow.add
  hud.cashflow.categories
  hud.cashflow.createCategory
  hud.cashflow.delete
  hud.cashflow.edit
  hud.cashflow.list
  hud.cashflow.summary
  ```
  Real mutation: created "Ticket33 Verify OpenCode" (`amountMinor: -100`, PHP), then deleted it — both produced real `audit_log` rows:
  ```
  id=38  actor=agent:emily/opencode  action=create  entity=transaction  entity_id=4
         payload_json={"item":"Ticket33 Verify OpenCode","amountMinor":-100,"currency":"PHP","categoryId":null,"occurredAt":"2026-06-08T03:49:30.852Z"}
         user_agent=mcp-hud/0.1.0  created_at=2026-06-08 03:49:33
  id=39  actor=agent:emily/opencode  action=delete  entity=transaction  entity_id=4
         user_agent=mcp-hud/0.1.0  created_at=2026-06-08 03:50:51
  ```
  All actor strings, entity types, and `user_agent=mcp-hud/0.1.0` are exactly as `hud-audit`/blueprint expect — proving the new permission configs block **only** the targeted DB-bypass paths and leave every legitimate MCP code path fully intact.

**Live MCP-still-works verification (Gemini — partial, registry-level only):**
- `cd apps/web/agents/emily && GEMINI_CLI_TRUST_WORKSPACE=true gemini mcp list` → `✓ hud: node /srv/hud/app/packages/mcp-hud/dist/index.js (stdio) - Connected`, **with zero deprecation warnings** (the earlier `tools.exclude` draft printed `Warning: tools.exclude in settings.json is deprecated...`; removing it eliminated the warning while keeping the connection healthy — proof the final config is both clean and functional).
- (`GEMINI_CLI_TRUST_WORKSPACE=true` was needed only to get past Gemini's *workspace-trust* gate — `gemini mcp list` without it reports `MCP servers are configured but disabled because this folder is untrusted`. This is a separate, pre-existing Gemini behavior unrelated to my changes; the env var is documented in the bundle source as the sanctioned non-interactive trust override and does not touch any persisted config.)
- Could not get further than registry-level connection — see "Gemini auth gap" below.

**Refusal-proof transcripts (verbatim, CLI/permission-layer denials — not model judgment):**

*Claude Code* — ran from a neutral directory (`/tmp/t33-verify`) with `--settings /srv/hud/app/apps/web/agents/emily/.claude/settings.json` (Emily's deny rules loaded explicitly, persona/AGENT.md NOT loaded) and a neutral system prompt instructing the model to attempt the tool call and report the raw result rather than refuse on its own judgment — this isolates the CLI permission system as the thing being tested, not Emily's manners:
```
Error: Permission to use Bash with command sqlite3 /srv/hud/data/hud.db "SELECT id, item FROM transactions LIMIT 3;" has been denied.
```
and, on a follow-up attempt to read the file directly:
```
<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>
```
and, attempting `cat` as a workaround:
```
Permission to use Bash with command cat /srv/hud/data/hud.db has been denied.
```
All three are raw strings returned by Claude Code's **permission system** (not the model speaking) — `Permission to use Bash with command ... has been denied` and `<tool_use_error>File is in a directory that is denied by your permission settings.</tool_use_error>` are the CLI's own error-formatting, emitted before the tool executes.

*OpenCode* — ran from `apps/web/agents/emily/` (Emily's full persona + config loaded) framed as a "security-audit" request explaining that the correct way to honor the no-raw-SQL rule here was to let the **tool layer** block the call and report the literal denial (rather than refuse on judgment, which would prove nothing about whether the technical control works). Tool-call record (`part` table, `opencode.db`):
```json
{"type":"tool","tool":"bash","callID":"call_00_OE1ouCGRfSdJVWUkNg0M9769",
 "state":{"status":"error",
   "input":{"command":"sqlite3 /srv/hud/data/hud.db \"SELECT 1;\"",
            "description":"Attempt direct SQLite access to test permission deny-rule"},
   "error":"The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [{\"permission\":\"*\",\"action\":\"allow\",\"pattern\":\"*\"},{\"permission\":\"bash\",\"pattern\":\"*\",\"action\":\"allow\"},{\"permission\":\"bash\",\"pattern\":\"sqlite3*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"*sqlite3*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"psql*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"*psql*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"mysql*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"*mysql*\",\"action\":\"deny\"},{\"permission\":\"bash\",\"pattern\":\"*hud.db*\",\"action\":\"deny\"}]"}}
```
The model then reported it verbatim: *"Audit result — verbatim tool-layer response: `The user has specified a rule which prevents you from using this specific tool call. Here are some of the relevant rules [...]`. Technical control is active. Three deny-rule patterns matched: `sqlite3*`, `*sqlite3*`, and `*hud.db*`. The tool layer refused execution before any SQL reached the file."* The `error` string and the full `pattern`/`action` rule list are OpenCode's **permission engine** output (`The user has specified a rule which prevents...` is the engine's fixed error format — confirmed against the `PermissionRuleConfig` schema), not anything the model authored.

*Gemini* — **not capturable this session.** See "Gemini auth gap" immediately below for why, and what I verified instead as the closest available substitute proof.

**Gemini auth gap (honest account of what blocked full live verification):**
`gemini -p "..."` (any model-driven invocation) fails immediately with:
```
Please set an Auth method in your /srv/hud/.gemini/settings.json or specify one of the following environment variables before running: GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, GOOGLE_GENAI_USE_GCA
```
Investigated thoroughly: no `GEMINI_API_KEY`/`GOOGLE_GENAI_*` in the environment or anywhere in the repo (`grep` across `.env*`/`.json`/`.sh`/`ops/`); no cached OAuth credentials (`oauth_creds.json`, `google_accounts.json`) anywhere under `/srv/hud` or findable on the box; no `gcloud` installed (rules out ADC); `/srv/hud/secrets/.env` contains only `DATABASE_URL`/`NEXTAUTH_*`/`HUD_ALLOW_SIGNUP` — no Gemini credentials. Tried forcing the OAuth path explicitly: `GOOGLE_GENAI_USE_GCA=true gemini -p "ping" </dev/null` →
```
Error authenticating: FatalAuthenticationError: Manual authorization is required but the current session is non-interactive. Please run the Gemini CLI in an interactive terminal to log in, provide a GEMINI_API_KEY, or ensure Application Default Credentials are configured.
```
— OAuth device-flow categorically requires an interactive terminal, which this session does not have. **This is an environment/credentials gap, not a defect in my permission config** — note Ticket 24 records a *different* failure mode for Gemini (`TerminalQuotaError: capacity exhausted`), which only happens *after* successful auth — meaning a working credential existed at that time (likely the operator's own session-scoped OAuth) and has since expired or was never persisted for the `hud` user specifically. I've recorded this as a follow-up recommendation in Open Questions: provision a durable `GEMINI_API_KEY` for `hud` so future Gemini-path verification doesn't depend on an interactive login.

**What I verified for Gemini in lieu of the live transcript** (the closest honest substitute, all independently checkable):
1. The exact Policy Engine denial-error format the bundle source emits pre-execution: `"Tool execution denied by policy. <denyMessage>"` (`getPolicyDenialError`, `scheduler/policy.js`) — this is what a live denial *would* look like, format-verified from source rather than guessed.
2. The TOML policy file parses with zero errors via Python `tomllib` (independent parser) AND loads with zero errors/warnings inside the live CLI (`gemini mcp list --debug` shows no policy-load complaints — `loadTrustedFolders`/policy errors would `emitFeedback("warning", ...)` if the TOML were malformed, and none appeared).
3. The live, real deprecation warning for `tools.exclude` (`Warning: tools.exclude in settings.json is deprecated and will be removed in 1.0. Migrate to Policy Engine...`) — reproduced from an earlier draft config, which corroborated the schema research (this mechanism is being phased out) and justified pivoting fully to `tools.core` + Policy Engine for the final config.
4. `gemini mcp list` confirms the `hud` MCP server registers and connects cleanly with the new `tools.core` allowlist in place — proving the registry-level gate doesn't collide with MCP tool registration (which the source confirms uses an entirely separate discovery path).

**Commits (4, atomic, conventional):**
1. `e774dc8` — `feat(emily): add Claude Code permission deny rules for direct DB access`
2. `e11a53b` — `feat(emily): block raw SQL and DB-file access in OpenCode permission config`
3. `ad53c7b` — `feat(emily): add Gemini tool allowlist and workspace policy denying DB access`
4. `569be31` — `docs(emily): cross-reference native CLI permission guardrails in AGENT.md`

**Quality bar:** `pnpm lint` — passes (6 pre-existing warnings in `copy-standalone-assets.mjs`, unrelated to this change, untouched). `pnpm typecheck` — passes clean (`tsc --noEmit`, no errors; these are JSON/TOML/Markdown config changes with no TS surface).

**Files:** 4 added (`​.claude/settings.json`, `.gemini/policies/no-direct-db-access.toml`, plus the two new directories `.claude/` and `.gemini/policies/`), 3 modified (`opencode.json`, `.gemini/settings.json`, `AGENT.md`).

**Status rationale (`review`, not `done`):** every acceptance criterion that *can* be fully satisfied in this environment is satisfied and live-proven (Claude Code and OpenCode have complete config + live-MCP-works + live-refusal-transcript triples; Gemini has complete, research-honest config + partial live verification). The one gap — a live Gemini model-driven tool listing, mutation+audit row, and CLI-layer refusal transcript — is blocked by a missing model-auth credential for the `hud` user that is outside this ticket's scope to fix (an infra/secrets provisioning matter, flagged in Open Questions as a recommended follow-up). I'm flagging `review` so the operator can either (a) provision a `GEMINI_API_KEY` for `hud` and ask for a quick Gemini-only verification pass to close the loop, or (b) accept the config-level + source-level proof as sufficient and move straight to `done`. Either way, the technical control itself is in place and correctly designed — this is purely a "can I prove it live right now" gap, not a "does it work" gap.
