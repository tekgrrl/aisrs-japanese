import { NextResponse } from 'next/server';
import {
  db,
  KNOWLEDGE_UNITS_COLLECTION,
  REVIEW_FACETS_COLLECTION,
} from '@/lib/firebase';
import { KnowledgeUnit, ReviewFacet, ReviewItem } from '@/types';
import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';
import { FacetType } from '@/types';
import { GoogleGenAI } from '@google/genai'; // TODO this module is deprecated


// GET Review Facets
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dueOnly = searchParams.get('due') === 'true';

  if (dueOnly) {
    // --- Get DUE items for Review Session ---
    logger.info('GET /api/review-facets?due=true - Fetching due items');
    try {
      const now = new Date().toISOString();
      const dueFacetsSnapshot = await db
        .collection(REVIEW_FACETS_COLLECTION)
        .where('nextReviewAt', '<=', now)
        .get();

      if (dueFacetsSnapshot.empty) {
        logger.info('GET /api/review-facets?due=true - No due items found.');
        return NextResponse.json([]);
      }

      const dueFacets: ReviewFacet[] = [];
      dueFacetsSnapshot.forEach((doc) => {
        dueFacets.push({
          id: doc.id,
          ...doc.data(),
        } as ReviewFacet);
      });

      // --- Batch fetch parent KUs to avoid N+1 queries ---
      const kuIds = [...new Set(dueFacets.map((facet) => facet.kuId))];
      if (kuIds.length === 0) {
        logger.info('GET /api/review-facets?due=true - No KUs to fetch.');
        return NextResponse.json([]);
      }

      const kusSnapshot = await db
        .collection(KNOWLEDGE_UNITS_COLLECTION)
        .where(FieldPath.documentId(), 'in', kuIds)
        .get();

      const kuMap = new Map<string, KnowledgeUnit>();
      kusSnapshot.forEach((doc) => {
        const data = doc.data();
        kuMap.set(doc.id, {
          id: doc.id,
          ...data,
          // Convert Timestamp for client
          createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
        } as KnowledgeUnit);
      });

      // --- Join facets and KUs ---
      const reviewItems: ReviewItem[] = dueFacets
        .map((facet) => {
          const ku = kuMap.get(facet.kuId);
          if (!ku) {
            logger.warn(
              `GET /api/review-facets?due=true - Orphan facet found: ${facet.id} (KU ID: ${facet.kuId})`
            );
            return null; // Handle orphan facets
          }
          return { facet, ku };
        })
        .filter((item): item is ReviewItem => item !== null); // Filter out orphans

      logger.info(
        `GET /api/review-facets?due=true - Returning ${reviewItems.length} due items.`
      );
      return NextResponse.json(reviewItems);
    } catch (error) {
      logger.error('GET /api/review-facets?due=true - Error', error);
      return NextResponse.json(
        { error: 'Failed to fetch due review items' },
        { status: 500 }
      );
    }
  } else {
    // --- Get ALL items for Manage Page ---
    logger.info('GET /api/review-facets - Fetching all facets');
    try {
      const snapshot = await db.collection(REVIEW_FACETS_COLLECTION).get();
      if (snapshot.empty) {
        return NextResponse.json([]);
      }
      const facets: ReviewFacet[] = [];
      snapshot.forEach((doc) => {
        facets.push({
          id: doc.id,
          ...doc.data(),
        } as ReviewFacet);
      });
      logger.info(
        `GET /api/review-facets - Returning ${facets.length} total facets.`
      );
      return NextResponse.json(facets);
    } catch (error) {
      logger.error('GET /api/review-facets - Error', error);
      return NextResponse.json(
        { error: 'Failed to fetch review facets' },
        { status: 500 }
      );
    }
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

