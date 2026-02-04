import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { FIRESTORE_CONNECTION, LESSONS_COLLECTION, KNOWLEDGE_UNITS_COLLECTION } from '../firebase/firebase.module';
import { Firestore, BulkWriter } from 'firebase-admin/firestore';
import { GeminiService } from '../gemini/gemini.service';
import { QuestionsService } from '../questions/questions.service';
import { KnowledgeUnit, Lesson, VocabLesson } from '../types';
import { performance } from 'perf_hooks';
import { CURRENT_USER_ID } from '@/lib/constants';

import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';

@Injectable()
export class LessonsService {
  private readonly logger = new Logger(LessonsService.name);

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly geminiService: GeminiService,
    private readonly knowledgeUnitsService: KnowledgeUnitsService,
  ) { }

  async generateLesson(kuId: string, cachedContentName?: string) {
    this.logger.log(`in generateLesson(): kuId=${kuId}, cachedContentName=${cachedContentName}`);
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
    // Return existing lesson if it's completed OR if it has no status (legacy lesson)
    if (lessonDoc.exists && (lessonDoc.data()?.status === 'completed' || !lessonDoc.data()?.status)) {
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
      if (cachedContentName) {
        userMessage = `Generate a lesson for the Japanese word: ${ku.content}`;
      } else {
        userMessage = `You are an expert Japanese tutor. You will be asked to generate a lesson for the Japanese word: ${ku.content}.
${VOCAB_INSTRUCTIONS}`;
      }
    }

    const lessonString = await this.geminiService.generateLesson(
      userMessage,
      { content, kuId },
      cachedContentName
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

    // --- UPDATE KU WITH LESSON DATA ---
    if (ku.type === 'Vocab') {
      const vocabLesson = lessonJson as VocabLesson;
      const updates: Record<string, any> = {};

      // Use dot notation to update nested data fields without overwriting the map
      if (vocabLesson.reading) {
        updates['data.reading'] = vocabLesson.reading;
      }

      // definition is populated above by joining definitions
      if (vocabLesson.definition) {
        updates['data.definition'] = vocabLesson.definition;
      }

      if (Object.keys(updates).length > 0) {
        try {
          this.logger.log(`Updating KU ${kuId} with lesson data: ${JSON.stringify(updates)}`);
          await this.knowledgeUnitsService.update(kuId, updates);
        } catch (e) {
          this.logger.error(`Failed to backfill KU ${kuId} with lesson data`, e);
          // Don't fail the response, just log error
        }
      }
    }

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


  async processBatch(vocabValues: { id: string; content: string }[]) {
    const instructions = `${VOCAB_INSTRUCTIONS}\n\n${VOCAB_EXAMPLES}`;
    const cacheName = await this.geminiService.createContextCache(
      `You are an expert Japanese tutor. You will be asked to generate a lesson for a Japanese word.\n${instructions}`,
      3600
    );

    this.logger.log(`Created Context Cache: ${cacheName} for batch processing`);
    const bulkWriter = this.db.bulkWriter();

    let processedCount = 0;
    const totalItems = vocabValues.length;

    try {
      for (const item of vocabValues) {
        processedCount++;
        this.logger.log(`[Batch ${processedCount}/${totalItems}] Processing item: ${item.content} (${item.id})`);

        try {
          const lessonRef = this.db.collection(LESSONS_COLLECTION).doc(item.id);
          const lessonDoc = await lessonRef.get();
          const lessonData = lessonDoc.data();

          // Skip if lesson exists and is not marked as failed.
          // This creates a "resume" capability and prevents overwriting legacy lessons (undefined status)
          // or lessons that are currently generating/completed.
          if (lessonDoc.exists && lessonData?.status !== 'failed') {
            this.logger.log(`Skipping ${item.content} - already exists (Status: ${lessonData?.status ?? 'legacy'})`);
            continue;
          }

          // Set status to generating
          await lessonRef.set({
            kuId: item.id,
            userId: CURRENT_USER_ID,
            status: 'generating',
            createdAt: new Date(),
          }, { merge: true });

          // --- GENERATE ---
          this.logger.log(`Generating lesson for ${item.content} using cache ${cacheName}`);
          const lesson = await this.generateLesson(item.id, cacheName);

          // --- SAVE ---
          void bulkWriter.set(lessonRef, {
            ...lesson,
            status: 'completed'
          }, { merge: true });

          this.logger.log(`Successfully generated and queued write for ${item.content}`);

          // --- RATE LIMIT DELAY (Trickle) ---
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (err) {
          this.logger.error(`Failed to process item ${item.content}`, err);
          const lessonRef = this.db.collection(LESSONS_COLLECTION).doc(item.id);
          // Mark as failed so it can be retried later
          void bulkWriter.set(lessonRef, { status: 'failed', error: (err as Error).message }, { merge: true });
        }
      }

      this.logger.log('Batch iteration completed. Waiting for BulkWriter to flush...');

    } catch (e) {
      this.logger.error('Critical Error in processBatch loop', e);
    } finally {
      // Ensure BulkWriter is closed to commit all changes
      try {
        await bulkWriter.close();
        this.logger.log('BulkWriter closed successfully. Batch processing finished.');
      } catch (closeError) {
        this.logger.error('Failed to close BulkWriter', closeError);
      }

      // Cleanup Cache
      try {
        await this.geminiService.deleteContextCache(cacheName);
        this.logger.log(`Deleted Context Cache: ${cacheName}`);
      } catch (cacheError) {
        this.logger.error(`Failed to delete Context Cache: ${cacheName}`, cacheError);
      }
    }
  }
}

const VOCAB_INSTRUCTIONS = `
The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji.

**Task 1: Metadata Extraction**
* Provide the standard **Kana Reading**.
* Provide a list of **Concise Definitions** (suitable for valid acceptable answers in a quiz).
* Identify the **Part of Speech**.
* Identify the **Conjugation Type** (if applicable).

**Task 2: Lesson Generation**
* Generate detailed explanations for meaning and reading.
* If a word is a "suru noun", include explanations of the meaning of the suru form.
* Generate context examples that are no more complex that JLPT N4 even if the vocabulary itself is more advanced.
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

const VOCAB_EXAMPLES = `
**Examples:**

Input: 先生

Output:
{
  "type": "Vocab",
  "vocab": "先生",
  "reading": "せんせい",
  "definitions": ["teacher", "instructor", "master", "doctor"],
  "partOfSpeech": "noun",
  "conjugation_type": null,
  "meaning_explanation": "A term used to address or refer to teachers, doctors, lawyers, politicians, and other authority figures or experts. It literally means 'one born before'.",
  "reading_explanation": "Note that 'sei' (せい) is prolonged, so it sounds like 'sensee'. This is a common pronunciation change in Japanese.",
  "context_examples": [
    { "sentence": "田中[たなか]先生[せんせい]は日本語[にほんご]を教[おし]えています。", "translation": "Professor Tanaka teaches Japanese." }
  ],
  "component_kanji": [
    {
      "kanji": "先",
      "reading": "せん",
      "meaning": "before, ahead, previous",
      "onyomi": ["セン"],
      "kunyomi": ["さき", "ま.ず"]
    },
    {
      "kanji": "生",
      "reading": "せい",
      "meaning": "life, genuine, birth",
      "onyomi": ["セイ", "ショウ"],
      "kunyomi": ["い.きる", "う.む", "お.う", "は.える", "なま"]
    }
  ]
}

Input: 食べる

Output:
{
  "type": "Vocab",
  "vocab": "食べる",
  "reading": "たべる",
  "definitions": ["to eat"],
  "partOfSpeech": "transitive-verb",
  "conjugation_type": "ichidan",
  "meaning_explanation": "The standard verb for 'to eat'. It is a transitive verb, so it takes an object marked by 'o' (を).",
  "reading_explanation": "The reading 'ta' comes from the kanji 食 and 'beru' is okurigana.",
  "context_examples": [
    { "sentence": "朝[あさ]ごはんにパンを食[た]べました。", "translation": "I ate bread for breakfast." }
  ],
  "component_kanji": [
    {
      "kanji": "食",
      "reading": "た",
      "meaning": "eat, food",
      "onyomi": ["ショク", "ジキ"],
      "kunyomi": ["く.う", "た.べる", "は.む"]
    }
  ]
}

Input: 有名

Output:
{
  "type": "Vocab",
  "vocab": "有名",
  "reading": "ゆうめい",
  "definitions": ["famous", "fame"],
  "partOfSpeech": "na-adjective",
  "conjugation_type": "na-adjective",
  "meaning_explanation": "Describes something or someone that has a name widely known. It is a Na-adjective, so you use 'na' to modify nouns (e.g. 有名のな人 - famous person).",
  "reading_explanation": "Standard on'yomi readings. 'Yuu' (有) + 'Mei' (名).",
  "context_examples": [
    { "sentence": "彼[かれ]は有名[ゆうめい]な歌手[かしゅ]です。", "translation": "He is a famous singer." }
  ],
  "component_kanji": [
    {
      "kanji": "有",
      "reading": "ゆう",
      "meaning": "possess, have, exist",
      "onyomi": ["ユウ", "ウ"],
      "kunyomi": ["あ.る"]
    },
     {
      "kanji": "名",
      "reading": "めい",
      "meaning": "name, noted, distinguished",
      "onyomi": ["メイ", "ミョウ"],
      "kunyomi": ["な"]
    }
  ]
}

Input: 勉強する

Output:
{
  "type": "Vocab",
  "vocab": "勉強する",
  "reading": "べんきょうする",
  "definitions": ["to study", "to work hard"],
  "partOfSpeech": "noun-suru",
  "conjugation_type": "suru",
  "meaning_explanation": "The primary verb for 'to study'. It is composed of the noun 'Benkyou' (study) and the auxiliary verb 'suru' (to do).",
  "reading_explanation": "Ben (勉) + Kyou (強) + Suru. Note that 'strong' (強) is usually read 'kyo' as a standalone on'yomi, but here it is 'kyou'.",
  "context_examples": [
    { "sentence": "毎日[まいにち]日本語[にほんご]を勉強[べんきょう]します。", "translation": "I study Japanese every day." }
  ],
  "component_kanji": [
    {
      "kanji": "勉",
      "reading": "べん",
      "meaning": "exertion, endeavour, encourage",
      "onyomi": ["ベン"],
      "kunyomi": ["つと.める"]
    },
     {
      "kanji": "強",
      "reading": "きょう",
      "meaning": "strong",
      "onyomi": ["キョウ", "ゴウ"],
      "kunyomi": ["つよ.い", "つよ.まる", "つよ.める", "し.いる"]
    }
  ]
}

Input: 日本

Output:
{
  "type": "Vocab",
  "vocab": "日本",
  "reading": "にほん",
  "definitions": ["Japan"],
  "partOfSpeech": "proper-noun",
  "conjugation_type": null,
  "meaning_explanation": "The country of Japan. Literally 'sun origin' (Land of the Rising Sun).",
  "reading_explanation": "Usually read 'Nihon', but sometimes 'Nippon' (more formal or emphatic).",
  "context_examples": [
    { "sentence": "日本[にほん]に行[い]きたいです。", "translation": "I want to go to Japan." }
  ],
  "component_kanji": [
    {
      "kanji": "日",
      "reading": "に",
      "meaning": "day, sun, Japan",
      "onyomi": ["ニチ", "ジツ"],
      "kunyomi": ["ひ", "か"]
    },
     {
      "kanji": "本",
      "reading": "ほん",
      "meaning": "book, present, main, origin, true, real",
      "onyomi": ["ホン"],
      "kunyomi": ["もと"]
    }
  ]
}
`;

