import { VocabLesson, KanjiLesson } from "@/types";

/**
 * Extracts the content of a markdown section by its header.
 * @param markdown The raw markdown string.
 * @param header The header without hashes (e.g., "Meaning").
 * @returns The content of the section, or empty string if not found.
 */
function extractSection(markdown: string, header: string): string {
    // Regex looks for:
    // ^#+\s*header\s*$  (The header line, allowing # or ## or ###)
    // ([\s\S]*?)        (The content, non-greedy)
    // (?=(^#+\s)|(?![\s\S]))    (Lookahead for next header or end of string)
    const regex = new RegExp(`^#+\\s*${header}\\s*$\\n([\\s\\S]*?)(?=(^#+\\s)|(?![\\s\\S]))`, "im");
    const match = markdown.match(regex);
    return match ? match[1].trim() : "";
}

/**
 * Parses context examples from a markdown list.
 * list format:
 * - **Japanese**: [Sentence]
 * - **English**: [Translation]
 * OR
 * - [Sentence]
 *   [Translation]
 */
function parseContextExamples(markdown: string): { sentence: string; translation: string }[] {
    const examples: { sentence: string; translation: string }[] = [];
    const section = extractSection(markdown, "Context Examples");

    if (!section) return examples;

    // Split by bullet points
    const items = section.split(/^-\s+/m).filter(item => item.trim());

    for (const item of items) {
        // Attempt to split by newline or specific markers
        const lines = item.trim().split('\n');
        let sentence = "";
        let translation = "";

        if (lines.length >= 2) {
            sentence = lines[0].replace(/\*\*(Japanese|Sentence)\*\*:\s*/i, "").trim();
            translation = lines[1].replace(/\*\*(English|Translation)\*\*:\s*/i, "").trim();
        } else if (lines.length === 1) {
            // Try to split on some delimiter if on one line? Unlikely but possible.
            // For now, assume it failed or is just a sentence.
            sentence = lines[0].trim();
        }

        if (sentence) {
            examples.push({ sentence, translation });
        }
    }
    return examples;
}


/**
 * Parses component kanji from a markdown list.
 * Format:
 * - [Kanji]: [Reading] - [Meaning]
 * e.g., - 食: ショク - eat
 */
function parseComponentKanji(markdown: string): VocabLesson['component_kanji'] {
    const components: VocabLesson['component_kanji'] = [];
    const section = extractSection(markdown, "Component Kanji");
    if (!section) return components;

    const items = section.split(/^-\s+/m).filter(item => item.trim());

    for (const item of items) {
        // Simple parser: Kanji: Reading - Meaning
        // Regex: ^(.)\s*:\s*(.*?)\s*-\s*(.*)$
        const match = item.match(/^(.+?)\s*[:：]\s*(.*?)\s*[-–]\s*(.*)$/);

        if (match) {
            components.push({
                kanji: match[1].trim(),
                reading: match[2].trim(),
                meaning: match[3].trim(),
            });
        }
    }

    return components;
}

/**
 * Parses a markdown string into a partial VocabLesson object.
 * Note: Some fields like 'vocab', 'partOfSpeech' might need to be passed in from metadata if not in body.
 */
export function parseVocabLessonBody(markdown: string): Partial<VocabLesson> {
    const meaning = extractSection(markdown, "Meaning");
    const reading = extractSection(markdown, "Reading");
    const definitionsText = extractSection(markdown, "Reference") || extractSection(markdown, "Definitions"); // "Reference" is sometimes used for definitions in older content? Or maybe "Definitions"

    // Parse definitions list
    const definitions = definitionsText.split(/^-\s+/m)
        .map(d => d.trim())
        .filter(Boolean);

    const contextExamples = parseContextExamples(markdown);
    const componentKanji = parseComponentKanji(markdown);

    return {
        type: "Vocab", // Assumed
        meaning_explanation: meaning,
        reading_explanation: reading,
        definitions: definitions,
        context_examples: contextExamples,
        component_kanji: componentKanji,
    };
}

/**
 * Parses a markdown string into a partial KanjiLesson object.
 */
export function parseKanjiLessonBody(markdown: string): Partial<KanjiLesson> {
    const meaning = extractSection(markdown, "Meaning");
    const meaningMnemonic = extractSection(markdown, "Meaning Mnemonic");
    const readingMnemonic = extractSection(markdown, "Reading Mnemonic");

    // Readings
    const readingsSection = extractSection(markdown, "Readings");
    const onyomi = extractSection(readingsSection, "On'yomi.*") // Subsection regex?
        .split(/[,、\s]+/)
        .filter(Boolean);

    // Needs more robust parsing for nested sections if they exist in markdown structure.
    // Assuming flat structure for now or simple lists.

    return {
        type: "Kanji",
        meaning: meaning,
        mnemonic_meaning: meaningMnemonic,
        mnemonic_reading: readingMnemonic,
        personalMnemonic: meaningMnemonic, // Map either/or
        // onyomi/kunyomi parsing would go here if structure allows
    };
}
