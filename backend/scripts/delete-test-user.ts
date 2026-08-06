/**
 * Deletes a test user completely: the users/{uid} doc and every subcollection
 * underneath it (recursively — user-kus, review-facets, scenarios,
 * user-grammar-lessons, question-states, user-lessons, user-concepts, feed,
 * whatever exists), plus the Firebase Auth account if one exists for this uid
 * (best-effort — silently skipped for synthetic uids that were never real
 * signups, e.g. anything created via create-test-user.ts).
 *
 * DESTRUCTIVE. Run from backend/: npx ts-node -r tsconfig-paths/register scripts/delete-test-user.ts <uid>
 */
import 'dotenv/config';
import * as admin from 'firebase-admin';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FIRESTORE_CONNECTION } from '../src/firebase/firebase.module';
import type { Firestore } from 'firebase-admin/firestore';

async function main() {
  const uid = process.argv[2];
  if (!uid) {
    console.error('Usage: delete-test-user.ts <uid>');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get<Firestore>(FIRESTORE_CONNECTION);

  const userRef = db.collection('users').doc(uid);
  const before = await userRef.get();
  if (!before.exists) {
    console.log(`No users/${uid} doc found — nothing to delete in Firestore.`);
  } else {
    console.log(`Recursively deleting users/${uid} and all subcollections...`);
    await db.recursiveDelete(userRef);
    console.log('  done.');
  }

  try {
    await admin.auth().deleteUser(uid);
    console.log(`Deleted Firebase Auth account for uid=${uid}.`);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      console.log(`No Firebase Auth account for uid=${uid} (expected for synthetic test uids).`);
    } else {
      console.error(`Failed to delete Firebase Auth account for uid=${uid}:`, err);
    }
  }

  await app.close();
}

main().catch(err => { console.error(err); process.exit(1); });
