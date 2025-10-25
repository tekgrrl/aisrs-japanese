import { initializeApp, getApps, App, cert } from 'firebase-admin/app';
import { getFirestore, Firestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from './logger';

// --- Define collection names ---
export const KNOWLEDGE_UNITS_COLLECTION = 'knowledge-units';
export const REVIEW_FACETS_COLLECTION = 'review-facets';

let app: App;
let db: Firestore;

// --- Explicitly connect to the emulator ---
// We've removed the NODE_ENV check to eliminate ambiguity.
// This app, as configured, will *only* talk to the emulator.
logger.info('Initializing Firebase Admin SDK for EMULATOR...');

// Set the emulator host environment variable *before* initializing
// This is the most reliable way to ensure the SDK connects
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

if (!getApps().length) {
  // We initialize with a project ID, but no credentials,
  // as the emulator doesn't require them.
  app = initializeApp({
    projectId: 'aisrs-japanese-dev',
  });
  logger.info(
    `Initialized new Firebase app for emulator (Project: ${app.options.projectId})`
  );
} else {
  app = getApps()[0];
  logger.info(
    `Re-using existing Firebase app for emulator (Project: ${app.options.projectId})`
  );
}

db = getFirestore(app);

// Test the connection on startup
db.collection('_test')
  .limit(1)
  .get()
  .then(() => {
    logger.info(
      'Successfully connected to Firestore Emulator at 127.0.0.1:8080'
    );
  })
  .catch((e) => {
    logger.error(
      'CRITICAL: Failed to connect to Firestore Emulator at 127.0.0.1:8080',
      e
    );
  });

export { db, Timestamp };

