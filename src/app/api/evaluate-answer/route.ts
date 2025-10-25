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
    const { userAnswer, expectedAnswer } = await request.json();

    if (userAnswer === undefined || expectedAnswer === undefined) {
      return NextResponse.json(
        { error: 'Missing "userAnswer" or "expectedAnswer" in body' },
        { status: 400 }
      );
    }

    // Phase 3.3: AI Answer Evaluator
    const systemPrompt = `You are an AI grading assistant for a Japanese language quiz.
You will be given an "expected answer" and a "user answer".
Your task is to determine if the user's answer is correct. Be lenient with kana vs kanji if the meaning is identical.
First, provide a brief, one-sentence explanation for *why* the answer is correct or incorrect.
Then, on a new line, provide the final verdict: the single word "pass" or "fail".

Example 1:
Expected: "食べられます"
User: "たべられます"
Response:
Your answer is correct, as "たべられます" is the hiragana spelling of "食べられます".
pass

Example 2:
Expected: "くれました"
User: "あげました"
Response:
Your answer is incorrect, as "あげました" (I gave) is the wrong direction; "くれました" (someone gave me) is correct here.
fail

Example 3:
Expected: "Cat"
User: "cat"
Response:
Your answer is correct.
pass
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
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}

