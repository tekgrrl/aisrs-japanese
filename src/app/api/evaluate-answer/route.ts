import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db, Timestamp } from '@/lib/firebase'; // Import db and Timestamp
import { API_LOGS_COLLECTION } from '@/lib/firebase-config'; // Import collection name
import { ApiLog } from '@/types'; // Import the log type
import { performance } from 'perf_hooks'; // For timing

const MODEL_NAME = process.env.MODEL_GEMINI_PRO || 'gemini-2.5-flash'

export async function POST(request: Request) {
  logger.info('--- POST /api/evaluate-answer ---');
  logger.info(`Using ${MODEL_NAME}`);
  
  let logRef; // Firestore DocumentReference for the log entry
  let startTime = performance.now(); // Start timing
  let errorOccurred = false; // Flag to track if error happens
  let capturedError: any = null; // Store error for finally block

  try {
    const { userAnswer, expectedAnswer, question, topic } = await request.json();

    if (userAnswer === undefined || userAnswer === null || expectedAnswer === null || expectedAnswer === undefined) {
      logger.warn('Missing userAnswer or expectedAnswer', { userAnswer, expectedAnswer });
      return NextResponse.json(
        { error: 'Missing userAnswer or expectedAnswer' },
        { status: 400 },
      );
    }

    const systemPrompt = `You are an AISRS evaluator. A user is being quizzed.
- The question was: "${question || 'N/A'}"
- The topic was: "${topic || 'N/A'}"
- The expected answer(s) are: "${expectedAnswer}"
- The user's answer is: "${userAnswer}"

Your task is to evaluate if the user's answer is correct.
1.  Read the "expected answer(s)". This may be a single answer (e.g., "Family") or a comma-separated list of possible correct answers (e.g., "ドク, トク, よむ").
2.  Compare the user's answer to the list. The user is correct if their answer is *any one* of the items in the list.
3.  Be lenient with hiragana vs katakana (e.g., if expected is "ドク" and user typed "どく", it's a pass).
4.  Be lenient with extra punctuation or whitespace.
5.  Provide your evaluation ONLY as a valid JSON object with the following schema:
{
  "result": "pass" | "fail",
  "explanation": "A brief, one-sentence explanation for *why* the user passed or failed, referencing their answer."
}
Example for a pass: {"result": "pass", "explanation": "Correct! よむ is one of the kun'yomi readings."}
Example for a fail: {"result": "fail", "explanation": "Incorrect. The expected readings were ドク, トク, or よむ."}
`;

    const userMessage = `User Answer: ${userAnswer}\nExpected: ${expectedAnswer}`; // Simple message for logging

    // --- Create Initial Log Entry ---
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: '/api/evaluate-answer',
      status: 'pending',
      modelUsed: MODEL_NAME,
      requestData: {
        // systemPrompt, // Optional: Log prompt if needed, can be large
        userMessage: userMessage, // Log the core data
        // Also log the inputs separately for clarity
        input_userAnswer: userAnswer,
        input_expectedAnswer: expectedAnswer,
        input_question: question,
        input_topic: topic,
      },
    };
    logRef = await db.collection(API_LOGS_COLLECTION).add(initialLogData);
    logger.debug(`Created initial log entry: ${logRef.id}`);
    // --- End Log ---

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) { throw new Error('GEMINI_API_KEY is not defined'); }

    // Using raw fetch as per current pattern in this file
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: [{ text: `User Answer: ${userAnswer}\nExpected: ${expectedAnswer}` }] }], // Simple prompt
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            result: { type: 'STRING', enum: ['pass', 'fail'] },
            explanation: { type: 'STRING' },
          },
          required: ['result', 'explanation'],
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

    const aiJsonText = candidate.content.parts[0].text;
    let evaluationResult: { result: 'pass' | 'fail'; explanation: string };

    try {
      evaluationResult = JSON.parse(aiJsonText);
    } catch (parseError) {
      logger.error('Failed to parse AI JSON response', { aiJsonText, parseError });
      throw new Error('Failed to parse AI JSON response');
    }

    logger.info(`Evaluation result: ${evaluationResult.result}`);
    return NextResponse.json(evaluationResult);

  } catch (error) {
    errorOccurred = true; // Set flag
    capturedError = error; // Capture error for finally block

    // Log the error using the robust logger from previous steps
    logger.error('--- UNHANDLED ERROR IN evaluate-answer POST ---');
    let errorDetails: any = {};
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = { message: error.message, name: error.name, stack: error.stack };
        if (error.message.includes('fetch') || error.message.includes('network')) {
             errorMessage = `Network error during API call: ${error.message}`;
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
    logger.error('Failed in /api/evaluate-answer', errorDetails);

    // Return error response to client
    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
  } finally {
    // --- Update Log Entry ---
    if (logRef) {
      const endTime = performance.now();
      const durationMs = endTime - startTime;
      const updateData: Partial<ApiLog> = {
        durationMs,
      };

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
        // Assuming success means we got 'evaluationResult'
        // We might want to add raw text logging here too if needed
        updateData.responseData = {
          // rawText: aiJsonText, // Uncomment if raw text needed
          parsedJson: evaluationResult, // Log the parsed result
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

// Helper: Define evaluationResult outside try block if needed in finally
let evaluationResult: { result: 'pass' | 'fail'; explanation: string } | undefined;

