import { NextResponse } from 'next/server';
import { db, Timestamp } from '@/lib/firebase'; // Added Timestamp
import { logger } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai';
import { KnowledgeUnit, Lesson, ApiLog } from '@/types'; // Added ApiLog
import { API_LOGS_COLLECTION, KNOWLEDGE_UNITS_COLLECTION } from '@/lib/firebase-config'; // Added log collection name
import { performance } from 'perf_hooks'; // Added for timing

// --- (Keep the KANJI_SYSTEM_PROMPT and VOCAB_SYSTEM_PROMPT) ---
const KANJI_SYSTEM_PROMPT = `You are an expert Japanese tutor. You will be asked to enerate a lesson for a given Kanji. The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji. Don't over think things when determining readings. You MUST return ONLY a valid JSON object with this schema:
{
  "type": "Kanji",
  "kanji": "The kanji character",
  "meaning": "The core meaning(s), as a string.",
  "reading_onyomi": [
    { "reading": "Onyomi reading (Katakana)", "example": "Example word (kana)" }
  ],
  "reading_kunyomi": [
    { "reading": "Kunyomi reading (Hiragana)", "example": "Example word (kana)" }
  ],
  "radicals": [
    { "radical": "Radical character", "meaning": "Radical meaning" }
  ],
  "mnemonic_meaning": "A short, creative mnemonic for remembering the meaning.",
  "mnemonic_reading": "A short, creative mnemonic for remembering the main onyomi."
}
Do not add any text before or after the JSON object.`;

const VOCAB_SYSTEM_PROMPT = `You are an expert Japanese tutor. You will be asked to generate a lesson for a given Japanese vocab.  The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji. Don't over think things when determining readings. Your response MUST b a valid JSON object that adheres to this schema:
{
  "type": "Vocab",
  "vocab": "The vocab word",
  "meaning_explanation": "A detailed explanation of the word's meaning and nuance.",
  "reading_explanation": "An explanation of the reading (e.g., when to use it).",
  "context_examples": [
    { "sentence": "Example sentence in Japanese.", "translation": "English translation." }
  ],
  "component_kanji": [
    { "kanji": "Single Kanji character", "reading": "The reading used with the given vocab", "meaning": "Its core meaning" }
  ]
}`;

// --- Define model name centrally ---
const MODEL_NAME = process.env.MODEL_GEMINI_PRO || 'gemini-2.5-flash'

