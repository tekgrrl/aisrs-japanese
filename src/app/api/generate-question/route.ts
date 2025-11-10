import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db, Timestamp } from '@/lib/firebase'; // Added Timestamp
import { API_LOGS_COLLECTION } from '@/lib/firebase-config'; // Added log collection name
import { ApiLog } from '@/types'; // Added ApiLog
import { performance } from 'perf_hooks'; // Added for timing
import { GoogleGenAI } from "@google/genai";


// --- Define model name centrally ---
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// --- System Prompt ---
const systemPrompt = `You are an expert Japanese tutor and quiz generator. 
You will be prompted with a single piece of Japanese Vocab: a word or grammar concept (the 'topic'). 
Your task is to create a single, context-based question to test the user's understanding of that word or grammar concept. 
You can generate questions in any of the following forms:
- Verb conjugation. if the word is a verb, conjugate the verb to a specific form e.g.: Give the past potential form of the verb in question
- Match up the Vocab in question with a particle to give a particular meaning in a sentence that you specify, you can represent the particle with a blank '[____]'
- A context-based, fill-in-the-blank style question with a single blank '[____]'

You MUST return ONLY a valid JSON object with the following schema:
{
  "question": "The Japanese phrase/sentence with the blank '[____]'. MUST contain ONLY Japanese text.",
  "context": "OPTIONAL. Brief English context/hint only if needed for disambiguation.",
  "answer": "The single Japanese word or particle that best fills the blank.",
  "accepted_alternatives": ["Array of other grammatically valid answers (e.g. different politeness levels)."]
}
Rules:
1.  The question must directly test the provided 'topic'.
2.  Use '[____]' for the blank, exactly once.
3.  The answer must be the single word/particle that fits the blank.
4.  The question field MUST contain ONLY Japanese text (and the blank [____]). Do NOT include English in this field.
5.  Use the context field ONLY if the Japanese sentence alone is ambiguous. It should be a brief (1 sentence max) English hint to guide the user to the specific intended answer (e.g., "polite form required" or "translates to 'absolutely'").
6.  Ensure the generated question makes grammatical sense in Japanese.
7.  Vary the question format. Sometimes ask for a particle, sometimes a verb conjugation, sometimes the vocab word itself.
8.  Do NOT use literal newlines inside the JSON string values. Use spaces instead.
9.  If the provided English context does NOT strictly dictate a specific politeness level, you MUST include standard valid variations (plain form, polite 'masu' form) in the accepted_alternatives array.
10. Assume that the user is studying at beginner level JLPT N4, they know some of N4 but are not proficient
11. If provided, use the 'Running List' of the user's weak points to generate a question that specifically targets one of these weaknesses, if it's relevant to the current topic.
12. The question tests a specific concept, but natural language often has valid variations based on politeness (e.g., 食べる vs. 食べます).
13. The answer field should contain the single most natural form for the sentence.
14: Ambiguity Prevention: If other distinct words (synonyms) could grammatically and logically fit the blank, use the English context to disambiguate by including the closest English translation of the target word.
15. Do not add any text before or after the JSON object.`;

export async function GET(request: Request) {
  logger.info('--- GET /api/generate-question ---');

  let logRef; // Firestore DocumentReference for the log entry
  let startTime = performance.now(); // Start timing
  let errorOccurred = false;
  let capturedError: any = null;
  let aiJsonText: string | undefined; // Capture raw text for logging
  let parsedJson: { question: string; answer: string } | undefined; // Capture parsed result

  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get('topic');
    if (!topic) {
      return NextResponse.json({ error: 'Topic parameter is required' }, { status: 400 });
    }

    // --- Fetch the Running List (Context Summarizer) ---
    // Note: Using absolute URL for server-side fetch to self
    const baseUrl = process.env.NODE_ENV === 'production'
        ? process.env.NEXT_PUBLIC_BASE_URL || request.headers.get('host') || 'http://localhost:3000' // Adjust as needed
        : 'http://localhost:3000'; // Assuming dev server runs on 3000
        
    const contextResponse = await fetch(`${baseUrl}/api/summarize-context`, { cache: 'no-store' }); // Don't cache context
    let runningListSummary = "No weak points identified yet.";
    if (contextResponse.ok) {
        const contextData = await contextResponse.json();
        runningListSummary = contextData.summary || runningListSummary;
    } else {
        logger.warn('Failed to fetch running list context for question generation.');
    }
    logger.debug(`Using running list: ${runningListSummary}`);
    // --- End Fetch Running List ---


    const userMessage = `Topic: ${topic}\nRunning List: ${runningListSummary}`;

    // --- Create Initial Log Entry ---
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: '/api/generate-question',
      status: 'pending',
      modelUsed: MODEL_NAME,
      requestData: {
        // systemPrompt, // Optional
        userMessage: userMessage, // Log topic + running list
      },
    };
    logRef = await db.collection(API_LOGS_COLLECTION).add(initialLogData);
    logger.debug(`Created initial log entry: ${logRef.id}`);
    // --- End Log ---

    // 3. Call Gemini API (using fetch as before)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { throw new Error('GEMINI_API_KEY is not defined'); }

    const client = new GoogleGenAI({ apiKey });

    try {
      // 2. Make the call using the SDK
      const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              question: { type: 'STRING' },
              context: { type: 'STRING' },
              answer: { type: 'STRING' },
              accepted_alternatives: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['question', 'answer'],
          },
        },
      });

      // 3. Extract text using the SDK's helper method
      aiJsonText = response.text;

      if (!aiJsonText) {
        logger.error('Empty response text from Gemini SDK', { response });
        throw new Error('Invalid response structure from Gemini');
      }

      // 4. Parse and validate (keeping existing robust parsing logic)
      try {
        parsedJson = JSON.parse(aiJsonText);
      } catch (parseError) {
        logger.error('Failed to parse AI JSON response', { aiJsonText, parseError });
        throw new Error('Failed to parse AI JSON response');
      }

      if (!parsedJson) {
        throw new Error('Evaluation result is missing after AI response parsing.');
      }

      return NextResponse.json(parsedJson);

    } catch (error: any) {
      // Catch SDK errors (like 400/500 responses which throw in the SDK)
      logger.error('Gemini API Error', { error: error.message || error });
      throw error; // re-throw to be handled by the caller or Next.js error boundary
    }

  } catch (error) {
    errorOccurred = true;
    capturedError = error;

    // --- Robust Error Logging ---
    logger.error('--- UNHANDLED ERROR IN generate-question GET ---');
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
    logger.error('Failed in /api/generate-question', errorDetails);

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
          rawText: aiJsonText, // Log raw text on success
          parsedJson: parsedJson, // Log parsed result on success
        };
      }

      try {
        await logRef.update(updateData);
        logger.debug(`Updated log entry: ${logRef.id}`);
      } catch (error) {
        const logUpdateError = error as Error & { code?: string };
        logger.error(`Failed to update log entry ${logRef.id}`, {
          errorMessage: logUpdateError.message,
          errorCode: logUpdateError.code,
          errorStack: logUpdateError.stack
        });
      }
    }
    // --- End Log ---
  }
}

