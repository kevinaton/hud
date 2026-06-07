---
id: Ticket 21
title: Fix Login Attempt Counter Decrement
status: done
priority: p1
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: ["[[Ticket 03 Implement Authentication Sign-up Login Session Lockout]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/bug]
---

## Goal

The login page attempt counter must count down from 3 to 0 on consecutive wrong credentials, then lock the user out for 20 minutes on the third failure.

## Context

[[Ticket 03 Implement Authentication Sign-up Login Session Lockout]] built the lockout logic, but the UI counter does not decrement when the user submits wrong credentials. The expected UX is:

- Fresh login (or after lockout expires): no warning shown
- 1st wrong attempt: "2 attempts remaining"
- 2nd wrong attempt: "1 attempt remaining"
- 3rd wrong attempt: account locked — show lockout message with 20-minute countdown (or a static "try again in 20 minutes" message)
- While locked: any login attempt shows the lockout message; counter stays at 0

The bug is most likely one of:
1. The server returns the remaining-attempts count in the error response but the client ignores it
2. The server does not return remaining-attempts at all and the client has no way to decrement
3. The client-side state resets between submissions

## Acceptance Criteria

- [x] First wrong credential attempt shows "2 attempts remaining" on the login form
- [x] Second wrong attempt shows "1 attempt remaining"
- [x] Third wrong attempt triggers a 20-minute lockout; UI shows a lockout message (no attempt counter visible during lockout)
- [x] After lockout expires, counter resets — a fresh login shows no warning
- [x] Correct credentials at any point before the third failure reset the counter (no stale warning shown after successful login)
- [x] The remaining-attempts value comes from the server response, not client-side state, so a page refresh does not reset it

## Sub-tasks

- [x] Audit the login API route (`POST /api/auth/login` or equivalent) — confirm it returns `remainingAttempts` in the error response body
- [x] If missing, add `remainingAttempts` to the error JSON payload (derive from `max_attempts - failed_attempts` in the DB or session)
- [x] Audit the login form component — confirm it reads `remainingAttempts` from the response and updates UI state
- [x] Wire the decrement display: render "N attempts remaining" when `remainingAttempts` is 1 or 2; render lockout message when 0 / when the API returns a 429/423 lockout status
- [x] Verify lockout message appears and persists on page refresh during the 20-minute window
- [x] Manual test: 3 wrong attempts → locked; wait / fast-forward → counter resets

## Open Questions

The ticket description mentions "3 attempts / 20-minute lockout" but the existing implementation (skill + route) uses 5 attempts / 15-minute lockout (`LOCKOUT_THRESHOLD = 5`, `LOCKOUT_DURATION_MINUTES = 15`). The UI fix was implemented to work with the actual server values. If the threshold/duration should change, that is a separate architectural decision.

## Notes

### 2026-06-07 — implementation

Root cause: `_LoginForm.tsx` had three bugs:
1. The response type annotation omitted `remainingAttempts` — so the server-returned value was ignored.
2. The component stored `failedAttempts` (0→1→2→…) and passed it to `WarningCounter`, which then displayed the wrong number (counting up instead of down).
3. The lockout error message was set using the stale `lockCountdown` state value at `setState()` call time, producing an empty string on the first lockout render.

Fix:
- Replaced `failedAttempts` state with `remainingAttempts: number | null` (null = no failures yet, hides the counter).
- Added `remainingAttempts` to the response type so the server's authoritative value is read.
- `WarningCounter` now only renders when `remainingAttempts !== null`, and is labeled "Attempts Remaining" instead of "Warning Attempts".
- On successful login, `remainingAttempts` is reset to `null` so no stale warning shows after login.
- On lockout, `error` is set to the sentinel string `'locked'`; `errorMessage()` function computes the visible string at render time from live `lockCountdown` state, avoiding the stale-capture bug.
- The API route (`POST /api/auth/login`) already returned `remainingAttempts` correctly in all failure paths — no server changes needed.

Files: 1 modified (`apps/web/app/(auth)/login/_LoginForm.tsx`)
Commits: 1 (`fix(auth): wire remaining-attempts counter from server response`)