export async function POST(request: Request) {
  logger.info('--- POST /api/generate-lesson ---');
  logger.info(`Using ${MODEL_NAME}`);
  
  let logRef; // Firestore DocumentReference for the log entry
  let startTime = performance.now(); // Start timing
  let errorOccurred = false;
  let capturedError: any = null;
  let text: string | undefined; // Capture raw text for logging
  let lessonJson: Lesson | undefined; // Capture parsed lesson for logging

  try {
    const { kuId } = (await request.json()) as { kuId: string };
    if (!kuId) {
      return NextResponse.json({ error: 'kuId is required' }, { status: 400 });
    }

    // 1. Fetch the KU
    const kuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(kuId);
    const kuDoc = await kuRef.get();
    if (!kuDoc.exists) {
      return NextResponse.json({ error: 'KnowledgeUnit not found' }, { status: 404 });
    }
    const ku = kuDoc.data() as KnowledgeUnit;

    // --- CACHE CHECK ---
    if (ku.lessonCache) {
      logger.info(`Returning cached lesson for KU ${kuId}`);
      // No API call, so no API log needed here.
      return NextResponse.json(ku.lessonCache);
    }
    // --- END CACHE CHECK ---

    logger.info(`Cache miss. Generating new lesson for KU ${kuId}`);
    let systemPrompt: string;
    let jsonSchema: any;
    let userMessage: string;

    // 2. Select prompt based on KU type
    if (ku.type === 'Kanji') {
      systemPrompt = KANJI_SYSTEM_PROMPT;
      jsonSchema = { /* ... Kanji schema ... */ };
      userMessage = `Generate a lesson for this Kanji: ${JSON.stringify(ku)}`;
    } else if (ku.type === 'Vocab' || ku.type === 'Concept' || ku.type === 'Grammar') {
      // systemPrompt = VOCAB_SYSTEM_PROMPT;
      jsonSchema = { /* ... Vocab schema ... */ };
      userMessage = `Generate a lesson for this Vocab: ${JSON.stringify(ku)}`;
    } else {
      logger.warn(`No lesson generator for type: ${ku.type}`);
      return NextResponse.json({ error: `No lesson generator for type: ${ku.type}` }, { status: 400 });
    }
    // (Ensure schemas are fully defined here as before)
    if (ku.type === 'Kanji') {
        jsonSchema = {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING' },
              kanji: { type: 'STRING' },
              meaning: { type: 'STRING' },
              reading_onyomi: { type: 'ARRAY', items: { type: 'OBJECT', properties: { reading: { type: 'STRING' }, example: { type: 'STRING' } } } },
              reading_kunyomi: { type: 'ARRAY', items: { type: 'OBJECT', properties: { reading: { type: 'STRING' }, example: { type: 'STRING' } } } },
              radicals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { radical: { type: 'STRING' }, meaning: { type: 'STRING' } } } },
              mnemonic_meaning: { type: 'STRING' },
              mnemonic_reading: { type: 'STRING' },
            },
            required: ["type", "kanji", "meaning", "reading_onyomi", "reading_kunyomi", "radicals", "mnemonic_meaning", "mnemonic_reading"],
          };
    } else { // Vocab, Concept, Grammar
        jsonSchema = {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING' },
              vocab: { type: 'STRING' },
              meaning_explanation: { type: 'STRING' },
              reading_explanation: { type: 'STRING' },
              context_examples: { type: 'ARRAY', items: { type: 'OBJECT', properties: { sentence: { type: 'STRING' }, translation: { type: 'STRING' } } } },
              component_kanji: { type: 'ARRAY', items: { type: 'OBJECT', properties: { kanji: { type: 'STRING' }, reading: { type: 'STRING' }, meaning: { type: 'STRING' } } } },
            },
            required: ["type", "vocab", "meaning_explanation", "reading_explanation", "context_examples", "component_kanji"],
          };
    }

    const VOCAB_SYSTEM_PROMPT = `You are an expert Japanese tutor. You will be asked to generate a lesson for the Japanese word: ${userMessage}.  The lesson should be in English. Where you want to use Japanese text for examples, explanations, meanings and readings do so but do not include Romaji. Don't over think things when determining readings. Your response MUST b a valid JSON object that adheres to this schema:
    {
      "type": "Vocab",
      "vocab": "The vocab word",
      "meaning_explanation": "A detailed explanation of the word's meaning and nuance.",
      "reading_explanation": "An explanation of the reading (e.g., when to use it).",
      "context_examples": [
        { "sentence": "Example sentence in Japanese.", "translation": "English translation." }
      ],
      "component_kanji": [
        { "kanji": "Single Kanji character", "reading": "The reading used with the given vocab", "meaning": "Its core meaning" }
      ]
    }`;

    // --- Create Initial Log Entry ---
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: '/api/generate-lesson',
      status: 'pending',
      modelUsed: MODEL_NAME,
      requestData: {
        // systemPrompt, // Optional
        userMessage: userMessage, // Log the core data (KU string)
      },
    };
    logRef = await db.collection(API_LOGS_COLLECTION).add(initialLogData);
    logger.debug(`Created initial log entry: ${logRef.id}`);
    // --- End Log ---

    // 3. Call Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { throw new Error('GEMINI_API_KEY is not defined'); }
    const genAI = new GoogleGenAI({apiKey: apiKey});

    const apiCallParams = {
      model: MODEL_NAME,
      contents: [{ parts: [{ text: userMessage }] }],
      config: { // Corrected: generationConfig
        responseMimeType: 'application/json',
        responseSchema: jsonSchema,
      },
    };

    logger.info("--- API Request ---");
    logger.info(JSON.stringify(apiCallParams));

    const response = await genAI.models.generateContent(apiCallParams);

    logger.info("--- API Response ---");
    logger.info(JSON.stringify(response));

    // 4. Parse and return
    text = response.text; // Assign raw text for logging

    if (!text) {
      throw new Error("AI response was empty.");
    }

    // --- NEW DEFENSIVE PARSING ---
    let jsonString = text;

    // Find the first '{' and the last '}'
    // This will cut out all the "Chain of Thought" text before the JSON.
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1) {
      jsonString = text.substring(jsonStart, jsonEnd + 1);
    } else {
      // If no brackets, it's definitely not JSON
      logger.error("AI response did not contain a valid JSON object.", { rawText: text });
      throw new Error("AI response did not contain a valid JSON object.");
    }

    let lessonJson: Lesson | undefined;
    try {
        lessonJson = JSON.parse(jsonString) as Lesson; // Assign parsed lesson for logging
        console.info(lessonJson);
    } catch (parseError) {
        logger.error('Failed to parse AI JSON response for lesson', { text, parseError });
        throw new Error('Failed to parse AI JSON response for lesson');
    }

    logger.info("--- Formatted API Response ---");
    logger.info(JSON.stringify(lessonJson));

    // --- SAVE TO CACHE ---
    await kuRef.update({ lessonCache: lessonJson });
    logger.info(`Successfully generated and cached lesson for KU ${kuId}`);
    // --- END SAVE TO CACHE ---
    debugger; // <-- ADD THIS LINE
    return NextResponse.json(lessonJson);

  } catch (error) {
    errorOccurred = true;
    capturedError = error;

    // --- Robust Error Logging ---
    logger.error('--- UNHANDLED ERROR IN generate-lesson POST ---');
    let errorDetails: any = {};
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = { message: error.message, name: error.name, stack: error.stack };
        if (error.message.includes('fetch') || error.message.includes('network')) {
             errorMessage = `Network error during AI call: ${error.message}`;
        }
    } else {
        try {
            errorDetails = { rawError: JSON.stringify(error, null, 2) };
            errorMessage = `Non-Error exception: ${errorDetails.rawError}`;
        } catch (e) {
            errorDetails = { rawError: "Failed to stringify non-Error object" };
            errorMessage = 'An un-stringifiable error object was caught.';
        }
    }
    logger.error('Failed in /api/generate-lesson', errorDetails);

    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
    // --- End Robust Error Logging ---

  } finally {
    // --- Update Log Entry ---
    if (logRef) {
      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const updateData: Partial<ApiLog> = { durationMs };

      if (errorOccurred) {
        updateData.status = 'error';
        let errorDetails: any = {};
         if (capturedError instanceof Error) {
             errorDetails = { message: capturedError.message, stack: capturedError.stack };
         } else {
             try { errorDetails = { rawError: JSON.stringify(capturedError, null, 2) }; }
             catch { errorDetails = { rawError: "Unstringifiable error" }; }
         }
        updateData.errorData = errorDetails;
      } else {
        updateData.status = 'success';
        updateData.responseData = {
          rawText: text, // Log raw text on success
          parsedJson: lessonJson, // Log parsed lesson on success
        };
      }

      try {
        await logRef.update(updateData);
        logger.debug(`Updated log entry: ${logRef.id}`);
      } catch (logUpdateError) {
        logger.error(`Failed to update log entry ${logRef.id}`, { logUpdateError });
      }
    }
    // --- End Log ---
  }
}

