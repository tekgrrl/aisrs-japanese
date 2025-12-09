const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const yaml = require("js-yaml");

const LESSONS_DIR = path.join(__dirname, "../content/lessons");
const OUTPUT_DIR = path.join(__dirname, "../content/contextExamples");

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function scanLessons(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });

  files.forEach((file) => {
    const fullPath = path.join(dir, file.name);

    if (file.isDirectory()) {
      scanLessons(fullPath);
    } else if (file.isFile() && file.name.endsWith(".md")) {
      processLessonFile(fullPath);
    }
  });
}

function processLessonFile(filePath) {
  const fileContent = fs.readFileSync(filePath, "utf8");
  const { data } = matter(fileContent);

  if (
    !data.context_examples ||
    !Array.isArray(data.context_examples) ||
    data.context_examples.length === 0
  ) {
    return;
  }

  console.log(`Processing lesson: ${data.id}`);
  console.log(`data = ${JSON.stringify(data)}`);

  data.context_examples.forEach((ex, index) => {
    // 1. Generate ID: {content}-ce{01}
    // Pad index to 2 digits
    const indexStr = String(index + 1).padStart(2, "0");
    const sentenceId = `${data.content}-ce${indexStr}`; // Uses 'content' (e.g. 普通どおり) not the full ID

    // 2. Construct Front Matter
    const frontMatter = {
      id: sentenceId,
      type: "sentence",
      title: `${data.content} example`,
      translation: ex.translation,
      content: ex.sentence,
      contextualFor: [data.topicId], // Link back to the topic
      kanjiFormat: "obsidian",
      tags: [],
    };

    // 3. Construct Body
    const body = `
## Sentence
${ex.sentence}

## Translation
${ex.translation}
`;

    // 4. Write File
    const yamlBlock = yaml.dump(frontMatter, {
      lineWidth: -1,
      noRefs: true,
      flowLevel: 1, // Keeps arrays on one line
    });

    const outputContent = `---\n${yamlBlock}---\n${body}`;
    const content = data.content ? data.content.replace(/^〜/, '') : "thing";
    const outputFilename = `${content}-example-${indexStr}.md`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    // Check collision to avoid overwriting if running multiple times
    if (!fs.existsSync(outputPath)) {
      fs.writeFileSync(outputPath, outputContent);
      console.log(`  -> Created: ${outputFilename}`);
    } else {
      console.log(`  -> Skipped (Exists): ${outputFilename}`);
    }
  });
}

console.log("Starting extraction...");
scanLessons(LESSONS_DIR);
console.log("Done.");
