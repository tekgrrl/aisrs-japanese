const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// --- CONFIGURATION ---
// const serviceAccount = require('../service-account-key.json');

// Initialize Firebase Admin
// Assumes FIRESTORE_EMULATOR_HOST is set if testing locally
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "aisrs-japanese-dev", // Replace with your actual project ID
    // credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const CONTENT_DIR = path.join(__dirname, "../content/lessons");

// Ensure directories exist
["vocab", "grammar", "kanji", "concept"].forEach((type) => {
  const dir = path.join(CONTENT_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function exportLessons() {
  console.log("Fetching Lessons...");
  // Adjust collection name if yours is different (e.g. 'lessons' or subcollection)
  const snapshot = await db.collection("lessons").get();

  if (snapshot.empty) {
    console.log("No Lessons found.");
    return;
  }

  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.info(JSON.stringify(data));

    // 1. Reconstruct Topic ID (The Link)
    // Must match the logic in export-topics.js: content + type slug
    const typeSlug = (data.type || "vocab").toLowerCase();
    const topicId = `${data.vocab}-${typeSlug}`.toLowerCase();

    // 2. Generate Lesson ID
    // Standardizing on {content}-lesson-1 for the initial migration
    const lessonId = `${data.vocab}-l01`.toLowerCase();

    // 3. Prepare Front Matter
    const frontMatter = {
      id: lessonId,
      topicId: topicId,
      content: data.vocab,
      type: data.type || "Vocab",
      title: `${data.vocab} Lesson 1`, // Default title

      // --- Structured Resources ---
      // Storing these as raw arrays in YAML for now.
      // You can write a separate script to explode these into
      // /content/contextExamples/*.md files later.
      context_examples: data.context_examples || [],
      component_kanji: data.component_kanji || [],

      // Kanji specific arrays
      radicals: data.radicals || [],
      readings_onyomi: data.reading_onyomi || [],
      readings_kunyomi: data.reading_kunyomi || [],

      // Metadata
      generatedAt: new Date().toISOString(),
      kanjiFormat: "obsidian",
    };

    // 4. Construct Markdown Body
    let markdownBody = "";

    if (typeSlug === "vocab") {
      if (data.meaning_explanation) {
        markdownBody += `## Meaning\n\n${data.meaning_explanation}\n\n`;
      }
      if (data.reading_explanation) {
        markdownBody += `## Reading\n\n${data.reading_explanation}\n\n`;
      }
      // Check for usage notes if you added them previously
      if (data.usage_notes) {
        markdownBody += `## Usage Notes\n\n${data.usage_notes}\n\n`;
      }
    } else if (typeSlug === "kanji") {
      if (data.meaning) {
        markdownBody += `## Meaning\n\n${data.meaning}\n\n`;
      }
      if (data.mnemonic_meaning) {
        markdownBody += `## Meaning Mnemonic\n\n${data.mnemonic_meaning}\n\n`;
      }
      if (data.mnemonic_reading) {
        markdownBody += `## Reading Mnemonic\n\n${data.mnemonic_reading}\n\n`;
      }
    }

    // 5. Serialize and Write
    const yamlBlock = yaml.dump(frontMatter, {
      lineWidth: -1,
      noRefs: true,
    });

    const fileContent = `---\n${yamlBlock}---\n\n${markdownBody}`;

    const filename = `${data.vocab}-lesson-1.md`;
    const filePath = path.join(CONTENT_DIR, typeSlug, filename);

    fs.writeFileSync(filePath, fileContent);
    console.log(`Exported: ${filename}`);
    count++;
  });

  console.log(`\nDone. Exported ${count} lessons.`);
}

exportLessons().catch(console.error);
