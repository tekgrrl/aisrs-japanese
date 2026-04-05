const admin = require("firebase-admin");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });

const OLD_UID = "user_default";
const NEW_UID = "EnBuzutzldhTJdMCSf5dH2ZTzSi2";

const COLLECTIONS = [
  "knowledge-units",
  "review-facets",
  "questions",
  "lessons",
  "scenarios"
];

async function initFirebase() {
  admin.initializeApp({ projectId: "gen-lang-client-0878434798" });
}

async function migrateCollection(db, collectionName) {
  console.log(`\n--- V1 UID Swap: ${collectionName} ---`);
  const collectionRef = db.collection(collectionName);
  let snapshot;
  if (collectionName === 'scenarios') {
    snapshot = await collectionRef.get(); // They never had a userId assigned
  } else {
    snapshot = await collectionRef.where("userId", "==", OLD_UID).get();
  }

  if (snapshot.empty) {
    console.log(`No documents found for ${OLD_UID} in ${collectionName}.`);
    return;
  }

  let batch = db.batch();
  let operationCount = 0;
  
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { userId: NEW_UID });
    operationCount++;
    if (operationCount >= 500) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  }

  if (operationCount > 0) {
    await batch.commit();
  }
  console.log(`Updated ${snapshot.size} documents in ${collectionName}`);
}

async function main() {
  try {
    await initFirebase();
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore(admin.app(), "aisrs-japanese-dev");
    console.log(`Swapping ${OLD_UID} to ${NEW_UID}...`);

    for (const collectionName of COLLECTIONS) {
      await migrateCollection(db, collectionName);
    }
    
    // Also move user-stats
    const oldStats = await db.collection("user-stats").doc(OLD_UID).get();
    if (oldStats.exists) {
       await db.collection("user-stats").doc(NEW_UID).set(oldStats.data());
       console.log("Copied user-stats");
    }

    console.log("Swap complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
