const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { getFirestore } = require("firebase-admin/firestore");

// --- CONFIGURATION ---
const PROJECT_ID = "gen-lang-client-0878434798";
const CURRENT_USER_ID = "user_default";

// Initialize Firebase Admin (Emulator or Prod)
admin.initializeApp({
  projectId: PROJECT_ID,
});

const db = getFirestore(admin.app(), "aisrs-japanese-dev");

// --- PATHS ---
const BASE_DIR = path.join(__dirname, "../content");
const TOPICS_VOCAB_DIR = path.join(BASE_DIR, "topics/vocab");
const LESSONS_VOCAB_DIR = path.join(BASE_DIR, "lessons/vocab");
const CONTEXT_EXAMPLES_DIR = path.join(BASE_DIR, "contextExamples");

// --- UTILS ---
function readMarkdownFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return matter(content);
  } catch (e) {
    console.error(`Error reading ${filePath}:`, e);
    return null;
  }
}

// --- MAIN LOGIC ---

async function importContent() {
  console.log("Starting Import Process...");
  console.log(`Target Project: ${PROJECT_ID}`);
  console.log(`User ID: ${CURRENT_USER_ID}`);

  // 1. Load Context Examples into Memory
  console.log("\n--- Phase 1: Loading Context Examples ---");
  const contextExamplesMap = new Map(); // topicId -> Set<stringifiedExample>

  if (fs.existsSync(CONTEXT_EXAMPLES_DIR)) {
    const files = fs.readdirSync(CONTEXT_EXAMPLES_DIR);
    let count = 0;
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const { data } = readMarkdownFile(path.join(CONTEXT_EXAMPLES_DIR, file));

      if (data.contextualFor && Array.isArray(data.contextualFor)) {
        data.contextualFor.forEach((topicId) => {
          if (!contextExamplesMap.has(topicId)) {
            contextExamplesMap.set(topicId, []);
          }
          const example = {
            sentence: data.content,
            translation: data.translation,
          };
          // Push raw object, we'll dedupe later during merge
          contextExamplesMap.get(topicId).push(example);
        });
        count++;
      }
    }
    console.log(`Loaded ${count} context example files.`);
  } else {
    console.log("No Context Examples directory found.");
  }

  // 2. Import Vocab KUs (Topics)
  console.log("\n--- Phase 2: Importing Vocab KUs ---");
  const topicDefinitionsMap = new Map(); // kuId -> definitions[]

  if (fs.existsSync(TOPICS_VOCAB_DIR)) {
    const files = fs.readdirSync(TOPICS_VOCAB_DIR);
    let successCount = 0;
    let failCount = 0;

    const batch = db.batch();
    let batchCount = 0;

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const { data: fm } = readMarkdownFile(path.join(TOPICS_VOCAB_DIR, file));
      if (!fm || !fm.id) {
        console.warn(`Skipping ${file}: Missing ID or FrontMatter`);
        failCount++;
        continue;
      }

      const kuId = fm.id;

      // Flatten definitions from Topic
      let definitions = [];
      if (Array.isArray(fm.data?.definitions)) {
        definitions = fm.data.definitions;
      } else if (fm.definition) {
        definitions = fm.definition.split(",").map((s) => s.trim());
      } else if (fm.data?.definition) {
        definitions = fm.data.definition.split(",").map((s) => s.trim());
      }

      if (definitions.length > 0) {
        topicDefinitionsMap.set(kuId, definitions);
      }

      // Map to Firestore Schema
      const kuData = {
        id: kuId,
        userId: CURRENT_USER_ID,
        type: "Vocab", // Assuming Vocab dir implies Vocab type
        content: fm.content,
        data: {
          reading: fm.reading || null,
          definition: fm.definition || null,
          partOfSpeech: fm.partOfSpeech || null,
          // Keep any other relevant data-specific fields if they exist in valid set
        },
        personalNotes: "",
        relatedUnits: fm.relatedUnits || [],
        status: "learning", // Defaulting to learning for imported items
        facet_count: 0,
        createdAt: admin.firestore.Timestamp.now(),
      };

      const docRef = db.collection("knowledge-units").doc(kuId);
      batch.set(docRef, kuData, { merge: true });
      batchCount++;
      successCount++;

      if (batchCount >= 400) {
        await batch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    console.log(`Processed ${successCount} Vocab KUs.`);
  } else {
    console.log("No Vocab Topics directory found.");
  }

  // 3. Import Vocab Lessons
  console.log("\n--- Phase 3: Importing Vocab Lessons ---");
  if (fs.existsSync(LESSONS_VOCAB_DIR)) {
    const files = fs.readdirSync(LESSONS_VOCAB_DIR);
    let successCount = 0;

    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const { data: fm, content: body } = readMarkdownFile(
        path.join(LESSONS_VOCAB_DIR, file)
      );

      if (!fm || !fm.topicId) {
        console.warn(`Skipping ${file}: Missing topicId`);
        continue;
      }

      const kuId = fm.topicId; // Mapping Topic ID to Lesson ID (which is kuId in lesson collection)

      // --- Parse Body for Explanations ---
      let meaningExplanation = "";
      let readingExplanation = "";

      if (body) {
        // Extract Meaning Explanation
        const meaningMatch = body.match(/## Meaning\s+([\s\S]*?)(?=\n##|$)/i);
        if (meaningMatch && meaningMatch[1]) {
          meaningExplanation = meaningMatch[1].trim();
        }

        // Extract Reading Explanation
        const readingMatch = body.match(/## Reading\s+([\s\S]*?)(?=\n##|$)/i);
        if (readingMatch && readingMatch[1]) {
          readingExplanation = readingMatch[1].trim();
        }
      }

      // Merge Context Examples
      const lessonExamples = fm.context_examples || [];
      const externalExamples = contextExamplesMap.get(kuId) || [];

      const combinedExamples = [...lessonExamples, ...externalExamples];

      // Deduplication based on sentence
      const uniqueExamples = [];
      const seenSentences = new Set();

      for (const ex of combinedExamples) {
        if (!ex.sentence) continue;
        const normalized = ex.sentence.trim();
        if (!seenSentences.has(normalized)) {
          seenSentences.add(normalized);
          uniqueExamples.push(ex);
        }
      }

      // Construct Lesson Object (VocabLesson)
      // Handle definitions: might be array 'definitions' or string 'definition' in FrontMatter
      let definitions = [];
      if (Array.isArray(fm.definitions)) {
        definitions = fm.definitions;
      } else if (typeof fm.definition === "string") {
        definitions = fm.definition.split(",").map((s) => s.trim());
      }

      // Fallback to Topic Definitions if missing in Lesson
      if (definitions.length === 0 && topicDefinitionsMap.has(kuId)) {
        definitions = topicDefinitionsMap.get(kuId);
      }

      const lessonData = {
        kuId: kuId,
        userId: CURRENT_USER_ID,
        type: "Vocab",
        vocab: fm.content || "Unknown", // Fallbacks
        definitions: definitions,

        partOfSpeech: fm.partOfSpeech || (fm.tags ? fm.tags[0] : null), // Heuristic if missing
        meaning_explanation: meaningExplanation,
        reading_explanation: readingExplanation,

        context_examples: uniqueExamples,
        component_kanji: fm.component_kanji || [],
      };

      const docRef = db.collection("lessons").doc(kuId);
      await docRef.set(lessonData, { merge: true });
      successCount++;
    }
    console.log(`Processed ${successCount} Vocab Lessons.`);
  }

  console.log("\nDone.");
}

importContent().catch(console.error);
