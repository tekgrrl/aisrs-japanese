import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { KNOWLEDGE_UNITS_COLLECTION, LESSONS_COLLECTION } from '@/lib/firebase-config';
import { logger } from '@/lib/logger';
import { GoogleGenAI } from '@google/genai'; // <-- CORRECT IMPORT
import { KnowledgeUnit, Lesson, VocabLesson, KanjiLesson } from '@/types'; // <-- Import new types

// --- (Helper function 'cleanJsonString' is no longer needed with schema enforcement) ---

// --- KANJI PROMPT & SCHEMA ---
const KANJI_SYSTEM_PROMPT = `You are an expert Japanese tutor. Generate a lesson for the given Kanji. You MUST return ONLY a valid JSON object with this schema:
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

// --- VOCAB PROMPT & SCHEMA ---
const VOCAB_SYSTEM_PROMPT = `You are an expert Japanese tutor. Generate a WaniKani-style lesson for the given vocab. You MUST return ONLY a valid JSON object with this schema:
{
  "type": "Vocab",
  "vocab": "The vocab word",
  "meaning_explanation": "A detailed explanation of the word's meaning and nuance.",
  "reading_explanation": "An explanation of the reading (e.g., when to use it).",
  "context_examples": [
    { "sentence": "Example sentence in Japanese.", "translation": "English translation." }
  ],
  "component_kanji": [
    { "kanji": "Single Kanji character", "reading": "Its primary reading", "meaning": "Its core meaning" }
  ]
}
Do not add any text before or after the JSON object.`;


export async function POST(request: Request) {
  logger.info('--- POST /api/generate-lesson ---');
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

    // --- NEW: Define lessonRef once ---
    const lessonRef = db.collection(LESSONS_COLLECTION).doc(kuId);

    // Check for lesson in 'lessons' collection
    const lessonDoc = await lessonRef.get();
    if (lessonDoc.exists) {
        logger.info(`Returning cached lesson for KU ${kuId} from lessons collection`);
        return NextResponse.json(lessonDoc.data());
    }
    // --- END CACHE CHECK ---

    logger.info(`Cache miss. Generating new lesson for KU ${kuId}`);
    let systemPrompt: string;
    let jsonSchema: any;
    let userMessage: string;

    // 2. Select prompt based on KU type
    if (ku.type === 'Kanji') {
      systemPrompt = KANJI_SYSTEM_PROMPT;
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
      userMessage = `Generate a lesson for this Kanji: ${JSON.stringify(ku)}`;

    } else if (ku.type === 'Vocab' || ku.type === 'Concept' || ku.type === 'Grammar') {
      systemPrompt = VOCAB_SYSTEM_PROMPT;
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
      userMessage = `Generate a lesson for this Vocab: ${JSON.stringify(ku)}`;

    } else {
      logger.warn(`No lesson generator for type: ${ku.type}`);
      return NextResponse.json({ error: `No lesson generator for type: ${ku.type}` }, { status: 400 });
    }

    // 3. Call Gemini API
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { throw new Error('GEMINI_API_KEY is not defined'); }
    const genAI = new GoogleGenAI({apiKey: apiKey});

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash', // Or your preferred model
      contents: [{ parts: [{ text: userMessage }] }],
      config: {
        responseMimeType: 'application/json',
        responseSchema: jsonSchema,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      },
    });

    const text = response.text;
    
    // --- FIX: Add type guard for undefined text ---
    if (!text) { 
      logger.error('AI response was empty or undefined', { response });
      throw new Error("AI response was empty or undefined."); 
    }
    
    const lessonJson = JSON.parse(text) as Lesson; 
    
    // --- NEW: SAVE TO 'lessons' collection ---
    await lessonRef.set(lessonJson);
    logger.info(`Successfully generated and cached lesson for KU ${kuId} in lessons collection`);
    // --- END SAVE TO CACHE ---
    
    return NextResponse.json(lessonJson);

  } catch (error) {
    // --- FIX: Add robust error logging ---
    logger.error('--- UNHANDLED ERROR IN generate-lesson POST ---');
    
    let errorDetails: any = {};

    if (error instanceof Error) {
      errorDetails = { 
        message: error.message, 
        stack: error.stack 
      };
    } else {
      try {
        errorDetails = {
          rawError: JSON.stringify(error, null, 2)
        };
      } catch (e) {
        errorDetails = { rawError: "Failed to stringify error object" };
      }
    }
    
    logger.error('Failed to generate lesson', errorDetails);

    return NextResponse.json(
      { error: 'An unknown error occurred', details: errorDetails.rawError || errorDetails.message },
      { status: 500 }
    );
  }
}