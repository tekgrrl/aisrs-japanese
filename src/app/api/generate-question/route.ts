import { NextResponse } from 'next/server';

// Read the API key from the environment variable
const apiKey = process.env.GEMINI_API_KEY || '';
const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

/**
 * GET /api/generate-question
 * Generates a dynamic quiz question for a given topic (KU content).
 * Expects: ?topic=...
 * Returns: { question: string, answer: string }
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is missing GEMINI_API_KEY environment variable' },
      { status: 500 }
    );
  }

  if (!topic) {
    return NextResponse.json(
      { error: 'Missing "topic" query parameter' },
      { status: 400 }
    );
  }

  try {
    // Phase 3.1: AI Question Generator
    const systemPrompt = `You are a Japanese language quiz generator.
You will be given a grammar point or concept.
Your task is to generate a *single*, concise "fill-in-the-blank" quiz question that tests this topic.
The question should be in Japanese. The blank should be represented by "（S）".
The answer should be the Japanese word/phrase that fills the blank.

Respond *only* with a valid JSON object in the format:
{"question": "...", "answer": "..."}

Example Topic: "Giving and Receiving (あげる, くれる, もらう)"
Example Response: {"question": "山田さんは私に本を（S）。", "answer": "くれました"}

Example Topic: "Potential Form (〜られる)"
Example Response: {"question": "私は納豆が（S）。", "answer": "食べられます"}
`;

    const userQuery = `Topic: "${topic}"`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
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

    // The model should return valid JSON, so we parse and return it
    const questionAnswer = JSON.parse(text);

    return NextResponse.json(questionAnswer); // Send { question, answer }
  } catch (error) {
    console.error('Error in /api/generate-question:', error);
    return NextResponse.json(
      { error: error.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}

