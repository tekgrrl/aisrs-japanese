import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db, Timestamp } from '@/lib/firebase'; // Added Timestamp
import { API_LOGS_COLLECTION } from '@/lib/firebase-config'; // Added log collection name
import { ApiLog } from '@/types'; // Added ApiLog
import { performance } from 'perf_hooks'; // Added for timing

// --- Define model name centrally ---
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

// --- System Prompt ---
const SYSTEM_PROMPT = `You are an expert Japanese tutor and quiz generator. 
You will be prompted with a single piece of Japanese Vocab: a word or grammar concept (the 'topic'). 
Your task is to create a single, context-based question to test the user's understanding of that word or grammar concept. 
You can generate questions in any of the following forms:
- Verb conjugation. if the word is a verb, conjugate the verb to a specific form e.g.: Give the past potential form of the verb in question
- Match up the Vocab in question with a particle to give a particular meaning in a sentence that you specify, you can represent the particle with a blank '[____]'
- A context-based, fill-in-the-blank style question with a single blank '[____]'

You MUST return ONLY a valid JSON object with the following schema:
{
  "question": "A Japanese phrase or sentence with exactly one blank represented by '[____]'. Include brief English context if necessary.",
  "answer": "The single Japanese word or particle that correctly fills the blank."
}
Rules:
1.  The question must directly test the provided 'topic'.
2.  Use '[____]' for the blank, exactly once.
3.  The answer must be the single word/particle that fits the blank.
4.  Include English context for Verb conjugation and particle matching, for general fill-in-the-blank type questions only inllcude if the Japanese sentence alone is ambiguous. 
5.  Keep any context given brief (1 sentence max).
6.  Ensure the generated question makes grammatical sense in Japanese.
7.  Vary the question format. Sometimes ask for a particle, sometimes a verb conjugation, sometimes the vocab word itself.
8.  If context is provided, it MUST be in English.
9.  Do NOT use literal newlines inside the JSON string values. Use spaces instead.
10. The combination of context and question MUST lead to a single, unambiguous correct answer. Avoid questions that could plausibly be answered by two different words from the topic.
11. Assume that the user is studying at beginner level JLPT N4, they know some of N4 but are not proficient
12. If provided, use the 'Running List' of the user's weak points to generate a question that specifically targets one of these weaknesses, if it's relevant to the current topic.
Do not add any text before or after the JSON object.`;


export async function GET(request: Request) {
  logger.info('--- GET /api/generate-question ---');
  logger.info(`Using ${MODEL_NAME}`);

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

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: userMessage }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            question: { type: 'STRING' },
            answer: { type: 'STRING' },
          },
          required: ['question', 'answer'],
        },
      },
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error(`Gemini API error: ${response.status}`, { errorBody });
      throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      logger.error('Invalid response structure from Gemini', { result });
      throw new Error('Invalid response structure from Gemini');
    }

    aiJsonText = candidate.content.parts[0].text; // Assign raw text for logging

    if (!aiJsonText) {
        throw new Error("AI response text was empty.");
    }

    try {
      parsedJson = JSON.parse(aiJsonText); // Assign parsed result for logging
    } catch (parseError) {
      logger.error('Failed to parse AI JSON response for question', { aiJsonText, parseError });
      throw new Error('Failed to parse AI JSON response for question');
    }

    if (!parsedJson || !parsedJson.question || !parsedJson.answer) {
        logger.error('Parsed JSON missing question or answer', { parsedJson });
      throw new Error('Parsed JSON from AI was missing required fields.');
    }

    logger.info(`Successfully generated question for topic: ${topic}`);
    return NextResponse.json(parsedJson);

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
      } catch (logUpdateError) {
        logger.error(`Failed to update log entry ${logRef.id}`, { logUpdateError });
      }
    }
    // --- End Log ---
  }
}

