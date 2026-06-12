#!/usr/bin/env node
/**
 * packages/logs-ingest/src/scripts/oauth-init.mjs
 *
 * One-time Gmail OAuth2 consent flow for the logs-ingest worker.
 * Run this on a machine with a browser (your laptop).
 *
 * Usage:
 *   node packages/logs-ingest/src/scripts/oauth-init.mjs
 *   node packages/logs-ingest/src/scripts/oauth-init.mjs \
 *     --credentials path/to/client_secret.json \
 *     --out logs-gmail-credentials.json
 *
 * Prerequisites (Google Cloud Console):
 *   1. Create a project → enable Gmail API
 *   2. OAuth 2.0 credentials → Desktop app → download JSON
 *   3. Add http://localhost:4399 to "Authorized redirect URIs"
 *      (Credentials → edit your OAuth client → Authorized redirect URIs → Add URI)
 *
 * Output:
 *   logs-gmail-credentials.json  — { client_id, client_secret, refresh_token }
 *   Printed env snippet          — paste into /srv/hud/secrets/logs-gmail.env on server
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { exec } from 'node:child_process';
import { createInterface } from 'node:readline';
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const REDIRECT_PORT = 4399;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(flag) {
  const entry = args.find((a) => a.startsWith(`${flag}=`));
  if (entry) return entry.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return null;
}

const credentialsPath = getArg('--credentials');
const outPath = getArg('--out') ?? 'logs-gmail-credentials.json';

// ---------------------------------------------------------------------------
// Load client credentials
// ---------------------------------------------------------------------------
function loadClientCredentials() {
  if (credentialsPath) {
    if (!existsSync(credentialsPath)) {
      console.error(`\nError: credentials file not found: ${credentialsPath}\n`);
      process.exit(1);
    }
    const raw = JSON.parse(readFileSync(credentialsPath, 'utf8'));
    // Google downloads either { installed: {...} } or { web: {...} }
    const creds = raw.installed ?? raw.web ?? raw;
    if (!creds.client_id || !creds.client_secret) {
      console.error('\nError: credentials JSON must contain client_id and client_secret\n');
      process.exit(1);
    }
    return { client_id: creds.client_id, client_secret: creds.client_secret };
  }

  // No file — check env vars
  const client_id = process.env.GMAIL_CLIENT_ID;
  const client_secret = process.env.GMAIL_CLIENT_SECRET;
  if (client_id && client_secret) {
    return { client_id, client_secret };
  }

  // Fall back to interactive prompt
  return null;
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------
async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ---------------------------------------------------------------------------
// Try to open a browser URL cross-platform
// ---------------------------------------------------------------------------
function openBrowser(url) {
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) {
      // Silently fail — user can open manually from the printed URL
    }
  });
}

// ---------------------------------------------------------------------------
// Exchange auth code for tokens
// ---------------------------------------------------------------------------
async function exchangeCode(client_id, client_secret, code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id,
      client_secret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const body = await res.json();

  if (!res.ok || !body.refresh_token) {
    console.error('\nToken exchange failed:');
    console.error(JSON.stringify(body, null, 2));
    if (!body.refresh_token && res.ok) {
      console.error(
        '\nNo refresh_token returned. This usually means the app already has a grant.\n' +
          'Fix: go to https://myaccount.google.com/permissions → revoke "HUD" → re-run this script.',
      );
    }
    process.exit(1);
  }

  return { access_token: body.access_token, refresh_token: body.refresh_token };
}

// ---------------------------------------------------------------------------
// Wait for redirect on localhost
// ---------------------------------------------------------------------------
async function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
      const code = reqUrl.searchParams.get('code');
      const error = reqUrl.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html' });

      if (error) {
        res.end(
          `<html><body style="font-family:monospace;padding:2rem">
            <h2>Authorization denied</h2>
            <p>Error: ${error}</p>
            <p>Close this tab and re-run the script.</p>
          </body></html>`,
        );
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code) {
        res.end(
          `<html><body style="font-family:monospace;padding:2rem">
            <h2 style="color:green">Authorization granted</h2>
            <p>You can close this tab. Return to your terminal.</p>
          </body></html>`,
        );
        server.close();
        resolve(code);
        return;
      }

      // Any other path (e.g. favicon) — ignore
      res.end('');
    });

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
      // Listening, ready for redirect
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${REDIRECT_PORT} is already in use. Stop whatever is using it and re-run.`,
          ),
        );
      } else {
        reject(err);
      }
    });

    // 5 minute timeout
    setTimeout(
      () => {
        server.close();
        reject(new Error('Timed out waiting for browser redirect (5 minutes).'));
      },
      5 * 60 * 1000,
    );
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('\n=== HUD Gmail OAuth Setup ===\n');

  // 1. Load or prompt for client credentials
  let creds = loadClientCredentials();

  if (!creds) {
    console.log('No --credentials file provided. Enter your Google OAuth client details:\n');
    console.log(
      '  (Create at console.cloud.google.com → APIs & Services → Credentials → Desktop app)',
    );
    console.log(
      '  Make sure http://localhost:4399 is in the Authorized Redirect URIs for this client.\n',
    );
    const client_id = await prompt('Client ID: ');
    const client_secret = await prompt('Client Secret: ');
    if (!client_id || !client_secret) {
      console.error('\nClient ID and Client Secret are required.\n');
      process.exit(1);
    }
    creds = { client_id, client_secret };
  }

  console.log(`\nClient ID: ${creds.client_id.slice(0, 20)}...`);
  console.log(`Output file: ${outPath}`);
  console.log(`Redirect URI: ${REDIRECT_URI}  ← must be in your OAuth client's allowed URIs\n`);

  // 2. Build auth URL
  const authParams = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent', // forces refresh_token to be returned even if already granted
  });
  const fullAuthUrl = `${AUTH_URL}?${authParams}`;

  console.log('Opening browser for Google sign-in...');
  console.log('Sign in as: jarvismolt8@gmail.com\n');
  console.log('If the browser does not open, paste this URL manually:\n');
  console.log(`  ${fullAuthUrl}\n`);

  openBrowser(fullAuthUrl);

  // 3. Wait for redirect
  console.log(`Waiting for redirect on ${REDIRECT_URI} ...`);
  const code = await waitForCode();
  console.log('Code received. Exchanging for tokens...');

  // 4. Exchange code
  const tokens = await exchangeCode(creds.client_id, creds.client_secret, code);
  console.log('Refresh token obtained.\n');

  // 5. Write credentials file
  const output = {
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    refresh_token: tokens.refresh_token,
  };
  writeFileSync(outPath, JSON.stringify(output, null, 2), { mode: 0o600 });
  console.log(`Credentials written to: ${outPath}  (mode 600)\n`);

  // 6. Print next steps
  console.log('=== Next steps ===\n');
  console.log('1. Verify the file looks correct:');
  console.log(`   cat ${outPath}\n`);
  console.log('2. Copy to the server (or sops-encrypt first):');
  console.log(`   scp ${outPath} hud-server:/srv/hud/secrets/logs-gmail-credentials.json`);
  console.log(
    '   ssh hud-server "chmod 600 /srv/hud/secrets/logs-gmail-credentials.json && chown agent-hud:agent-hud /srv/hud/secrets/logs-gmail-credentials.json"\n',
  );
  console.log('3. Write /srv/hud/secrets/logs-gmail.env on the server:');
  console.log('   GMAIL_CREDENTIALS_PATH=/srv/hud/secrets/logs-gmail-credentials.json');
  console.log('   GMAIL_SOURCE_ACCOUNT=jarvismolt8@gmail.com');
  console.log('   LOGS_USER_ID=1\n');
  console.log('4. Enable the timer:');
  console.log('   sudo systemctl daemon-reload');
  console.log('   sudo systemctl enable --now hud-logs-ingest.timer\n');
  console.log('Done.');
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
