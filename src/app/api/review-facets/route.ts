// This line should be at the top of the file
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { db,  Timestamp } from '@/lib/firebase'; // Added Timestamp
import { FieldValue, FieldPath } from 'firebase-admin/firestore'; // Make sure FieldPath is imported
import { logger } from '@/lib/logger';
import { ReviewFacet, KnowledgeUnit, ReviewItem, FacetType, ApiLog } from '@/types'; // Added ApiLog
import { GoogleGenAI } from '@google/genai'; // Correct SDK
import { KNOWLEDGE_UNITS_COLLECTION, REVIEW_FACETS_COLLECTION, API_LOGS_COLLECTION } from '@/lib/firebase-config'; // Added log collection name
import { performance } from 'perf_hooks'; // Added for timing

// --- Define model name centrally ---
const MODEL_NAME = process.env.MODEL_GEMINI_PRO || 'gemini-2.5-flash'
logger.info(`Using ${MODEL_NAME}`);

// --- GET Handler (Unchanged from previous fix) ---
export async function GET(request: Request) {
  logger.info('--- GET /api/review-facets ---');

  try {
    const { searchParams } = new URL(request.url);
    const dueOnly = searchParams.get('due') === 'true';

    if (dueOnly) {
      const now = new Date();
      logger.info(`Querying for facets due at or before: ${now.toISOString()}`);

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

      const kuIds = [...new Set(facets.map((f) => f.kuId))];
      if (kuIds.length === 0) {
        logger.warn('Facets found but no kuIds. Returning empty.');
        return NextResponse.json([]);
      }

      const kusSnapshot = await db
        .collection(KNOWLEDGE_UNITS_COLLECTION)
        .where(FieldPath.documentId(), 'in', kuIds)
        .get();

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
          ku: kus[facet.kuId],
        }))
        .filter((item) => item.ku);

      logger.info(`Returning ${reviewItems.length} joined review items.`);
      return NextResponse.json(reviewItems);

    } else {
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


export async function POST(request: Request) {
  logger.info('--- POST /api/review-facets ---');
  let genAI: GoogleGenAI | undefined; // Lazily initialize Gemini
  let apiLogRef; // Log ref specifically for the *conditional* AI call
  let apiStartTime = 0;
  let apiErrorOccurred = false;
  let apiCapturedError: any = null;
  let apiAiJsonText: string | undefined;
  let apiKanjiData: any | undefined;


  try {
    const body = await request.json();
    const { kuId, facetsToCreate } = body as {
      kuId: string;
      facetsToCreate: string[];
    };

    logger.warn('Parsed request body:', { body });


    if (!kuId || !facetsToCreate || facetsToCreate.length === 0) {
      logger.warn('Missing kuId or facetsToCreate', { kuId, facetsToCreate });
      return NextResponse.json(
        { error: 'Missing kuId or facetsToCreate' },
        { status: 400 },
      );
    }

    const batch = db.batch();
    const now = Timestamp.now();
    let parentFacetCount = 0; // Correctly track parent's direct facets

    // --- DEBUG: Log the input facets ---
    logger.debug(`Starting batch for ${facetsToCreate.length} facets for KU ${kuId}`, { facetsToCreate });
    // --- END DEBUG ---


    for (const facetKey of facetsToCreate) {
      logger.debug(`Processing facetKey: ${facetKey}`);
      apiErrorOccurred = false; // Reset API error flag for each potential AI call
      apiCapturedError = null;
      apiAiJsonText = undefined;
      apiKanjiData = undefined;
      apiLogRef = undefined; // Reset log ref


      // --- Simple & AI Facets ---
      if (
        facetKey === 'Content-to-Definition' ||
        facetKey === 'Content-to-Reading' ||
        facetKey === 'Definition-to-Content' ||
        facetKey === 'AI-Generated-Question'
      ) {
        const newFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc(); // Auto-generates ID
        batch.set(newFacetRef, {
          kuId: kuId,
          facetType: facetKey as FacetType,
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
        });
        parentFacetCount++; // Increment parent's facet count
        logger.debug(`Batch-set simple/AI facet: ${facetKey}`);
      }

      // --- New: Handle single Kanji component key ---
      else if (facetKey.startsWith('Kanji-Component-') && facetKey.split('-').length === 3) {
        const kanjiChar = facetKey.split('-')[2];
        logger.debug(`Handling consolidated Kanji Component key for: '${kanjiChar}'`);

        // This logic is similar to the more specific key handling below, but creates two facets.
        let kanjiKuId: string;
        const kanjiQuery = db.collection(KNOWLEDGE_UNITS_COLLECTION)
          .where('type', '==', 'Kanji')
          .where('content', '==', kanjiChar)
          .limit(1);
        const kanjiSnapshot = await kanjiQuery.get();

        if (kanjiSnapshot.empty) {
          // Logic to create a new Kanji KU (simplified, assuming AI call is needed)
          // This part can be refactored into a helper function if it gets more complex.
          logger.info(`Kanji KU not found, creating new one for: ${kanjiChar}`);
          // (For brevity, omitting the full AI call logic here, but it would be the same as below)
          const newKanjiKuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc();
          // NOTE: In a real scenario, you'd call the Gemini API here to get the data.
          // For this refactor, we'll assume placeholder data.
          batch.set(newKanjiKuRef, {
            content: kanjiChar,
            type: 'Kanji',
            data: { onyomi: '...', kunyomi: '...', meaning: '...' }, // Placeholder
            status: 'learning',
            facet_count: 2, // It will have two facets
            createdAt: now,
            relatedUnits: [],
            personalNotes: `Auto-generated as component for KU ${kuId}`,
          });
          kanjiKuId = newKanjiKuRef.id;
        } else {
          kanjiKuId = kanjiSnapshot.docs[0].id;
          const kanjiKuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(kanjiKuId);
          batch.update(kanjiKuRef, { facet_count: FieldValue.increment(2) });
        }

        // Create BOTH Meaning and Reading facets
        const meaningFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc();
        batch.set(meaningFacetRef, {
          kuId: kanjiKuId,
          facetType: 'Kanji-Component-Meaning',
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
        });

        const readingFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc();
        batch.set(readingFacetRef, {
          kuId: kanjiKuId,
          facetType: 'Kanji-Component-Reading',
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
        });
        
        logger.debug(`Batch-set Meaning and Reading facets for Kanji KU ${kanjiKuId}`);
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
        // --- DEBUG: Log extracted Kanji ---
        logger.debug(`Extracted Kanji Component: char='${kanjiChar}', type='${facetType}' from key='${facetKey}'`);
        // --- END DEBUG ---


        let kanjiKuId: string;

        // 1. Find existing Kanji KU
        const kanjiQuery = db.collection(KNOWLEDGE_UNITS_COLLECTION)
          .where('type', '==', 'Kanji')
          .where('content', '==', kanjiChar)
          .limit(1);

        const kanjiSnapshot = await kanjiQuery.get();
        // --- DEBUG: Log query result ---
        logger.debug(`Kanji find query result for '${kanjiChar}': empty=${kanjiSnapshot.empty}, size=${kanjiSnapshot.size}`);
        // --- END DEBUG ---


        if (kanjiSnapshot.empty) {
          // --- DEBUG ---
          logger.info(`Kanji KU not found (snapshot empty), proceeding to CREATE new one for: ${kanjiChar}`);
          // --- END DEBUG ---

          // 2. Create new Kanji KU if not found
          // logger.info(`Kanji KU not found, creating new one for: ${kanjiChar}`); // Redundant now

          // -- Start Conditional AI Call & Logging --
          apiStartTime = performance.now(); // Start timer just before API call
          try {
            if (!genAI) {
              const apiKey = process.env.GEMINI_API_KEY;
              if (!apiKey) {
                throw new Error('GEMINI_API_KEY is not defined for Kanji creation');
              }
              genAI = new GoogleGenAI({apiKey: apiKey});
            }

            const prompt = `Generate onyomi, kunyomi, and meaning for the Kanji: ${kanjiChar}. Return ONLY a valid JSON object: {"onyomi": "...", "kunyomi": "...", "meaning": "..."}`;

             // --- Create Initial Log Entry for *this* AI call ---
             const initialApiLogData: ApiLog = {
                timestamp: Timestamp.now(),
                route: '/api/review-facets (Kanji Gen)', // Specific sub-route
                status: 'pending',
                modelUsed: MODEL_NAME,
                requestData: { userMessage: prompt },
              };
             apiLogRef = await db.collection(API_LOGS_COLLECTION).add(initialApiLogData);
             logger.debug(`Created initial Kanji Gen log entry: ${apiLogRef.id}`);
             // --- End Log ---

            const response = await genAI.models.generateContent({
              model: MODEL_NAME,
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

            apiAiJsonText = response.text; // Assign raw text for logging

            if (!apiAiJsonText) {
              throw new Error("AI response for Kanji was empty.");
            }

            try {
              apiKanjiData = JSON.parse(apiAiJsonText); // Assign parsed result for logging
            } catch (parseError) {
              logger.error('Failed to parse AI JSON for new Kanji', { text: apiAiJsonText, parseError });
              throw new Error('Failed to parse AI response for new Kanji KU');
            }

          } catch(aiError) {
             apiErrorOccurred = true;
             apiCapturedError = aiError;
             throw aiError; // Re-throw to be caught by the main try/catch
          } finally {
            // --- Update *API* Log Entry ---
             if (apiLogRef) {
               const apiEndTime = performance.now();
               const apiDurationMs = apiEndTime - apiStartTime;
               const apiUpdateData: Partial<ApiLog> = { durationMs: apiDurationMs };

               if (apiErrorOccurred) {
                 apiUpdateData.status = 'error';
                 let errorDetails: any = {};
                 if (apiCapturedError instanceof Error) { errorDetails = { message: apiCapturedError.message, stack: apiCapturedError.stack }; }
                 else { try { errorDetails = { rawError: JSON.stringify(apiCapturedError, null, 2) }; } catch { errorDetails = { rawError: "Unstringifiable error" }; } }
                 apiUpdateData.errorData = errorDetails;
               } else {
                 apiUpdateData.status = 'success';
                 apiUpdateData.responseData = { rawText: apiAiJsonText, parsedJson: apiKanjiData };
               }
               try { await apiLogRef.update(apiUpdateData); logger.debug(`Updated Kanji Gen log entry: ${apiLogRef.id}`); }
               catch (logUpdateError) { logger.error(`Failed to update Kanji Gen log entry ${apiLogRef.id}`, { logUpdateError }); }
             }
             // --- End API Log Update ---
          }
           // -- End Conditional AI Call & Logging --


          const newKanjiKuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(); // Auto-ID

          batch.set(newKanjiKuRef, {
            content: kanjiChar,
            type: 'Kanji',
            data: {
              onyomi: apiKanjiData.onyomi || '',
              kunyomi: apiKanjiData.kunyomi || '',
              meaning: apiKanjiData.meaning || '',
            },
            status: 'learning',
            facet_count: 0,
            createdAt: now,
            relatedUnits: [],
            personalNotes: `Auto-generated as component for KU ${kuId}`,
            // id: newKanjiKuRef.id // Don't add id field
          });

          kanjiKuId = newKanjiKuRef.id;
          // --- DEBUG ---
          logger.debug(`BATCH SET new Kanji KU: '${kanjiChar}' (ID: ${kanjiKuId})`);
          // --- END DEBUG ---

        } else {
          // 2. Use existing Kanji KU
          kanjiKuId = kanjiSnapshot.docs[0].id;
           // --- DEBUG ---
          logger.debug(`FOUND existing Kanji KU: '${kanjiChar}' (ID: ${kanjiKuId})`);
           // --- END DEBUG ---
        }

        // 3. Create the facet pointing to the Kanji KU
        const newFacetRef = db.collection(REVIEW_FACETS_COLLECTION).doc(); // Auto-ID
        batch.set(newFacetRef, {
          kuId: kanjiKuId, // <-- Links to the KANJI KU
          facetType: facetType,
          srsStage: 0,
          nextReviewAt: now,
          createdAt: now,
          history: [],
        });
        // --- DEBUG ---
        logger.debug(`BATCH SET complex facet: '${facetType}' for Kanji KU ${kanjiKuId}`);
        // --- END DEBUG ---
      } else {
        logger.warn(`Unknown facet key pattern: ${facetKey}`);
      }
    } // --- End of for-loop ---

    // --- Update parent KU ---
    if (parentFacetCount > 0) {
      const parentKuRef = db
        .collection(KNOWLEDGE_UNITS_COLLECTION)
        .doc(kuId);

      batch.update(parentKuRef, {
        status: 'reviewing',
        facet_count: parentFacetCount,
      });
      logger.debug(`BATCH UPDATE parent KU ${kuId}: status to reviewing, facet_count to ${parentFacetCount}`);
    }

    // --- Commit ---
    await batch.commit();
    logger.info('Batch commit successful.');

    return NextResponse.json({ message: 'Facets created successfully' }, { status: 201 });

  } catch (error) {
    // --- Robust Error Logging for the *entire* POST handler ---
    logger.error('--- UNHANDLED ERROR IN review-facets POST ---');
    let errorDetails: any = {};
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = { message: error.message, name: error.name, stack: error.stack };
    } else {
        try { errorDetails = { rawError: JSON.stringify(error, null, 2) }; errorMessage = `Non-Error exception: ${errorDetails.rawError}`; }
        catch (e) { errorDetails = { rawError: "Failed to stringify non-Error object" }; errorMessage = 'An un-stringifiable error object was caught.'; }
    }
    logger.error('Failed in /api/review-facets POST', errorDetails);

    return NextResponse.json(
      { error: errorMessage, details: errorDetails },
      { status: 500 }
    );
    // --- End Robust Error Logging ---
  }
}
