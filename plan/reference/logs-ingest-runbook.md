---
title: Logs Ingest — Runbook
area: infra
created: 2026-06-12
updated: 2026-06-12
tags: [reference, logs, gmail, systemd, airbnb]
---

# Logs Ingest — Runbook

## Overview

The HUD logs-ingest worker polls `jarvismolt8@gmail.com` via the Gmail API (read-only) every 15 minutes via a systemd timer. It:

1. Fetches new messages matching the sender whitelist (`automated@airbnb.com`)
2. Verifies DKIM (`dkim=pass` for `d=airbnb.com`)
3. Stores the raw message in `log_raw`
4. Classifies and parses into `log_entries`
5. Writes a heartbeat to `app_settings.logs.last_successful_ingest`

Approved entries project into `airbnb_reservations` / `airbnb_payouts`, and approved payout entries post an income row to `transactions` (Cashflow).

---

## Initial OAuth Consent (one-time, on laptop)

The Gmail API uses an installed-app OAuth2 flow. The refresh token is captured once on the operator's laptop.

### Steps

1. **Create Google Cloud project** (if not already done):
   - Go to console.cloud.google.com → New Project → "HUD"
   - Enable the Gmail API: APIs & Services → Library → Gmail API → Enable

2. **Create OAuth 2.0 credentials**:
   - APIs & Services → Credentials → Create → OAuth client ID
   - Application type: **Desktop app**
   - Download the JSON credentials file → `gmail-oauth-client.json`

3. **Run the consent script** on your laptop:
   ```bash
   cd /srv/hud/app
   node scripts/gmail-oauth-consent.js --credentials gmail-oauth-client.json
   ```
   This opens a browser → grant the `gmail.readonly` scope → captures the refresh token → writes `logs-gmail-token.json`.

4. **Encrypt and deploy**:
   ```bash
   # Encrypt with sops/age (see plan/reference/secrets.md)
   sops --encrypt --age $(cat ~/.config/sops/age/keys.txt | grep "public key" | awk '{print $4}') \
     logs-gmail-token.json > ops/secrets/logs-gmail-token.json.sops

   # On server: decrypt into the secrets directory
   sops --decrypt ops/secrets/logs-gmail-token.json.sops > /srv/hud/secrets/logs-gmail-token.json
   chmod 600 /srv/hud/secrets/logs-gmail-token.json
   chown agent-hud:agent-hud /srv/hud/secrets/logs-gmail-token.json
   ```

5. **Write the env file** at `/srv/hud/secrets/logs-gmail.env`:
   ```env
   GMAIL_CREDENTIALS_PATH=/srv/hud/secrets/logs-gmail-token.json
   GMAIL_USER_ID=jarvismolt8@gmail.com
   LOGS_USER_ID=1
   ```
   ```bash
   chmod 600 /srv/hud/secrets/logs-gmail.env
   chown agent-hud:agent-hud /srv/hud/secrets/logs-gmail.env
   ```

---

## Timer Operations

### Enable and start the timer

```bash
# On the Hetzner server
sudo systemctl daemon-reload
sudo systemctl enable hud-logs-ingest.timer
sudo systemctl start hud-logs-ingest.timer
```

### Check timer status

```bash
systemctl status hud-logs-ingest.timer
systemctl list-timers hud-logs-ingest.timer
```

### Stop the timer (pause ingestion)

```bash
sudo systemctl stop hud-logs-ingest.timer
```

### Run a single ingest manually

```bash
# As agent-hud user
sudo -u agent-hud systemctl start hud-logs-ingest.service
# Or directly:
sudo -u agent-hud /usr/local/bin/node --loader tsx/esm \
  /srv/hud/app/packages/logs-ingest/src/run.ts --user-id=1
```

---

## Re-parse Mode

If Airbnb changes their email templates and the parsers return `parse_failed`, you can:

1. Add a new parser version (`reservation_confirmed.v2.ts`) with updated selectors
2. Update the registry to register the v2 parser
3. Run re-parse (no Gmail fetch, just re-runs parsers over stored `log_raw`):

```bash
sudo -u agent-hud /usr/local/bin/node --loader tsx/esm \
  /srv/hud/app/packages/logs-ingest/src/run.ts --reparse --user-id=1
```

