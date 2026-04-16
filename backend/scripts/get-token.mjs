/**
 * Mints a Firebase ID token for a given UID using the Admin SDK.
 *
 * Prerequisites:
 *   - A service account key JSON downloaded from:
 *     Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   - The Firebase Web API key from:
 *     Firebase Console → Project Settings → General
 *
 * Usage (from /backend directory):
 *   node scripts/get-token.mjs <uid> <web-api-key> <path-to-service-account.json>
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

const [uid, webApiKey, serviceAccountPath] = process.argv.slice(2);

if (!uid || !webApiKey || !serviceAccountPath) {
  console.error('Usage: node scripts/get-token.mjs <uid> <web-api-key> <path-to-service-account.json>');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

initializeApp({ credential: cert(serviceAccount) });

// 1. Mint a custom token
const customToken = await getAuth().createCustomToken(uid);

// 2. Exchange custom token → ID token via REST
const res = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${webApiKey}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  }
);

const json = await res.json();

if (!res.ok) {
  console.error('Failed to exchange token:', json);
  process.exit(1);
}

console.log('\nID Token (valid for 1 hour):\n');
console.log(json.idToken);
