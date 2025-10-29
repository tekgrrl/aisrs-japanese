export const dynamic = 'force-dynamic'; // <-- ADD THIS LINE


import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { KNOWLEDGE_UNITS_COLLECTION, REVIEW_FACETS_COLLECTION } from '@/lib/firebase-config';
import { KnowledgeUnit, ReviewFacet, ReviewItem } from '@/types';
import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';
import { FacetType } from '@/types';
import { GoogleGenAI } from '@google/genai'; 


// GET Review Facets
// --- GET Handler ---
export async function GET(request: Request) {
  logger.info('--- GET /api/review-facets ---');
  try {
    const { searchParams } = new URL(request.url);
    const dueOnly = searchParams.get('due') === 'true';

    if (dueOnly) {
      // Logic for /review page (due facets + joined KU data)
      
      // --- FIX: Use new Date() instead of Timestamp.now() ---
      // This is more robust against potential clock-skew issues.
      const now = new Date(); 
      logger.info(`Querying for facets due at or before: ${now.toISOString()}`);
      // --- END FIX ---

      const dueFacetsSnapshot = await db
        .collection(REVIEW_FACETS_COLLECTION)
        .where('nextReviewAt', '<=', now)
        .get();

      if (dueFacetsSnapshot.empty) {
        logger.info('GET /api/review-facets?due=true - No due items found.');
        return NextResponse.json([]);
      }

      const facets = dueFacetsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ReviewFacet[];

      logger.info(`Found ${facets.length} due facet documents.`);

      // Get unique KU IDs to fetch in a batch
      const kuIds = [...new Set(facets.map((f) => f.kuId))];
      if (kuIds.length === 0) {
        logger.warn('Facets found but no kuIds. Returning empty.');
        return NextResponse.json([]);
      }

      // --- FIX: Use FieldPath.documentId() for the 'in' query ---
      const kusSnapshot = await db
        .collection(KNOWLEDGE_UNITS_COLLECTION)
        .where(FieldPath.documentId(), 'in', kuIds)
        .get();
      // --- END FIX ---

      if (kusSnapshot.empty) {
        logger.warn(`No parent KUs found for ${kuIds.length} IDs.`);
        return NextResponse.json([]);
      }

      const kus = kusSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = { id: doc.id, ...doc.data() } as KnowledgeUnit;
        return acc;
      }, {} as Record<string, KnowledgeUnit>);

      const reviewItems: ReviewItem[] = facets
        .map((facet) => ({
          facet: facet,
          ku: kus[facet.kuId], // Join KU data
        }))
        .filter((item) => item.ku); // Filter out any facets with missing KUs

      logger.info(`Returning ${reviewItems.length} joined review items.`);
      return NextResponse.json(reviewItems);

    } else {
      // Logic for /manage page (all facets)
      logger.info('GET /api/review-facets - Fetching all facets for manage page.');
      const querySnapshot = await db
        .collection(REVIEW_FACETS_COLLECTION)
        .get();
      const facets = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      logger.info(`Returning ${facets.length} total review facets.`);
      return NextResponse.json(facets);
    }
  } catch (error) {
    logger.error('Failed to GET review facets', { error });
    if (error instanceof Error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    return NextResponse.json({ error: 'Failed to fetch review facets' }, { status: 500 });
  }
}


          // --- POST Handler (Refactored) ---
