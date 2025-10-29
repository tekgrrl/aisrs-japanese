import { NextResponse } from 'next/server';

// Read the API key from the environment variable
const apiKey = process.env.GEMINI_API_KEY || '';
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

/**
 * POST /api/evaluate-answer
 * Evaluates a user's answer against an expected answer.
 * Expects: { userAnswer: string, expectedAnswer: string }
 * Returns: { result: 'pass' | 'fail', explanation: string }
 */
export async function POST(request: Request) {
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing GEMINI_API_KEY environment variable' },
      { status: 500 }
    );
  }

  try {
    const { userAnswer, expectedAnswer, question, topic } = await request.json();

    if (userAnswer === undefined || expectedAnswer === undefined) {
      return NextResponse.json(
        { error: 'Missing "userAnswer" or "expectedAnswer" in body' },
        { status: 400 }
      );
    }

    // Phase 3.3: AI Answer Evaluator
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
    const userQuery = `Expected: "${expectedAnswer}"\nUser: "${userAnswer}"`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
    };

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error('Gemini API Error:', errorBody);
      throw new Error(`Gemini API failed with status ${apiResponse.status}`);
    }

    const result = await apiResponse.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('Invalid response from Gemini API');
    }

    // Parse the multi-line response
    const lines = text.trim().split('\n');
    const explanation = lines.slice(0, -1).join(' ').trim(); // All lines except the last
    const verdict = lines[lines.length - 1].trim().toLowerCase(); // Just the last line

    if (verdict !== 'pass' && verdict !== 'fail') {
      console.error('Invalid verdict from AI:', verdict);
      throw new Error('AI returned an invalid verdict.');
    }

    return NextResponse.json({
      result: verdict, // 'pass' or 'fail'
      explanation: explanation || (verdict === 'pass' ? 'Correct.' : 'Incorrect.'),
    });
  } catch (error) {
    console.error('Error in /api/evaluate-answer:', error);
    // --- FIX: Type-safe error handling ---
    let errorMessage = 'An unknown error occurred';

    if (error instanceof Error) {
      // Now TypeScript knows 'error' is an Error object
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else {
      // Handle other cases, e.g., plain objects
      try {
        errorMessage = JSON.stringify(error);
      } catch {
        errorMessage = 'An un-stringifiable error object was caught.';
      }
    }
    // --- END FIX ---
    return NextResponse.json(
      { error: errorMessage || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}

