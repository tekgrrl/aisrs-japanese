import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { db, Timestamp } from '@/lib/firebase'; // Import db and Timestamp
import { API_LOGS_COLLECTION } from '@/lib/firebase-config'; // Import collection name
import { ApiLog } from '@/types'; // Import the log type
import { performance } from 'perf_hooks'; // For timing
import { GoogleGenAI } from '@google/genai'; 
import { GoogleGenAI } from '@google/genai'; 
const MODEL_NAME = process.env.MODEL_GEMINI_FLASH || 'gemini-2.5-flash'

export async function POST(request: Request) {
  logger.info('--- POST /api/evaluate-answer ---');
  logger.info(`Using ${MODEL_NAME}`);
  
  let logRef; // Firestore DocumentReference for the log entry
  let startTime = performance.now(); // Start timing
  let errorOccurred = false; // Flag to track if error happens
  let capturedError: any = null; // Store error for finally block
  let evaluationResult: { result: 'pass' | 'fail'; explanation: string } | undefined;

  try {
    const { userAnswer, expectedAnswer, question, topic, questionType } = await request.json();

    if (userAnswer === undefined || userAnswer === null || expectedAnswer === null || expectedAnswer === undefined) {
      logger.warn('Missing userAnswer or expectedAnswer', { userAnswer, expectedAnswer });
      return NextResponse.json(
        { error: 'Missing userAnswer or expectedAnswer' },
        { status: 400 },
      );
    }

    const systemPrompt = `You are a Japanese language tutor. A user is being quizzed on their Japanese language skills.

    const systemPrompt = `You are a Japanese language tutor. A user is being quizzed on their Japanese language skils.
- The question was: "What is the ${questionType} of ${question || 'N/A'}"
- The expected answer(s) are: "${expectedAnswer}"
- The user's answer is: "${userAnswer}"

Note that "Definition" refers to the english definition.

Your task is to evaluate if the user's answer is correct.
1.  Read the "expected answer(s)". This may be a single answer (e.g., "Family") or a comma-separated list of possible correct answers (e.g., "ドク, トク, よむ").
2.  Compare the user's answer to your understanding of what the actual answer is
  "result": "pass" | "fail",
4.  Be lenient with extra punctuation or whitespace.
5.  If it looks like the user provided the reading instead of the definition or vice versa fail them but let them know in your response
6.  Provide your evaluation ONLY as a valid JSON object with the following schema:
{
  "result": "pass" | "fail" | 
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
        // input_questionType: questionType,
      },
    };
    logRef = await db.collection(API_LOGS_COLLECTION).add(initialLogData);
    // logger.debug(`Created initial log entry: ${logRef.id}`);
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

    try {
      evaluationResult = JSON.parse(aiJsonText);
    } catch (parseError) {
      logger.error('Failed to parse AI JSON response', { aiJsonText, parseError });
      throw new Error('Failed to parse AI JSON response');
    }

    // This check satisfies TypeScript's compiler. In practice, if evaluationResult
    // is undefined here, the JSON.parse above would have thrown an error.
    if (!evaluationResult) {
      throw new Error('Evaluation result is missing after AI response parsing.');
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