export async function POST(request: Request) {
  logger.info('--- POST /api/review-facets ---');
  let genAI: GoogleGenAI | undefined; // Lazily initialize Gemini

  try {
    const { kuId, facetsToCreate } = (await request.json()) as {
      kuId: string;
      facetsToCreate: string[];
    };

    if (!kuId || !facetsToCreate || facetsToCreate.length === 0) {
      logger.warn('Missing kuId or facetsToCreate', { kuId, facetsToCreate });
      return NextResponse.json(
        { error: 'Missing kuId or facetsToCreate' },
        { status: 400 },
      );
    }

    const batch = db.batch();
    const now = Timestamp.now();
    const newFacetCount = facetsToCreate.length;

    logger.debug(`Starting batch for ${newFacetCount} facets for KU ${kuId}`);

    for (const facetKey of facetsToCreate) {
      logger.debug(`Processing facetKey: ${facetKey}`);

      // --- Simple & AI Facets ---
      if (
        facetKey === 'Content-to-Definition' ||
        facetKey === 'Content-to-Reading' ||
        facetKey === 'Definition-to-Content' ||
        facetKey === 'AI-Generated-Question'
      ) {
        const newFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc();
        batch.set(newFacetRef, {
          kuId: kuId, 
          facetType: facetKey as FacetType,
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
        });
        logger.debug(`Batch-set simple facet: ${facetKey}`);
      }
      
      // --- Complex Kanji Facets ---
      else if (facetKey.startsWith('Kanji-Component-')) {
        const parts = facetKey.split('-'); 
        if (parts.length !== 4) {
          logger.warn(`Invalid kanji facet key: ${facetKey}`);
          continue; 
        }

        const facetType = ('Kanji-Component-' + parts[2]) as FacetType; 
        const kanjiChar = parts[3];   

        let kanjiKuId: string;

        // 1. Find existing Kanji KU
        const kanjiQuery = db.collection(KNOWLEDGE_UNITS_COLLECTION)
          .where('type', '==', 'Kanji')
          .where('content', '==', kanjiChar)
          .limit(1);

        const kanjiSnapshot = await kanjiQuery.get();

        if (kanjiSnapshot.empty) {
          // 2. Create new Kanji KU if not found
          logger.info(`Kanji KU not found, creating new one for: ${kanjiChar}`);

          if (!genAI) {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
              throw new Error('GEMINI_API_KEY is not defined for Kanji creation');
            }
            genAI = new GoogleGenAI({apiKey: apiKey}); // <-- CORRECT CLASS
          }
          
          const prompt = `Generate onyomi, kunyomi, and meaning for the Kanji: ${kanjiChar}. Return ONLY a valid JSON object: {"onyomi": "...", "kunyomi": "...", "meaning": "..."}`;
          
          // --- CORRECT "ONE-SHOT" PATTERN ---
          const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash-preview-09-2025', // Or your preferred model
            contents: [{ parts: [{ text: prompt }] }],
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  onyomi: { type: 'STRING' },
                  kunyomi: { type: 'STRING' },
                  meaning: { type: 'STRING' },
                },
                required: ['onyomi', 'kunyomi', 'meaning'],
              },
            },
          });

          // --- END CORRECT PATTERN ---          
          const text = response.text;

          let kanjiData: { onyomi: string; kunyomi: string; meaning: string; };
          try {
            // Because we set responseMimeType, text *is* the JSON string
            if (!text) {
              logger.error('AI response was empty or undefined', { response });
              throw new Error("AI response was empty or undefined.");
            }
            kanjiData = JSON.parse(text); 
          } catch (e) {
            logger.error('Failed to parse AI JSON for new Kanji', { text, error: e });
            throw new Error('Failed to parse AI response for new Kanji KU');
          }

          const newKanjiKuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc();
          
          batch.set(newKanjiKuRef, {
            content: kanjiChar,
            type: 'Kanji',
            data: {
              onyomi: kanjiData.onyomi || '',
              kunyomi: kanjiData.kunyomi || '',
              meaning: kanjiData.meaning || '',
            },
            status: 'learning', 
            facet_count: 0,
            createdAt: now,
            relatedUnits: [],
            personalNotes: `Auto-generated as component for KU ${kuId}`,
            id: newKanjiKuRef.id, // Add id to document
          });
          
          kanjiKuId = newKanjiKuRef.id;
          logger.debug(`Batch-set new Kanji KU: ${kanjiChar} (ID: ${kanjiKuId})`);


        } else {
          // 2. Use existing Kanji KU
          kanjiKuId = kanjiSnapshot.docs[0].id;
          logger.debug(`Found existing Kanji KU: ${kanjiChar} (ID: ${kanjiKuId})`);
        }

        // 3. Create the facet pointing to the Kanji KU
        const newFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc();
        batch.set(newFacetRef, {
          kuId: kanjiKuId, // <-- Links to the KANJI KU
          facetType: facetType,
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
          id: newFacetRef.id, // Add id to document
        });
        logger.debug(`Batch-set complex facet: ${facetType} for Kanji KU ${kanjiKuId}`);
      }
    } // --- End of for-loop ---

    // --- Update parent KU ---
    const parentKuRef = db
      .collection(KNOWLEDGE_UNITS_COLLECTION)
      .doc(kuId);

    batch.update(parentKuRef, {
      status: 'reviewing',
      facet_count: newFacetCount,
    });
    logger.debug(`Batch-update parent KU ${kuId}: status to reviewing, facet_count to ${newFacetCount}`);

    // --- Commit ---
    await batch.commit();
    logger.info('Batch commit successful.');

    return NextResponse.json({ message: 'Facets created successfully' }, { status: 201 });

  } catch (error) {
    logger.error('--- UNHANDLED ERROR IN review-facets POST ---');
    
    let errorDetails: any = {};

    if (error instanceof Error) {
      errorDetails = { 
        message: error.message, 
        stack: error.stack 
      };
    } else {
      try {
        errorDetails = {
          rawError: JSON.stringify(error, null, 2)
        };
      } catch (e) {
        errorDetails = { rawError: "Failed to stringify error object" };
      }
    }
    
    logger.error('Failed to create facets', errorDetails);

    return NextResponse.json(
      { error: 'An unknown error occurred', details: errorDetails.rawError || errorDetails.message },
      { status: 500 }
    );
  }
}

