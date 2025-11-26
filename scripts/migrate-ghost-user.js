const admin = require("firebase-admin");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const CURRENT_USER_ID = "user_default";
const COLLECTIONS = [
  "knowledge-units",
  "review-facets",
  "questions",
  "lessons",
];

async function initFirebase() {
  // Check if running against emulator
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(
      `Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`
    );
    admin.initializeApp({
      projectId: "aisrs-japanese-dev", // Use a dummy project ID for emulator
    });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log("Connecting to Firestore with Service Account Key");
    try {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:", error);
      process.exit(1);
    }
  } else {
    console.log(
      "Attempting to connect with default credentials (GOOGLE_APPLICATION_CREDENTIALS)..."
    );
    admin.initializeApp();
  }
}

async function migrateCollection(db, collectionName) {
  console.log(`\n--- Migrating collection: ${collectionName} ---`);
  const collectionRef = db.collection(collectionName);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`No documents found in ${collectionName}.`);
    return;
  }

  let updatedCount = 0;
  let skippedCount = 0;
  const batchSize = 500;
  let batch = db.batch();
  let operationCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Check if userId is missing
    if (!data.userId) {
      batch.update(doc.ref, { userId: CURRENT_USER_ID });
      updatedCount++;
      operationCount++;
    } else {
      skippedCount++;
    }

    // Commit batch if limit reached
    if (operationCount >= batchSize) {
      await batch.commit();
      console.log(`Committed batch of ${operationCount} updates...`);
      batch = db.batch();
      operationCount = 0;
    }
  }

  // Commit remaining
  if (operationCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${operationCount} updates.`);
  }

  console.log(
    `Finished ${collectionName}: Updated ${updatedCount}, Skipped ${skippedCount}`
  );
}

async function main() {
  try {
    await initFirebase();
    const db = admin.firestore();

    console.log(`Starting migration to add userId: '${CURRENT_USER_ID}'...`);

    for (const collectionName of COLLECTIONS) {
      await migrateCollection(db, collectionName);
    }

    console.log("\nMigration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
