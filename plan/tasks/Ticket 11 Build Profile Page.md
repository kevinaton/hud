---
id: Ticket 11
title: Build Profile Page
status: done
priority: p2
area: feature
estimate: M
created: 2026-06-06
updated: 2026-06-06
depends-on: ["[[Ticket 03 Implement Authentication Sign-up Login Session Lockout]]"]
blocks: []
blueprint: "[[plan/blueprints/26060502-mvp-foundation-cashflow]]"
tags: [task, area/feature]
---

## Goal

Build a `/profile` page where the authenticated user can view and update their avatar, username, and email, change their password, and log out.

## Context

Auth (sessions, hashed passwords, user table) is established in [[Ticket 03 Implement Authentication Sign-up Login Session Lockout]]. This ticket adds the profile management surface. HUD is single-user, so no admin controls are needed — only the authenticated user edits their own profile.

Engineer must load `.claude/skills/hud-audit/SKILL.md`, `.claude/skills/hud-db/SKILL.md`, and `.claude/skills/hud-ui/SKILL.md`.

## Acceptance Criteria

### Page & navigation
- [x] Profile page is accessible at `/profile` while authenticated; unauthenticated requests redirect to `/login`
- [x] A link or avatar element in the global nav/header navigates to `/profile`

### Avatar
- [x] Current avatar is displayed on the profile page (fallback: initials-based placeholder using username initials and cyberpunk accent colour)
- [x] User can upload a new avatar image (JPEG/PNG/WebP, max 2 MB); the uploaded file is stored under `public/uploads/avatars/` (or equivalent server-writable path) and the path saved to the `users` table
- [x] Uploaded avatar is immediately reflected in the profile page and the nav element without a full page reload

### Edit username & email
- [x] User can update username; field is required, must be non-empty
- [x] User can update email; field must be a valid email format
- [x] Submitting the edit form calls `PUT /api/profile` with the changed fields; the `users` row is updated in the DB
- [x] On success: the page reflects the new values; a success message is shown
- [x] `PUT /api/profile` returns 401 if the session is missing or invalid
- [x] `PUT /api/profile` validates the request body with Zod
- [x] One `audit_log` row written per successful profile update: `actor='user'`, `action='update'`, `entity='user'`, `entity_id=<user id>`, `payload_json` contains the changed fields

### Change password
- [x] A separate "Change Password" form (or section) requires current password, new password, and confirmation
- [x] Current password is verified with argon2 before the update is applied
- [x] New password must be at least 8 characters
- [x] New password and confirmation must match; mismatch shows an inline error
- [x] Submitting calls `PUT /api/profile/password`; the `users.password_hash` is updated
- [x] `PUT /api/profile/password` returns 401 if the session is missing or invalid
- [x] `PUT /api/profile/password` returns 400 with a clear message if current password is wrong
- [x] One `audit_log` row written per successful password change: `actor='user'`, `action='update'`, `entity='user'`, `entity_id=<user id>`, `payload_json={"field":"password"}` (no hash in payload)

### Logout
- [x] A "Log Out" button is present on the profile page
- [x] Clicking "Log Out" calls `POST /api/auth/logout`, destroys the server-side session, and redirects to `/login`
- [x] One `audit_log` row written per logout: `actor='user'`, `action='logout'`, `entity='session'`, `entity_id=<session id>`

### General
- [x] `pnpm test:run` passes; new unit tests cover `PUT /api/profile` and `PUT /api/profile/password` (happy path + 401 + validation errors)
- [x] `pnpm typecheck` passes

## Sub-tasks

- [x] Add `users.avatar_path` column via Drizzle migration (nullable text)
- [x] Add `GET /api/profile` route — returns current user's username, email, avatar_path
- [x] Add `PUT /api/profile` route — Zod validation, session guard, update username/email, audit log
- [x] Add `PUT /api/profile/password` route — session guard, verify current password, hash new password, update, audit log
- [x] Add `POST /api/auth/logout` route (if not already present) — destroy session, redirect
- [x] Build `/profile` page component — avatar display + upload, username/email form, change-password form, logout button
- [x] Wire avatar upload — multipart POST or separate `PUT /api/profile/avatar` endpoint; save file, update `users.avatar_path`
- [x] Add initials-based avatar fallback component (cyberpunk style — cyan accent)
- [x] Add nav/header link to `/profile` (or clickable avatar)
- [x] Write unit tests for PUT /api/profile and PUT /api/profile/password
- [x] Run `pnpm test:run` and `pnpm typecheck`

## Open Questions

## Notes

### 2026-06-06 — implementation

- `packages/db/schema.ts` — added `avatarPath` column to `users` table
- `packages/db/migrations/0001_sturdy_malcolm_colcord.sql` — `ALTER TABLE users ADD avatar_path TEXT`
- `apps/web/lib/db/users.ts` — added `updateUserProfile` (displayName/email/avatarPath, diff-only audit), `updateUserPassword` (audit payload `{field:'password'}`, no hash)
- `apps/web/app/api/profile/route.ts` — `GET /api/profile` (returns user fields), `PUT /api/profile` (Zod, CSRF, session, audit)
- `apps/web/app/api/profile/password/route.ts` — `PUT /api/profile/password` (argon2 verify, hash new pw, audit)
- `apps/web/app/api/profile/avatar/route.ts` — `POST /api/profile/avatar` (multipart, JPEG/PNG/WebP, 2 MB max, saves to `public/uploads/avatars/<userId>.<ext>`)
- `apps/web/components/hud/AvatarDisplay.tsx` — initials fallback using `bg-accent text-accent-fg` tokens (no inline hex)
- `apps/web/app/(app)/profile/page.tsx` — Server Component; reads session, passes user data to ProfileClient
- `apps/web/app/(app)/profile/layout.tsx` — 56px sticky header with back chevron and "Profile" title
- `apps/web/app/(app)/profile/_ProfileClient.tsx` — client component: AvatarSection, EditProfileForm, ChangePasswordForm, LogoutButton (all CSRF-protected)
- `apps/web/app/(app)/finance/layout.tsx` — added `AvatarDisplay` nav element (32px) linking to `/profile`; now an async server component calling `requireSession()` (memoized, no extra DB read)
- `POST /api/auth/logout` was already present from Ticket 03 — not duplicated
- `avatar_path TEXT` added to all 5 existing in-memory test schemas that had incomplete users DDL
- `apps/web/app/api/profile/__tests__/route.test.ts` — 9 tests for GET + PUT /api/profile
- `apps/web/app/api/profile/__tests__/password.test.ts` — 7 tests for PUT /api/profile/password
- Files: 10 added, 10 modified
- Commits: 1 (`feat(profile): build profile page with avatar upload, edit, password change, and logout`)
- `pnpm typecheck` passes, `pnpm lint` passes, `pnpm build` passes (17 routes), `pnpm test:run` passes (149 tests)
- Open Questions surfaced: none
