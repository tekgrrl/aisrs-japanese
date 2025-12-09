const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// --- CONFIGURATION ---
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "aisrs-japanese-dev",
  });
}

const db = admin.firestore();
const OUTPUT_DIR = path.join(__dirname, "../content/questions");

// Ensure directories exist
["vocab", "grammar", "kanji", "concept"].forEach((type) => {
  const dir = path.join(OUTPUT_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function exportQuestions() {
  console.log("Fetching Questions...");
  // Adjust collection name based on where you actually stored them
  // (e.g., 'generated_questions' or 'questions')
  const snapshot = await db.collection("questions").get();

  if (snapshot.empty) {
    console.log("No Questions found.");
    return;
  }

  // Group by Topic to generate sequential IDs (topic-q01, topic-q02)
  const questionsByTopic = {};

  const docs = snapshot.docs;

  for (const doc of docs) {
    const data = doc.data();
    const kuId = data.kuId;
    
    // Now the loop will actually pause here until this resolves
    const kuSnapshot = await db.collection("knowledge-units").doc(kuId).get();
    const topic = kuSnapshot.data()?.content || "unknown"; // Added safety check ?.

    if (!questionsByTopic[topic]) {
      questionsByTopic[topic] = [];
    }
    questionsByTopic[topic].push(data);
  }

  let count = 0;

  for (const [topic, questions] of Object.entries(questionsByTopic)) {
    const typeSlug = "vocab"; // Defaulting to vocab, logic could be added to detect grammar
    const topicSlug = topic.toLowerCase(); // Ensure matches Topic ID convention

    questions.forEach((q, index) => {
      // 1. Generate ID: {topic}-q{01}
      const indexStr = String(index + 1).padStart(2, "0");
      const questionId = `${topicSlug}-q${indexStr}`;

      // 2. Construct Front Matter
      const frontMatter = {
        id: questionId,
        topicId: `${topicSlug}-vocab`, // Linking back to Topic ID convention
        type: "FillInBlank",
        difficulty: q.difficulty || "N4", // Default if missing

        // Grading
        answer: q.answer,
        acceptedAlternatives: q.accepted_alternatives || [], // Snake_case in DB -> Camel in YAML

        // Display Hint
        context: q.context || undefined, // Only include if exists

        // Config
        kanjiFormat: "obsidian",
      };

      // 3. Body is JUST the Japanese question text
      const body = q.question;

      // 4. Write File
      const yamlBlock = yaml.dump(frontMatter, {
        lineWidth: -1,
        noRefs: true,
        flowLevel: 1,
      });

      const fileContent = `---\n${yamlBlock}---\n${body}\n`;

      // Sanitize filename just in case
      const filename = `${questionId}.md`;
      const filePath = path.join(OUTPUT_DIR, typeSlug, filename);

      fs.writeFileSync(filePath, fileContent);
      console.log(`  -> Created: ${filename}`);
      count++;
    });
  }

  console.log(`\nDone. Exported ${count} questions.`);
}

exportQuestions().catch(console.error);
