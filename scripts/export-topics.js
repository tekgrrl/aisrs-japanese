const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// --- CONFIGURATION ---
// Point to your service account key if using production Firestore
// const serviceAccount = require('../service-account-key.json');

// Initialize Firebase Admin
// If using Emulator, no credential needed if FIRESTORE_EMULATOR_HOST is set.
// If using Prod, uncomment credential line.
admin.initializeApp({
  projectId: "aisrs-japanese-dev", // REPLACE THIS
  // credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const CONTENT_DIR = path.join(__dirname, "../content/topics");

console.info(CONTENT_DIR);

// Ensure directories exist
["vocab", "grammar", "kanji", "concept"].forEach((type) => {
  const dir = path.join(CONTENT_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function exportTopics() {
  console.log("Fetching Knowledge Units...");
  const snapshot = await db.collection("knowledge-units").get(); // Check your actual collection name

  if (snapshot.empty) {
    console.log("No KUs found.");
    return;
  }

  let count = 0;

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.info(data);

    // 1. Generate Natural Key (ID)
    // Using the content + type pattern (e.g., "普通どおり-vocab")
    // Japanese characters are preserved, type is lowercased.
    const typeSlug = (data.type || "vocab").toLowerCase();
    const id = `${data.content}-${typeSlug}`.toLowerCase();

    // 2. Construct the YAML Object
    // We flatten the nested 'data' object here as agreed
    const frontMatter = {
      id: id,
      type: data.type || "Vocab",
      content: data.content,

      // Flattened optional fields
      reading: data.data?.reading || undefined,
      definition: data.data?.definition || undefined,
      partOfSpeech: data.data?.partOfSpeech || undefined,
      conjugationType: data.data?.conjugationType || undefined,

      // Config
      kanjiFormat: "obsidian",

      // Relationships (Static)
      relatedUnits: data.relatedUnits || [],

      // Resources (Empty placeholders for now, populated later)
      contextualSentences: [],
      components: [],
    };

    // 3. Create File Content
    // Use js-yaml to safely dump the object, then wrap in ---
    const yamlBlock = yaml.dump(frontMatter, {
      lineWidth: -1, // Don't fold long lines
      noRefs: true, // Don't use YAML aliases
    });

    const fileContent = `---\n${yamlBlock}---\n\n## Meaning\n\n## Reading\n`;

    // 4. Write File
    // Filename: same as ID
    const filename = `${id}.md`;
    const filePath = path.join(CONTENT_DIR, typeSlug, filename);

    fs.writeFileSync(filePath, fileContent);
    console.log(`Exported: ${filename}`);
    count++;
  });

  console.log(`\nDone. Exported ${count} topics.`);
}

exportTopics().catch(console.error);