This is non-destructive: `parse_failed` entries with the old parser are re-evaluated. If v2 parses successfully, status moves to `pending` (awaiting approval).

---

## Token Rotation

If the Gmail refresh token expires or is revoked:

1. Repeat the **Initial OAuth Consent** steps above (start from step 3).
2. The old token file at `/srv/hud/secrets/logs-gmail-token.json` will be overwritten.
3. No service restart needed — the token is read on each run.

Signs the token is expired:
- `journalctl -u hud-logs-ingest` shows `401 Unauthorized` from the Gmail API
- `app_settings.logs.last_successful_ingest` is stale by >1 hour (Uptime Kuma alert fires)

---

## Uptime Kuma Heartbeat Monitor

A "Push" type monitor in Uptime Kuma checks that `logs.last_successful_ingest` is written every successful run.

After a successful ingest, the worker calls `setAppSetting(userId, 'logs.last_successful_ingest', new Date().toISOString())`. The Uptime Kuma monitor is configured as:
- **Type:** Push
- **Heartbeat interval:** 15 minutes
- **Alert threshold:** stale by > 1 hour (4 missed intervals)

The `mcp-hud` server has a `getAppSetting` tool that can be used to check the last run time from any agent session.

---

## Common Failure Scenarios

### 1. DKIM verification failures

**Symptom:** entries in `log_entries` have `status='rejected'` and `status_reason='dkim_fail'`.

**Cause:** Either a forged email, a legitimate Airbnb email that failed DKIM (unusual), or the parser's domain check is misconfigured.

**Resolution:** Inspect `log_raw.headers_json` for the `Authentication-Results` header to see the raw DKIM result. Do NOT approve a DKIM-failed entry manually.

```sql
SELECT le.id, le.sender, le.subject, le.status_reason, lr.headers_json
FROM log_entries le
LEFT JOIN log_raw lr ON lr.log_entry_id = le.id
WHERE le.status = 'rejected' AND le.status_reason = 'dkim_fail'
ORDER BY le.received_at DESC LIMIT 10;
```

### 2. Parser failures (`parse_failed`)

**Symptom:** entries have `status='parse_failed'`; `status_reason` describes which field failed.

**Cause:** Airbnb changed their email template, breaking a brittle regex.

**Resolution:**
1. Read the stored `log_raw.body_text` to see the actual email content.
2. Update the affected parser — add a v2 file with updated selectors.
3. Run `--reparse` to process stored raws with the new parser.

```sql
SELECT le.id, le.kind, le.status_reason, le.received_at
FROM log_entries le
WHERE le.status = 'parse_failed'
ORDER BY le.received_at DESC LIMIT 20;
```

### 3. Stale heartbeat — no alert from Uptime Kuma

**Check the logs:**
```bash
journalctl -u hud-logs-ingest --since "2 hours ago"
```

**Check the timer fired:**
```bash
systemctl list-timers hud-logs-ingest.timer
# Look at "Last trigger" timestamp
```

**Common causes:**
- Timer not enabled: `systemctl enable --now hud-logs-ingest.timer`
- Credential file missing or wrong permissions: `ls -la /srv/hud/secrets/logs-gmail*`
- Node.js missing or wrong path: `which node && node --version`
- DATABASE_URL not set: check `/srv/hud/secrets/.env`

### 4. Duplicate entries

The `(user_id, source, external_ref)` unique index on `log_entries` prevents duplicates. If you see a `UNIQUE constraint failed` error, the system is working as intended — this is idempotency enforcement, not a bug.

### 5. Payout not appearing in Cashflow

1. Check the `log_entries` row is `status='recorded'`.
2. Check `airbnb_payouts.cashflow_transaction_id` is set.
3. If `cashflow_transaction_id` is null, re-approve the entry via the Logs tab (the idempotency guard means this is safe).
4. If re-approval fails, check `transactions` for `external_id='airbnb:payout:<gmailMessageId>'`.

```sql
SELECT ap.id, ap.external_ref, ap.payout_total_minor, ap.cashflow_transaction_id
FROM airbnb_payouts ap
WHERE ap.cashflow_transaction_id IS NULL;
```
