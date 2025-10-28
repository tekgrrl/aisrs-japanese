import { NextResponse } from 'next/server';
import { db, KNOWLEDGE_UNITS_COLLECTION } from '@/lib/firebase';
import { logger } from '@/lib/logger';
import { KnowledgeUnit } from '@/types';

export async function POST(request: Request) {
  logger.info('POST /api/generate-lesson - Generating new lesson');
  try {
    const { kuId } = await request.json();
    if (!kuId) {
      logger.warn('POST /api/generate-lesson - kuId is required');
      return NextResponse.json({ error: 'kuId is required' }, { status: 400 });
    }

    const kuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(kuId);
    const kuDoc = await kuRef.get();

    if (!kuDoc.exists) {
      logger.warn(
        `POST /api/generate-lesson - KnowledgeUnit not found for ID: ${kuId}`
      );
      return NextResponse.json(
        { error: 'KnowledgeUnit not found' },
        { status: 404 }
      );
    }

    const ku = kuDoc.data() as Omit<KnowledgeUnit, 'id'>;

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      logger.error('API key not configured');
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const systemPrompt = `You are an expert Japanese tutor. Your task is to generate a structured, WaniKani-style lesson for a given vocabulary word or concept. You MUST return ONLY a valid JSON object with the following schema:
    {
      "meaning_explanation": "A detailed explanation of the word's meaning and nuance.",
      "reading_explanation": "An explanation of the reading (e.g., kun'yomi vs on'yomi, when to use it).",
      "context_examples": [
        { "sentence": "Example sentence in Japanese.", "translation": "English translation." }
      ],
      "component_kanji": [
        { "kanji": "Single Kanji character", "reading": "Its primary reading", "meaning": "Its core meaning" }
      ]
    }
    - If the vocabulary is hiragana-only, use the hiragana characters as the 'kanji' for the component_kanji section.
    - Always provide at least two context examples.
    - Do not include any text, markdown, or formatting outside of the JSON object itself.`;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: `Generate a lesson for this Knowledge Unit: ${JSON.stringify(
                ku
              )}`,
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
      },
    };

    let response: Response;
    let attempts = 0;
    const maxAttempts = 5;
    let delay = 1000; // start with 1 second

    while (attempts < maxAttempts) {
      logger.debug(`API Call Attempt ${attempts + 1}`);
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
        attempts++;
        logger.warn(`API failed with status ${response.status}. Retrying...`);
        if (attempts >= maxAttempts) {
          logger.error(`API failed after ${attempts} attempts`);
          return NextResponse.json(
            { error: `API failed after ${attempts} attempts` },
            { status: 500 }
          );
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        const errData = await response.json();
        logger.error('API client error', errData);
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
      logger.error('Invalid API response structure', result);
      return NextResponse.json(
        { error: 'Invalid API response structure' },
        { status: 500 }
      );
    }

    const jsonText = candidate.content.parts[0].text;
    logger.debug('Raw AI Response:', { text: jsonText });

    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error(
        'Failed to parse JSON',
        parseError,
        { text: jsonText }
      );
      return NextResponse.json(
        { error: 'Failed to parse JSON from AI response' },
        { status: 500 }
      );
    }

    logger.info(`POST /api/generate-lesson - Successfully generated lesson for KU ${kuId}`);
    return NextResponse.json(parsedJson);

  } catch (error) {
    logger.error('POST /api/generate-lesson - Error', error);
    // @ts-ignore
    return NextResponse.json(
      // @ts-ignore
      { error: error.message || 'An unknown error occurred' },
      { status: 500 }
    );
  }
}