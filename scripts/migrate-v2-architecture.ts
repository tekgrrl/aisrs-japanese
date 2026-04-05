/**
 * V2 Strict Multi-Tenant Architecture Migration Script
 *
 * NON-DESTRUCTIVE: This script only READS from legacy collections and WRITES
 * to new v2 collections. No legacy documents are modified or deleted.
 *
 * Usage:
 *   # Against Cloud Firestore (production):
 *   npx ts-node scripts/migrate-v2-architecture.ts
 *
 *   # Against Firestore Emulator (optional dry run):
 *   FIRESTORE_EMULATOR_HOST="127.0.0.1:8080" npx ts-node scripts/migrate-v2-architecture.ts
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string) OR
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account key file OR
 *   - Application Default Credentials configured via `gcloud auth application-default login`
 *   - Run from the project root: npx ts-node scripts/migrate-v2-architecture.ts
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local in the project root
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

// ─── Constants ───────────────────────────────────────────────────────────────
const TARGET_USER_ID = 'EnBuzutzldhTJdMCSf5dH2ZTzSi2';
const LEGACY_USER_ID = 'user_default'; // The userId used in legacy collections (see backend/src/lib/constants.ts)
const BATCH_LIMIT = 499; // Firestore batch limit is 500 ops; leave 1 margin

// ─── Firebase Init ───────────────────────────────────────────────────────────
/**
 * Initialize firebase-admin and return a Firestore instance.
 * Mirrors the backend's firebase.module.ts initialization pattern:
 *   - GOOGLE_CLOUD_PROJECT env var for the project ID
 *   - FIRESTORE_DB env var for named databases (defaults to '(default)')
 *   - FIRESTORE_EMULATOR_HOST for emulator targeting
 *   - FIREBASE_SERVICE_ACCOUNT_KEY for service account auth
 *   - Falls back to Application Default Credentials
 */
