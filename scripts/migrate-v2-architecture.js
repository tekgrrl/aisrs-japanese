const admin = require('firebase-admin');

const TARGET_USER_ID = 'default-user';

if (!admin.apps || !admin.apps.length) {
    admin.initializeApp({ projectId: "aisrs-japanese-dev" });
}

// Ensure the Admin SDK maps to the emulator directly
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const db = admin.firestore();
db.settings({ preferRest: true }); 

async function migrateUserRoot() {
    console.log('\n--- Migrating UserRoot ---');
    const legacyStatsRef = db.collection('user-stats').doc(TARGET_USER_ID);
    const doc = await legacyStatsRef.get();
    
    let statsData = {
        reviewForecast: {},
        hourlyForecast: {},
        currentStreak: 0,
        lastReviewDate: admin.firestore.Timestamp.now(),
        totalReviews: 0,
        passedReviews: 0,
        levelProgress: { n5: { total: 0, mastered: 0 }, n4: { total: 0, mastered: 0 } }
    };

    if (doc.exists) {
        console.log(`Found legacy user-stats`);
        const data = doc.data();
        if (data) Object.assign(statsData, data);
        delete statsData.userId;
    } 

    const newUserRoot = {
        id: TARGET_USER_ID,
        stats: statsData,
        tutorContext: {
            frontierVocab: [], leechVocab: [], currentCurriculumNode: 'Foundation',
            allowedGrammar: [], weakGrammarPoints: [], communicationStyle: 'balanced',
            semanticWeaknesses: [], suggestedThemes: []
        }
    };

    await db.collection('users').doc(TARGET_USER_ID).set(newUserRoot);
    console.log(`Successfully migrated UserRoot`);
}

async function migrateKnowledgeUnits() {
    console.log('\n--- Migrating Knowledge Units ---');
    const snapshot = await db.collection('knowledge-units').get();
    
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const legacyKU = doc.data();
        const kuId = legacyKU.id || doc.id;
        
        batch.set(db.collection('global-knowledge-units').doc(kuId), {
            id: kuId, type: legacyKU.type, content: legacyKU.content,
            data: legacyKU.data, relatedUnits: legacyKU.relatedUnits || []
        });

        batch.set(db.collection(`users/${TARGET_USER_ID}/user-kus`).doc(kuId), {
            id: kuId, userId: TARGET_USER_ID, kuId: kuId,
            personalNotes: legacyKU.personalNotes || '', userNotes: legacyKU.userNotes,
            createdAt: legacyKU.createdAt || admin.firestore.Timestamp.now(),
            status: legacyKU.status || 'learning', facet_count: legacyKU.facet_count || 0,
            history: legacyKU.history || []
        });
        
        count += 2;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
}

async function migrateScenarios() {
    console.log('\n--- Migrating Scenarios ---');
    const snapshot = await db.collection('scenarios').get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const legacyScenario = doc.data();
        const templateId = legacyScenario.id || doc.id;

        batch.set(db.collection('scenario-templates').doc(templateId), {
            id: templateId, title: legacyScenario.title, description: legacyScenario.description,
            difficultyLevel: legacyScenario.difficultyLevel, setting: legacyScenario.setting,
            dialogue: legacyScenario.dialogue || [], extractedKUs: legacyScenario.extractedKUs || [],
            grammarNotes: legacyScenario.grammarNotes || [], roles: legacyScenario.roles
        });

        batch.set(db.collection(`users/${TARGET_USER_ID}/scenario-sessions`).doc(templateId), {
            id: templateId, userId: TARGET_USER_ID, templateId: templateId,
            state: legacyScenario.state || 'encounter', chatHistory: legacyScenario.chatHistory || [],
            isObjectiveMet: legacyScenario.isObjectiveMet || false, evaluation: legacyScenario.evaluation,
            createdAt: legacyScenario.createdAt || admin.firestore.Timestamp.now(),
            completedAt: legacyScenario.completedAt, pastAttempts: legacyScenario.pastAttempts || []
        });

        count += 2;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
}

