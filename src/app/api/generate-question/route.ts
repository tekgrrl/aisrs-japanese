import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger'; // Import the new logger

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const topic = searchParams.get('topic');
  logger.info(`Generating question for topic: ${topic}`); // LOG: Start

  if (!topic) {
    logger.error('Topic parameter is required'); // LOG: Error
    return NextResponse.json(
      { error: 'Topic parameter is required' },
      { status: 400 }
    );
  }

  // Read the API key from the environment variable
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    logger.error('API key not configured'); // LOG: Error
    return NextResponse.json(
      { error: 'API key not configured' },
      { status: 500 }
    );
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  // Updated prompt with new rules
  const systemPrompt = `You are an expert Japanese tutor.
Your task is to generate a single fill-in-the-blank quiz question based on a user's learning topic.
The user is learning about: "${topic}"

RULES:
1.  Generate a single, complete Japanese sentence for the question.
2.  The blank must be represented by exactly this string: [____]
3.  The blank should test the core of the user's topic.
4.  Provide the single, most correct word or phrase that fills the blank as the "answer".
5.  If context is needed, provide a *brief* (1-2 lines) explanation of the situation.
6.  All context *must* be in English.
7.  Your entire response *must* be a single, valid JSON object, with only two keys: "question" and "answer".
8.  IMPORTANT: Do not include any literal newline characters (\\n) inside the "question" or "answer" string values.
9.  NEW: The combination of context and question MUST lead to a single, unambiguous correct answer. Avoid questions that could plausibly be answered by two different words from the topic.

Example 1:
User topic: "Using 'kore', 'sore', 'are'"
{
  "question": "Context: Pointing to a map far away from both speaker and listener.\n[____] は日本の地図です。",
  "answer": "あれ"
}

Example 2:
User topic: "Giving and Receiving (ageru, kureru, morau)"
{
  "question": "Context: Your friend gave you a gift.\n山田さんは私にプレゼントを [____]。",
  "answer": "くれました"
}

Example 3:
User topic: "Particle 'de' for location of action"
{
  "question": "私は図書館 [____] 勉強します。",
  "answer": "で"
}`;

  const payload = {
    contents: [{ parts: [{ text: 'Generate a new question.' }] }],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.8, // Add some variability
    },
  };

  try {
    // --- Exponential Backoff ---
    let response: Response;
    let attempts = 0;
    const maxAttempts = 5;
    let delay = 1000; // start with 1 second

    while (attempts < maxAttempts) {
      logger.debug(`API Call Attempt ${attempts + 1}`); // LOG: Debug
      // @ts-ignore
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        break; // Success
      }

      if (response.status === 429 || response.status >= 500) {
        // Throttling or server error
        attempts++;
        logger.warn(`API failed with status ${response.status}. Retrying...`); // LOG: Warn
        if (attempts >= maxAttempts) {
          logger.error(`API failed after ${attempts} attempts`); // LOG: Error
          return NextResponse.json(
            { error: `API failed after ${attempts} attempts` },
            { status: 500 }
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Double the delay
      } else {
        // Other client error
        const errData = await response.json();
        logger.error('API client error', errData); // LOG: Error
        return NextResponse.json(
          { error: errData.error?.message || 'API error' },
          { status: response.status }
        );
      }
    }

    // @ts-ignore
    const result = await response.json();
    const candidate = result.candidates?.[0];

    if (!candidate || !candidate.content?.parts?.[0]?.text) {
      logger.error('Invalid API response structure', result); // LOG: Error
      return NextResponse.json(
        { error: 'Invalid API response structure' },
        { status: 500 }
      );
    }

    const jsonText = candidate.content.parts[0].text;

    // --- START FIX: Clean the JSON response ---
    logger.debug('Raw AI Response:', { text: jsonText }); // LOG: Debug

    const startIndex = jsonText.indexOf('{');
    const endIndex = jsonText.lastIndexOf('}');

    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      logger.error('Failed to find valid JSON object in AI response', {
        // LOG: Error
        text: jsonText,
      });
      return NextResponse.json(
        { error: 'AI response did not contain valid JSON' },
        { status: 500 }
      );
    }

    let cleanedJsonText = jsonText.slice(startIndex, endIndex + 1);

    // --- START NEW FIX: Sanitize control characters ---
    // Remove literal newlines, tabs, and other control chars
    // that are invalid inside a JSON string literal.
    const sanitizedJsonText = cleanedJsonText
      .replace(/[\n\r\t]/g, ' ') // Replace newlines, tabs, CR with a space
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove other non-printable control chars

    logger.debug('Sanitized JSON:', { text: sanitizedJsonText }); // LOG: Debug
    // --- END NEW FIX ---

    let parsedJson;
    try {
      parsedJson = JSON.parse(sanitizedJsonText); // Parse the *sanitized* text
    } catch (parseError) {
      logger.error(
        // LOG: Error
        'Failed to parse sanitized JSON:',
        parseError,
        { text: sanitizedJsonText }
      );
      return NextResponse.json(
        { error: 'Failed to parse JSON from AI response' },
        { status: 500 }
      );
    }
    // --- END FIX ---

    if (!parsedJson.question || !parsedJson.answer) {
      logger.error('Generated JSON is missing keys', parsedJson); // LOG: Error
      return NextResponse.json(
        { error: 'Generated JSON is missing question or answer' },
        { status: 500 }
      );
    }

    logger.info('Successfully generated question', parsedJson); // LOG: Info
    return NextResponse.json(parsedJson);
  } catch (error) {
    logger.error('Unhandled exception in generate-question', error); // LOG: Error
    // @ts-ignore
    return NextResponse.json(
      // @ts-ignore
      { error: error.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}