function initFirebase(): admin.firestore.Firestore {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT || 'aisrs-japanese-dev';
  const dbName = process.env.FIRESTORE_DB || 'aisrs-japanese-dev';

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    console.log(
      `🔧 Connecting to Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`,
    );
    admin.initializeApp({ projectId });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    console.log('🔑 Connecting to Cloud Firestore with Service Account Key');
    try {
      const serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (error) {
      console.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_KEY:', error);
      process.exit(1);
    }
  } else {
    console.log(
      '🔑 Connecting to Cloud Firestore with Application Default Credentials',
    );
    admin.initializeApp({ projectId });
  }

  console.log(`   Project: ${projectId}, Database: ${dbName}`);

  const { getFirestore } = require('firebase-admin/firestore');
  const db = getFirestore(admin.app(), dbName);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

// ─── Batch Helper ────────────────────────────────────────────────────────────
/**
 * Manages Firestore WriteBatch operations with automatic chunking.
 * Commits the current batch and starts a new one when the operation
 * count reaches BATCH_LIMIT.
 */
class BatchWriter {
  private db: admin.firestore.Firestore;
  private batch: admin.firestore.WriteBatch;
  private opCount = 0;
  private totalOps = 0;
  private batchNumber = 1;

  constructor(db: admin.firestore.Firestore) {
    this.db = db;
    this.batch = db.batch();
  }

  /**
   * Queue a set() operation. Auto-commits when the batch is full.
   */
  async set(
    docRef: admin.firestore.DocumentReference,
    data: Record<string, any>,
  ): Promise<void> {
    this.batch.set(docRef, data);
    this.opCount++;
    this.totalOps++;

    if (this.opCount >= BATCH_LIMIT) {
      await this.commit();
    }
  }

  /**
   * Commit any remaining operations in the current batch.
   */
  async commit(): Promise<void> {
    if (this.opCount === 0) return;
    await this.batch.commit();
    console.log(
      `   📦 Batch #${this.batchNumber} committed (${this.opCount} operations)`,
    );
    this.batchNumber++;
    this.opCount = 0;
    this.batch = this.db.batch();
  }

  get totalOperations(): number {
    return this.totalOps;
  }
}

// ─── Migration Functions ─────────────────────────────────────────────────────

/**
 * 1. Root User Document
 * Read: user-stats/default-user
 * Write: users/default-user (UserRoot)
 */
async function migrateUserRoot(db: admin.firestore.Firestore): Promise<void> {
  console.log('\n━━━ 1/6: Migrating UserRoot ━━━');

  const legacyRef = db.collection('user-stats').doc(LEGACY_USER_ID);
  const legacyDoc = await legacyRef.get();

  // Build default stats — will be overridden by legacy data if it exists
  const defaultStats = {
    reviewForecast: {},
    hourlyForecast: {},
    currentStreak: 0,
    lastReviewDate: admin.firestore.Timestamp.now(),
    totalReviews: 0,
    passedReviews: 0,
    levelProgress: {
      n5: { total: 0, mastered: 0 },
      n4: { total: 0, mastered: 0 },
    },
  };

  let statsData = { ...defaultStats };

  if (legacyDoc.exists) {
    const data = legacyDoc.data()!;
    console.log(`   ✔ Found legacy user-stats for '${LEGACY_USER_ID}'`);
    // Strip ID/userId fields — they move to the document path
    const { userId, id, ...rest } = data;
    statsData = { ...defaultStats, ...rest };
  } else {
    console.log(
      `   ⚠ No legacy user-stats found for '${LEGACY_USER_ID}'. Using defaults.`,
    );
  }

  const userRoot = {
    id: TARGET_USER_ID,
    stats: statsData,
    tutorContext: {
      frontierVocab: [],
      leechVocab: [],
      currentCurriculumNode: 'Foundation',
      allowedGrammar: [],
      weakGrammarPoints: [],
      communicationStyle: 'balanced',
      semanticWeaknesses: [],
      suggestedThemes: [],
    },
  };

  await db.collection('users').doc(TARGET_USER_ID).set(userRoot);
  console.log(`   ✅ Created users/${TARGET_USER_ID}`);
}

/**
 * 2. Knowledge Units
 * Read: knowledge-units
 * Write: global-knowledge-units/{id} (GlobalKnowledgeUnit)
 * Write: users/default-user/user-kus/{id} (UserKnowledgeUnit)
 */
async function migrateKnowledgeUnits(
  db: admin.firestore.Firestore,
): Promise<void> {
  console.log('\n━━━ 2/6: Migrating Knowledge Units ━━━');

  const snapshot = await db.collection('knowledge-units').get();
  console.log(`   📖 Found ${snapshot.size} legacy knowledge-units`);

  if (snapshot.empty) return;

  const writer = new BatchWriter(db);

  for (const doc of snapshot.docs) {
    const legacy = doc.data();
    const kuId = doc.id;

    // GlobalKnowledgeUnit — content-only, no user state
    const globalKU = {
      id: kuId,
      type: legacy.type,
      content: legacy.content,
      data: legacy.data ?? {},
      relatedUnits: legacy.relatedUnits ?? [],
    };

    // UserKnowledgeUnit — user state only, bridges via kuId
    const userKU = {
      id: kuId,
      userId: TARGET_USER_ID,
      kuId: kuId,
      personalNotes: legacy.personalNotes ?? '',
      userNotes: legacy.userNotes ?? undefined,
      createdAt: legacy.createdAt ?? admin.firestore.Timestamp.now(),
      status: legacy.status ?? 'learning',
      facet_count: legacy.facet_count ?? 0,
      history: legacy.history ?? [],
    };

    // Remove undefined fields (Firestore doesn't accept undefined)
    if (userKU.userNotes === undefined) delete (userKU as any).userNotes;

    await writer.set(db.collection('global-knowledge-units').doc(kuId), globalKU);
    await writer.set(
      db
        .collection('users')
        .doc(TARGET_USER_ID)
        .collection('user-kus')
        .doc(kuId),
      userKU,
    );
  }

  await writer.commit();
  console.log(
    `   ✅ Knowledge Units migration complete (${writer.totalOperations} ops)`,
  );
}

/**
 * 3. Scenarios
 * Read: scenarios
 * Write: scenario-templates/{id} (ScenarioTemplate)
 * Write: users/default-user/scenario-sessions/{id} (ScenarioSession)
 */
async function migrateScenarios(
  db: admin.firestore.Firestore,
): Promise<void> {
  console.log('\n━━━ 3/6: Migrating Scenarios ━━━');

  const snapshot = await db.collection('scenarios').get();
  console.log(`   📖 Found ${snapshot.size} legacy scenarios`);

  if (snapshot.empty) return;

  const writer = new BatchWriter(db);

  for (const doc of snapshot.docs) {
    const legacy = doc.data();
    const templateId = doc.id;

    // ScenarioTemplate — reusable content, no user state
    const template = {
      id: templateId,
      title: legacy.title,
      description: legacy.description,
      difficultyLevel: legacy.difficultyLevel,
      setting: legacy.setting,
      dialogue: legacy.dialogue ?? [],
      extractedKUs: legacy.extractedKUs ?? [],
      grammarNotes: legacy.grammarNotes ?? [],
      ...(legacy.roles ? { roles: legacy.roles } : {}),
    };

    // ScenarioSession — user-specific state, bridges via templateId
    const session: Record<string, any> = {
      id: templateId,
      userId: TARGET_USER_ID,
      templateId: templateId,
      state: legacy.state ?? 'encounter',
      chatHistory: legacy.chatHistory ?? [],
      isObjectiveMet: legacy.isObjectiveMet ?? false,
      createdAt: legacy.createdAt ?? admin.firestore.Timestamp.now(),
      pastAttempts: legacy.pastAttempts ?? [],
    };

    // Only include optional fields if they have values
    if (legacy.evaluation) session.evaluation = legacy.evaluation;
    if (legacy.completedAt) session.completedAt = legacy.completedAt;

    await writer.set(
      db.collection('scenario-templates').doc(templateId),
      template,
    );
    await writer.set(
      db
        .collection('users')
        .doc(TARGET_USER_ID)
        .collection('scenario-sessions')
        .doc(templateId),
      session,
    );
  }

  await writer.commit();
  console.log(
    `   ✅ Scenarios migration complete (${writer.totalOperations} ops)`,
  );
}

/**
 * 4. Questions
 * Read: questions
 * Write: global-questions/{id} (GlobalQuestion)
 * Write: users/default-user/question-states/{id} (UserQuestionState)
 */
async function migrateQuestions(
  db: admin.firestore.Firestore,
): Promise<void> {
  console.log('\n━━━ 4/6: Migrating Questions ━━━');

  const snapshot = await db.collection('questions').get();
  console.log(`   📖 Found ${snapshot.size} legacy questions`);

  if (snapshot.empty) return;

  const writer = new BatchWriter(db);

  for (const doc of snapshot.docs) {
    const legacy = doc.data();
    const qId = doc.id;

    // GlobalQuestion — content only
    const globalQ = {
      id: qId,
      kuId: legacy.kuId,
      data: legacy.data,
      createdAt: legacy.createdAt ?? admin.firestore.Timestamp.now(),
    };

    // UserQuestionState — user state, bridges via questionId
    const userQ: Record<string, any> = {
      userId: TARGET_USER_ID,
      questionId: qId,
      status: legacy.status ?? 'active',
      previousAnswers: legacy.previousAnswers ?? [],
    };

    if (legacy.lastUsed) userQ.lastUsed = legacy.lastUsed;

    await writer.set(db.collection('global-questions').doc(qId), globalQ);
    await writer.set(
      db
        .collection('users')
        .doc(TARGET_USER_ID)
        .collection('question-states')
        .doc(qId),
      userQ,
    );
  }

  await writer.commit();
  console.log(
    `   ✅ Questions migration complete (${writer.totalOperations} ops)`,
  );
}

/**
 * 5. Lessons
 * Read: lessons
 * Write: global-lessons/{id} (GlobalVocabLesson | GlobalKanjiLesson)
 * Write: users/default-user/user-lessons/{id} (UserLessonData)
 */
async function migrateLessons(
  db: admin.firestore.Firestore,
): Promise<void> {
  console.log('\n━━━ 5/6: Migrating Lessons ━━━');

  const snapshot = await db.collection('lessons').get();
  console.log(`   📖 Found ${snapshot.size} legacy lessons`);

  if (snapshot.empty) return;

  const writer = new BatchWriter(db);

  for (const doc of snapshot.docs) {
    const legacy = doc.data();
    // IMPORTANT: Legacy lessons use kuId as the document ID (see lessons.service.ts line 36)
    // So doc.id IS the kuId, NOT a unique lesson identifier.
    const kuId = doc.id;

    let globalLesson: Record<string, any>;

    if (legacy.type === 'Vocab') {
      // GlobalVocabLesson
      globalLesson = {
        type: 'Vocab',
        vocab: legacy.vocab,
        reading: legacy.reading,
        definitions: legacy.definitions ?? [],
        ...(legacy.definition ? { definition: legacy.definition } : {}),
        partOfSpeech: legacy.partOfSpeech,
        meaning_explanation: legacy.meaning_explanation,
        reading_explanation: legacy.reading_explanation,
        context_examples: legacy.context_examples ?? [],
        component_kanji: legacy.component_kanji ?? [],
      };
    } else if (legacy.type === 'Kanji') {
      // GlobalKanjiLesson
      globalLesson = {
        type: 'Kanji',
        kanji: legacy.kanji,
        meaning: legacy.meaning,
        onyomi: legacy.onyomi ?? [],
        kunyomi: legacy.kunyomi ?? [],
        strokeCount: legacy.strokeCount ?? 0,
        strokeImages: legacy.strokeImages ?? [],
        ...(legacy.radical ? { radical: legacy.radical } : {}),
        ...(legacy.references ? { references: legacy.references } : {}),
        mnemonic_meaning: legacy.mnemonic_meaning ?? '',
        mnemonic_reading: legacy.mnemonic_reading ?? '',
        relatedVocab: legacy.relatedVocab ?? [],
      };
    } else {
      // Edge case: malformed legacy data
      console.log(
        `   ⚠ Lesson '${kuId}' has unexpected type '${legacy.type}'. Copying raw data.`,
      );
      // Strip user-specific fields, keep everything else
      const { userId, personalMnemonic, kuId: _kuId, ...rest } = legacy;
      globalLesson = rest;
    }

    // Create the global lesson with a NEW auto-generated ID
    const globalLessonRef = db.collection('global-lessons').doc();
    const newLessonId = globalLessonRef.id;

    // UserLessonData — bridges global lesson to the KU
    const userLesson = {
      lessonId: newLessonId, // Points to the new global-lessons document
      userId: TARGET_USER_ID,
      kuId: kuId, // Points to the knowledge unit (= legacy doc.id)
      personalMnemonic: legacy.personalMnemonic ?? '',
    };

    await writer.set(globalLessonRef, globalLesson);
    await writer.set(
      db
        .collection('users')
        .doc(TARGET_USER_ID)
        .collection('user-lessons')
        .doc(newLessonId),
      userLesson,
    );
  }

  await writer.commit();
  console.log(
    `   ✅ Lessons migration complete (${writer.totalOperations} ops)`,
  );
}

/**
 * 6. Review Facets
 * Read: review-facets (filtered to userId === 'default-user')
 * Write: users/default-user/review-facets/{id} (direct copy)
 */
async function migrateReviewFacets(
  db: admin.firestore.Firestore,
): Promise<void> {
  console.log('\n━━━ 6/6: Migrating Review Facets ━━━');

  const snapshot = await db.collection('review-facets').get();
  console.log(`   📖 Found ${snapshot.size} total legacy review-facets`);

  if (snapshot.empty) return;

  const writer = new BatchWriter(db);
  let matchedCount = 0;
  let skippedCount = 0;

  for (const doc of snapshot.docs) {
    const facet = doc.data();

    // Only migrate facets belonging to the legacy user
    // Legacy data uses 'user_default', not 'default-user'
    if (facet.userId && facet.userId !== LEGACY_USER_ID && facet.userId !== TARGET_USER_ID) {
      skippedCount++;
      continue;
    }

    matchedCount++;
    const facetId = doc.id;

    // Direct copy — include original id in the document data
    await writer.set(
      db
        .collection('users')
        .doc(TARGET_USER_ID)
        .collection('review-facets')
        .doc(facetId),
      { ...facet, id: facetId },
    );
  }

  await writer.commit();
  console.log(
    `   ✅ Review Facets migration complete: ${matchedCount} migrated, ${skippedCount} skipped (${writer.totalOperations} ops)`,
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function runMigration(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  V2 STRICT MULTI-TENANT ARCHITECTURE MIGRATION          ║');
  console.log('║  Mode: NON-DESTRUCTIVE (read-only on legacy data)       ║');
  console.log(`║  Target User: ${TARGET_USER_ID.padEnd(41)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  try {
    const db = initFirebase();

    const startTime = Date.now();

    await migrateUserRoot(db);
    await migrateKnowledgeUnits(db);
    await migrateScenarios(db);
    await migrateQuestions(db);
    await migrateLessons(db);
    await migrateReviewFacets(db);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log(`║  ✅ MIGRATION COMPLETED SUCCESSFULLY in ${elapsed}s`.padEnd(59) + '║');
    console.log('╚══════════════════════════════════════════════════════════╝');
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error);
    process.exit(1);
  }
}

runMigration();
