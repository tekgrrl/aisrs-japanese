import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { FIRESTORE_CONNECTION, LESSONS_COLLECTION, KNOWLEDGE_UNITS_COLLECTION } from '../firebase/firebase.module';
import { Firestore } from 'firebase-admin/firestore';
import { GeminiService } from '../gemini/gemini.service';
import { QuestionsService } from '../questions/questions.service';
import { KnowledgeUnit, Lesson } from '../types';
import { performance } from 'perf_hooks';
import { CURRENT_USER_ID } from '@/lib/constants';

@Injectable()
export class LessonsService {
    private readonly logger = new Logger(LessonsService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
        private readonly geminiService: GeminiService,
    ) { }

    async generateLesson(kuId: string) {

        // 1. Fetch the KU
        const kuRef = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(kuId);
        const kuDoc = await kuRef.get();
        if (!kuDoc.exists) {
            this.logger.error(`KnowledgeUnit ${kuId} not found`);
            return { error: "KnowledgeUnit not found" }; // TODO is this ok?
        }

        const ku = kuDoc.data() as KnowledgeUnit;

        const content = ku.content;

        const lessonDbRef = this.db.collection(LESSONS_COLLECTION).doc(kuId);

        // Check for lesson in 'lessons' collection
        const lessonDoc = await lessonDbRef.get();
        if (lessonDoc.exists) {
            this.logger.log(
                `Returning existing lesson for KU ${kuId} from lessons collection`,
            );
            return lessonDoc.data() as Lesson;
        }

        this.logger.log(`No existing lesson for KU ${kuId}. Generating new lesson`);
        // let jsonSchema: any;

        let userMessage: string;

        if (ku.type === "Kanji") {
            const KANJI_USER_PROMPT = `You are an expert Japanese tutor. You will be asked to generate a lesson for the Japanese Kanji: ${ku.content}.

The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji.

**Task 1: Detailed breakdown**
* Provide the **Meanings**, **On'yomi**, **Kun'yomi** readings.
* Identify the **Radical** (character, meaning).
* **Stroke Count**.

**Task 2: Mnemonics**
* Generate a **Meaning Mnemonic**.
* Generate a **Reading Mnemonic**.

**Task 3: Related Vocabulary**
* Provide 3-5 related vocabulary words (Content + Reading).

**Response Schema:**
You MUST return a valid JSON object matching this schema:
{
  "type": "Kanji",
  "kanji": "The Kanji character",
  "meaning": "Core meaning(s)",
  "onyomi": ["reading (katakana)"],
  "kunyomi": ["reading (hiragana)"],
  "strokeCount": 0,
  "strokeImages": [],
  "radical": {
    "character": "Radical char",
    "meaning": "Radical meaning",
    "image": "",
    "animation": []
  },
  "mnemonic_meaning": "Story...",
  "mnemonic_reading": "Story...",
  "relatedVocab": [
    { "id": "", "content": "Word", "reading": "Reading" }
  ]
}`;
            userMessage = KANJI_USER_PROMPT;
        } else {
            const VOCAB_USER_PROMPT = `You are an expert Japanese tutor. You will be asked to generate a lesson for the Japanese word: ${ku.content}.

The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji.

**Task 1: Metadata Extraction**
* Provide the standard **Kana Reading**.
* Provide a list of **Concise Definitions** (suitable for valid acceptable answers in a quiz).
* Identify the **Part of Speech**.
* Identify the **Conjugation Type** (if applicable).

**Task 2: Lesson Generation**
* Generate detailed explanations for meaning and reading.
* If a word is a "suru noun", include explanations of the meaning of the suru form.
* Generate context examples.
* Analyze component Kanji.
* Do not explain what "rendaku" means.

**Constraints:**
For the \`partOfSpeech\` property, select one of:
* noun, proper-noun, noun-suru, i-adjective, na-adjective, transitive-verb, intransitive-verb, adverb, counter, prefix, suffix, conjunction, particle

For the \`conjugation_type\` property, select one of (or null):
* godan, ichidan, irregular, suru, i-adjective, na-adjective, null

Do not explain the terms "kun'yomi" or "on'yomi", never use the term "sino-japanese"

**Response Schema:**
You MUST return a valid JSON object matching this schema:
{
  "type": "Vocab",
  "vocab": "The canonical Japanese word",
  "reading": "The canonical kana reading (e.g. ぜったい)",
  "definitions": ["definition 1", "definition 2"],
  "partOfSpeech": "The selected part of speech string",
  "conjugation_type": "The selected conjugation type or null",
  
  "meaning_explanation": "A detailed explanation of the word's meaning and nuance.",
  "reading_explanation": "An explanation of the reading (e.g., nuance, rendaku).",
  
  "context_examples": [
    { "sentence": "Japanese sentence with Furigana in brackets e.g. 明日[あした]", "translation": "English translation." }
  ],
  "component_kanji": [
    { 
      "kanji": "Single Kanji", 
      "reading": "Reading in this word", 
      "meaning": "Core meaning",
      "onyomi": ["on1"],
      "kunyomi": ["kun1"]
    }
  ]
}`;
            userMessage = VOCAB_USER_PROMPT;
        }

        const lessonString = await this.geminiService.generateLesson(
            userMessage,
            { content, kuId }
        );

        if (!lessonString) {
            this.logger.error("AI response was empty.");
            throw new Error("AI response was empty.");
        }

        let lessonJson: Lesson | undefined;

        try {
            lessonJson = JSON.parse(lessonString) as Lesson;
            lessonJson.kuId = kuId;
            (lessonJson as any).userId = CURRENT_USER_ID;

            // --- MERGE USER DEFINITIONS (if Vocab) ---
            // Rely on the KnowledgeUnit type, which is the source of truth
            if (ku.type === "Vocab") {
                const userDefinitions = ku.data.definition
                    ? ku.data.definition.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
                    : [];

                // Ensure definitions array exists
                if (!Array.isArray((lessonJson as any).definitions)) {
                    (lessonJson as any).definitions = [];
                }

                const aiDefinitions = (lessonJson as any).definitions || [];

                // Deduplicate (case-insensitive)
                const combined = [...userDefinitions, ...aiDefinitions];
                const uniqueDefinitions = combined.reduce<string[]>((acc, curr) => {
                    if (!acc.some(d => d.toLowerCase() === curr.toLowerCase())) {
                        acc.push(curr);
                    }
                    return acc;
                }, []);

                (lessonJson as any).definitions = uniqueDefinitions;

                // Backward compatibility for definition field
                if ((lessonJson as any).definitions.length > 0) {
                    (lessonJson as any).definition = (lessonJson as any).definitions.join(', ');
                }
            }

        } catch (parseError) {
            this.logger.error("Failed to parse AI JSON response for lesson", {
                lessonString,
                parseError,
            });
            throw new Error("Failed to parse AI JSON response for lesson");
        }

        // --- SAVE TO 'lessons' collection ---
        await lessonDbRef.set(lessonJson);



        return lessonJson;
    }

    async updateLesson(kuId: string, section: string, content: string) {
        // 1. Find the lesson document
        const snapshot = await this.db.collection(LESSONS_COLLECTION)
            .where('kuId', '==', kuId)
            .where('userId', '==', CURRENT_USER_ID)
            .limit(1)
            .get();

        if (snapshot.empty) {
            throw new NotFoundException('Lesson not found');
        }

        const doc = snapshot.docs[0];

        // 2. Parse content if it looks like JSON (for array fields)
        // This prevents saving "[{...}]" as a string literal in Firestore
        let valueToSave: any = content;
        try {
            const trimmed = content.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                valueToSave = JSON.parse(content);
            }
        } catch (e) {
            // If parse fails, assume it's just a regular string
            valueToSave = content;
        }

        // 3. Update
        await doc.ref.update({
            [section]: valueToSave
        });

        return { success: true };
    }

    async findByKuId(kuId: string): Promise<Lesson | null> {
        const snapshot = await this.db.collection(LESSONS_COLLECTION)
            .where('kuId', '==', kuId)
            .where('userId', '==', CURRENT_USER_ID)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return null;
        }

        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as unknown as Lesson;
    } // END findByKuId
}

