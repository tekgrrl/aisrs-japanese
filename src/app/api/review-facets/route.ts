import { NextResponse } from 'next/server';
import {
  db,
  KNOWLEDGE_UNITS_COLLECTION,
  REVIEW_FACETS_COLLECTION,
} from '@/lib/firebase';
import { KnowledgeUnit, ReviewFacet, ReviewItem } from '@/types';
import { Timestamp, FieldPath } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';

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

// POST new Review Facets for a KU
export async function POST(request: Request) {
  logger.info('POST /api/review-facets - Generating new facets');
  try {
    const { kuId } = await request.json();
    if (!kuId) {
      logger.warn('POST /api/review-facets - kuId is required');
      return NextResponse.json({ error: 'kuId is required' }, { status: 400 });
    }

    // Get the parent KU
    const kuRef = db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(kuId);
    const kuDoc = await kuRef.get();

    if (!kuDoc.exists) {
      logger.warn(
        `POST /api/review-facets - KnowledgeUnit not found for ID: ${kuId}`
      );
      return NextResponse.json(
        { error: 'KnowledgeUnit not found' },
        { status: 404 }
      );
    }

    const ku = kuDoc.data() as Omit<KnowledgeUnit, 'id'>;
    const now = new Date().toISOString();

    // Array to hold the data for new facets to be created
    const newFacetsData: Omit<ReviewFacet, 'id' | 'kuId'>[] = [];

    // --- Logic to create default facets based on KU type ---
    if (ku.type === 'Vocab') {
      // Check if data properties exist
      if (Object.prototype.hasOwnProperty.call(ku.data, 'definition')) {
        newFacetsData.push({
          facetType: 'Content-to-Definition',
          srsStage: 0,
          nextReviewAt: now,
        });
        newFacetsData.push({
          facetType: 'Definition-to-Content',
          srsStage: 0,
          nextReviewAt: now,
        });
      }
      if (Object.prototype.hasOwnProperty.call(ku.data, 'reading')) {
        newFacetsData.push({
          facetType: 'Content-to-Reading',
          srsStage: 0,
          nextReviewAt: now,
        });
      }
    } else if (ku.type === 'Grammar' || ku.type === 'Concept') {
      newFacetsData.push({
        facetType: 'AI-Generated-Question',
        srsStage: 0,
        nextReviewAt: now,
      });
    }
    // Add logic for other types (Kanji, etc.) here later

    if (newFacetsData.length === 0) {
      logger.info(
        `POST /api/review-facets - No default facets generated for KU type: ${ku.type}`
      );
      return NextResponse.json(
        { error: 'No default facets could be generated for this KU type' },
        { status: 400 }
      );
    }

    // Use a batch to write all new facets atomically
    const batch = db.batch();
    const facetsCollection = db.collection(REVIEW_FACETS_COLLECTION);

    newFacetsData.forEach((facetData) => {
      const newFacetRef = facetsCollection.doc(); // Auto-generate ID
      batch.set(newFacetRef, {
        ...facetData,
        kuId: kuId, // Add the parent KU ID
      });
    });

    await batch.commit();

    logger.info(
      `POST /api/review-facets - Successfully created ${newFacetsData.length} facets for KU ${kuId}`
    );
    return NextResponse.json(
      { success: true, count: newFacetsData.length },
      { status: 201 }
    );
  } catch (error) {
    logger.error('POST /api/review-facets - Error', error);
    return NextResponse.json(
      { error: 'Failed to generate review facets' },
      { status: 500 }
    );
  }
}

