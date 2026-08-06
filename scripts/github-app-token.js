#!/usr/bin/env node
/**
 * Mints a short-lived (1hr) GitHub App installation access token and prints
 * it to stdout. Use as: GH_TOKEN=$(node scripts/github-app-token.js) gh ...
 *
 * Requires GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_PATH
 * as env vars (see scripts/.env.github-app, gitignored).
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(path.join(__dirname, '.env.github-app'));

const APP_ID = process.env.GITHUB_APP_ID;
const INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;
const PRIVATE_KEY_PATH = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

if (!APP_ID || !INSTALLATION_ID || !PRIVATE_KEY_PATH) {
  console.error('Missing GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, or GITHUB_APP_PRIVATE_KEY_PATH.');
  console.error('Set them in scripts/.env.github-app or the environment.');
  process.exit(1);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function buildJwt(appId, privateKeyPem) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = { iat: now - 60, exp: now + 600, iss: appId };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKeyPem);
  const encodedSignature = signature
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${encodedSignature}`;
}

async function main() {
  const privateKeyPem = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const jwt = buildJwt(APP_ID, privateKeyPem);

  const res = await fetch(
    `https://api.github.com/app/installations/${INSTALLATION_ID}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`GitHub API error ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = await res.json();
  process.stdout.write(data.token);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
