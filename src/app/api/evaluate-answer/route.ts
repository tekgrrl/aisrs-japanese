import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { db, Timestamp } from "@/lib/firebase"; // Import db and Timestamp
import { API_LOGS_COLLECTION } from "@/lib/firebase-config"; // Import collection name
import { ApiLog } from "@/types"; // Import the log type
import { performance } from "perf_hooks"; // For timing
import { GoogleGenAI } from "@google/genai";

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(request: Request) {
  logger.info("--- POST /api/evaluate-answer ---");
  logger.debug(`Using ${MODEL_NAME}`);

  let logRef; // Firestore DocumentReference for the log entry
  let startTime = performance.now(); // Start timing
  let errorOccurred = false; // Flag to track if error happens
  let capturedError: any = null; // Store error for finally block
  let evaluationResult:
    | { result: "pass" | "fail"; explanation: string }
    | undefined;

  try {
    const { userAnswer, expectedAnswers, question, topic } =
      await request.json();

    if (
      userAnswer == null ||
      expectedAnswers == null ||
      !Array.isArray(expectedAnswers) ||
      expectedAnswers.length === 0
    ) {
      logger.warn("Missing userAnswer or expectedAnswer", {
        userAnswer,
        expectedAnswers,
      });
      return NextResponse.json(
        { error: "Missing userAnswer or expectedAnswer" },
        { status: 400 },
      );
    }

    console.log(`expectedAnswer = ${expectedAnswers}`);

    // 3. --- NEW LOCAL CHECK ---
    // Perform a simple, case-insensitive check against the array.
    // You can make this more robust (e.g., kana conversion), but this is a good start.
    const isMatch = expectedAnswers.some(
      (ans) => ans.toLowerCase() === userAnswer.toLowerCase(),
    );

    if (isMatch) {
      logger.info("Local answer check: PASS", { userAnswer, expectedAnswers });
      // Return the "pass" JSON immediately, skipping the AI call
      // TODO return and evaluationResult object here
      return NextResponse.json({
        result: "pass",
        explanation: "Correct!", // Matches the AI's success schema
      });
    }

    logger.info("Local answer check: FAIL. Escalating to AI.", {
      userAnswer,
      expectedAnswers,
    });

    const systemPrompt = `You are an AISRS evaluator. A user is being quizzed.
- The question was: "${question || "N/A"}"
- The topic was: "${topic || "N/A"}"
- The expected answer(s) are: "${JSON.stringify(expectedAnswers)}"
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

    const userMessage = `User Answer: ${userAnswer}\nExpected: ${JSON.stringify(expectedAnswers)}`; // Simple message for logging

    // --- Create Initial Log Entry ---
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/api/evaluate-answer",
      status: "pending",
      modelUsed: MODEL_NAME,
      requestData: {
        // systemPrompt, // Optional: Log prompt if needed, can be large
        userMessage: userMessage, // Log the core data
        // Also log the inputs separately for clarity
        input_userAnswer: userAnswer,
        input_expectedAnswer: JSON.stringify(expectedAnswers),
        input_question: question,
        input_topic: topic,
      },
    };
    logRef = await db.collection(API_LOGS_COLLECTION).add(initialLogData);

    // 1. Initialize the client
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }

    const client = new GoogleGenAI({ apiKey });

    try {
      // 2. Make the call using the SDK
      const response = await client.models.generateContent({
        model: MODEL_NAME,
        contents: [
          {
            parts: [
              {
                text: `User Answer: ${userAnswer}\nExpected: ${JSON.stringify(expectedAnswers)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              result: { type: "STRING", enum: ["pass", "fail"] },
              explanation: { type: "STRING" },
            },
            required: ["result", "explanation"],
          },
        },
      });

      // 3. Extract text using the SDK's helper method
      const aiJsonText = response.text;

      if (!aiJsonText) {
        logger.error("Empty response text from Gemini SDK", { response });
        throw new Error("Invalid response structure from Gemini");
      }

      // 4. Parse and validate (keeping your existing robust parsing logic)
      let evaluationResult;
      try {
        evaluationResult = JSON.parse(aiJsonText);
      } catch (parseError) {
        logger.error("Failed to parse AI JSON response", {
          aiJsonText,
          parseError,
        });
        throw new Error("Failed to parse AI JSON response");
      }

      if (!evaluationResult) {
        throw new Error(
          "Evaluation result is missing after AI response parsing.",
        );
      }

      logger.info(`Evaluation result: ${evaluationResult.result}`);
      return NextResponse.json(evaluationResult);
    } catch (error: any) {
      // Catch SDK errors (like 400/500 responses which throw in the SDK)
      logger.error("Gemini API Error", { error: error.message || error });
      throw error; // re-throw to be handled by the caller or Next.js error boundary
    }
  } catch (error) {
    errorOccurred = true; // Set flag
    capturedError = error; // Capture error for finally block

    // Log the error using the robust logger from previous steps
    logger.error("--- UNHANDLED ERROR IN evaluate-answer POST ---");
    let errorDetails: any = {};
    let errorMessage = "An unknown error occurred";
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        errorMessage = `Network error during API call: ${error.message}`;
      }
    } else {
      try {
        errorDetails = { rawError: JSON.stringify(error, null, 2) };
        errorMessage = `Non-Error exception: ${errorDetails.rawError}`;
      } catch (e) {
        errorDetails = { rawError: "Failed to stringify non-Error object" };
        errorMessage = "An un-stringifiable error object was caught.";
      }
    }
    logger.error("Failed in /api/evaluate-answer", errorDetails);

    // Return error response to client
    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 },
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
        updateData.status = "error";
        let errorDetails: any = {};
        if (capturedError instanceof Error) {
          errorDetails = {
            message: capturedError.message,
            stack: capturedError.stack,
          };
        } else {
          try {
            errorDetails = { rawError: JSON.stringify(capturedError, null, 2) };
          } catch {
            errorDetails = { rawError: "Unstringifiable error" };
          }
        }
        updateData.errorData = errorDetails;
      } else {
        updateData.status = "success";
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
        logger.error(`Failed to update log entry ${logRef.id}`, {
          logUpdateError,
        });
      }
    }
    // --- End Log ---
  }
}
