import { Injectable, Inject, Logger } from '@nestjs/common';
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

    async testConnection() {
        const snapshot = await this.db.collection('lessons').limit(1).get();
        return `Connected! Found ${snapshot.size} docs.`;
    }

    async generateLesson(kuId: string) {
        let logRef; // Firestore DocumentReference for the log entry
        let startTime = performance.now(); // Start timing
        let errorOccurred = false;
        let capturedError: any = null;
        let text: string | undefined; // Capture raw text for logging

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

        const VOCAB_USER_PROMPT = `You are an expert Japanese tutor. You will be asked to generate a lesson for the Japanese word: ${ku.content}.

The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji.

**Task 1: Metadata Extraction**
* Provide the standard **Kana Reading**.
* Provide a **Concise Definition** (comma-separated, max 3-5 words) suitable for a dictionary entry or flashcard.
* Identify the **Part of Speech**.
* Identify the **Conjugation Type** (if applicable).

**Task 2: Lesson Generation**
* Generate detailed explanations for meaning and reading.
* Generate context examples.
* Analyze component Kanji.

**Constraints:**
For the \`partOfSpeech\` property, select one of:
* noun, proper-noun, noun-suru, i-adjective, na-adjective, transitive-verb, intransitive-verb, adverb, counter, prefix, suffix, conjunction, particle

For the \`conjugation_type\` property, select one of (or null):
* godan, ichidan, irregular, suru, i-adjective, na-adjective, null

**Response Schema:**
You MUST return a valid JSON object matching this schema:
{
  "type": "Vocab",
  "vocab": "The canonical Japanese word",
  "reading": "The canonical kana reading (e.g. ぜったい)",
  "definition": "Concise dictionary definition (e.g. absolutely, unconditionally)",
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

        const userMessage = VOCAB_USER_PROMPT;

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
}