async function migrateQuestions() {
    console.log('\n--- Migrating Questions ---');
    const snapshot = await db.collection('questions').get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const legacyQ = doc.data();
        const qId = legacyQ.id || doc.id;

        batch.set(db.collection('global-questions').doc(qId), {
            id: qId, kuId: legacyQ.kuId, data: legacyQ.data,
            createdAt: legacyQ.createdAt || admin.firestore.Timestamp.now()
        });

        batch.set(db.collection(`users/${TARGET_USER_ID}/question-states`).doc(qId), {
            userId: TARGET_USER_ID, questionId: qId, status: legacyQ.status || 'active',
            lastUsed: legacyQ.lastUsed, previousAnswers: legacyQ.previousAnswers || []
        });

        count += 2;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
}

async function migrateLessons() {
    console.log('\n--- Migrating Lessons ---');
    const snapshot = await db.collection('lessons').get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const legacyLesson = doc.data();
        const lessonId = legacyLesson.kuId || doc.id;

        let globalLesson = {};
        if (legacyLesson.type === 'Vocab') {
            globalLesson = {
                type: 'Vocab', vocab: legacyLesson.vocab, reading: legacyLesson.reading,
                definitions: legacyLesson.definitions || [], definition: legacyLesson.definition,
                partOfSpeech: legacyLesson.partOfSpeech, meaning_explanation: legacyLesson.meaning_explanation,
                reading_explanation: legacyLesson.reading_explanation, context_examples: legacyLesson.context_examples || [],
                component_kanji: legacyLesson.component_kanji || []
            };
        } else if (legacyLesson.type === 'Kanji') {
            globalLesson = {
                type: 'Kanji', kanji: legacyLesson.kanji, meaning: legacyLesson.meaning,
                onyomi: legacyLesson.onyomi || [], kunyomi: legacyLesson.kunyomi || [],
                strokeCount: legacyLesson.strokeCount, strokeImages: legacyLesson.strokeImages || [],
                radical: legacyLesson.radical, references: legacyLesson.references,
                mnemonic_meaning: legacyLesson.mnemonic_meaning, mnemonic_reading: legacyLesson.mnemonic_reading,
                relatedVocab: legacyLesson.relatedVocab || []
            };
        } else {
             globalLesson = Object.assign({}, legacyLesson);
        }

        batch.set(db.collection('global-lessons').doc(lessonId), globalLesson);
        batch.set(db.collection(`users/${TARGET_USER_ID}/user-lessons`).doc(lessonId), {
            lessonId: lessonId, userId: TARGET_USER_ID, kuId: legacyLesson.kuId || doc.id,
            personalMnemonic: legacyLesson.personalMnemonic || ''
        });

        count += 2;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
}

async function migrateReviewFacets() {
    console.log('\n--- Migrating Review Facets ---');
    const snapshot = await db.collection('review-facets').where('userId', '==', TARGET_USER_ID).get();
    let batch = db.batch();
    let count = 0;

    for (const doc of snapshot.docs) {
        const facet = doc.data();
        const facetId = facet.id || doc.id;
        batch.set(db.collection(`users/${TARGET_USER_ID}/review-facets`).doc(facetId), facet);

        count++;
        if (count >= 400) { await batch.commit(); batch = db.batch(); count = 0; }
    }
    if (count > 0) await batch.commit();
}

async function runAll() {
    try {
        console.log('STARTING V2 STRICT ARCHITECTURE MIGRATION (NON-DESTRUCTIVE)');
        await migrateUserRoot();
        await migrateKnowledgeUnits();
        await migrateScenarios();
        await migrateQuestions();
        await migrateLessons();
        await migrateReviewFacets();
        console.log('\n✅ MIGRATION COMPLETED SUCCESSFULLY');
        process.exit(0);
    } catch (e) {
        console.error('❌ MIGRATION FAILED:', e);
        process.exit(1);
    }
}

runAll();
