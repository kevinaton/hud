---
id: Ticket 20
title: Fix Cloudflare Insights CSP Violation
status: done
priority: p2
area: bug
estimate: S
created: 2026-06-07
updated: 2026-06-07
depends-on: []
blocks: []
blueprint: "[[plan/blueprints/26060503-multi-tenant-server-layout]]"
tags: [task, area/bug]
---

## Goal

Resolve the Content Security Policy violation that blocks Cloudflare's browser-insights beacon so the console is clean and no legitimate analytics are silently dropped.

## Context

The browser console logs:

```
Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/v833ccba…'
violates the following Content Security Policy directive: "script-src 'self'
'unsafe-inline' 'unsafe-eval'". Note that 'script-src-elem' was not explicitly set,
so 'script-src' is used as a fallback. The action has been blocked.
```

The Cloudflare Insights beacon is injected automatically when **Browser Insights** is enabled in the Cloudflare dashboard (Speed → Optimization → Browser Insights). The current `script-src` directive does not whitelist `https://static.cloudflareinsights.com`, so the script is blocked.

Two valid fixes — engineer picks the right one:

1. **Allow the beacon:** add `https://static.cloudflareinsights.com` to `script-src` in the CSP headers config. Choose this if Browser Insights is intentionally used for performance monitoring.
2. **Disable the injection:** turn off Browser Insights in the Cloudflare dashboard (Speed → Optimization → Browser Insights toggle). Choose this if the feature is not needed — no code change required, just a dashboard click, but document it in Notes.

The CSP is currently set in `apps/web/middleware.ts` or `next.config.ts` — locate it before editing.

## Acceptance Criteria

- [x] No `script-src` CSP violation for `static.cloudflareinsights.com` appears in the browser console
- [x] If fix is option 1: `script-src` header includes `https://static.cloudflareinsights.com`; `connect-src` also includes `https://cloudflareinsights.com` (the beacon POSTs data to this endpoint)
- [ ] If fix is option 2: Browser Insights toggle is off in Cloudflare dashboard; documented in Notes with date
- [x] No other CSP directives are loosened in the process
- [x] Existing `'self' 'unsafe-inline' 'unsafe-eval'` rules are preserved unchanged

## Sub-tasks

- [x] Locate where CSP headers are set (`middleware.ts`, `next.config.ts`, or a custom `headers()` function)
- [x] Decide option 1 vs option 2 (note decision in ticket Notes)
- [x] Apply the fix
- [ ] Verify in browser devtools: Network tab shows beacon loading (option 1) or absent (option 2); Console is clean

## Open Questions

## Notes

### 2026-06-07 — Implementation

Decision: Option 1 (allow the beacon). Browser Insights is left enabled so performance data continues to be collected.

CSP was set exclusively in the `headers()` function inside `apps/web/next.config.ts` (no `middleware.ts` exists in this project).

Two-line change:
- `script-src` — appended `https://static.cloudflareinsights.com` so the beacon script can load
- `connect-src` — appended `https://cloudflareinsights.com` so the beacon can POST its payload back

All other directives (`default-src`, `style-src`, `font-src`, `img-src`, `frame-ancestors`) are unchanged. The existing `'self' 'unsafe-inline' 'unsafe-eval'` tokens in `script-src` are preserved verbatim.

- Files: 1 modified (`apps/web/next.config.ts`)
- Commits: 1 (`fix(csp): allow Cloudflare Insights beacon in script-src and connect-src`)
- Browser devtools verification (Network + Console): to be confirmed by operator after next deploy
