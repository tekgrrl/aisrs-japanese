import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { REVIEW_FACETS_COLLECTION } from '@/lib/firebase-config';
import { ReviewFacet } from '@/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';

// SRS intervals in hours (maps to srsStage)
const srsIntervals = {
  0: 10 / 60, // 10 minutes
  1: 8, // 8 hours
  2: 24, // 1 day
  3: 72, // 3 days
  4: 168, // 1 week
  5: 336, // 2 weeks
  6: 730, // 1 month (approx)
  7: 2920, // 4 months
  8: 8760, // 1 year
};

type SrsStage = keyof typeof srsIntervals;

// PUT: Update an existing Review Facet's SRS data
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  let facetId: string;

  // Re-using the robust URL parsing from our previous fix
  try {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    facetId = pathParts[pathParts.length - 1]; // Get the last part of the path (the ID)

    if (!facetId) throw new Error('Facet ID not found in URL');
  } catch (urlError) {
    logger.error('PUT /api/review-facets/[id] - Error parsing URL', urlError);
    return NextResponse.json(
      { error: 'Invalid request URL' },
      { status: 400 }
    );
  }

  logger.info(`PUT /api/review-facets/${facetId} - Updating SRS data`);

  try {
    const body = await request.json();
    const { result } = body; // 'pass' or 'fail'

    if (!result || (result !== 'pass' && result !== 'fail')) {
      logger.warn(
        `PUT /api/review-facets/${facetId} - Invalid result: ${result}`
      );
      return NextResponse.json(
        { error: "Invalid result: must be 'pass' or 'fail'" },
        { status: 400 }
      );
    }

    const facetRef = db.collection(REVIEW_FACETS_COLLECTION).doc(facetId);
    const doc = await facetRef.get();

    if (!doc.exists) {
      logger.warn(`PUT /api/review-facets/${facetId} - Facet not found`);
      return NextResponse.json({ error: 'Facet not found' }, { status: 404 });
    }

    const facet = doc.data() as ReviewFacet;
    const now = new Date();
    const nowISO = now.toISOString();

    // --- Calculate new SRS stage ---
    let newStage = facet.srsStage;
    if (result === 'pass') {
      newStage = Math.min(newStage + 1, 8); // Cap at stage 8
    } else {
      // Demote: half the stages, rounded down, min stage 0
      newStage = Math.max(Math.floor(newStage / 2), 0);
    }

    // --- Calculate new review date ---
    const intervalHours = srsIntervals[newStage as SrsStage];
    const newNextReviewDate = new Date(
      now.getTime() + intervalHours * 60 * 60 * 1000
    );

    // --- Prepare update data ---
    const updateData = {
      srsStage: newStage,
      nextReviewAt: newNextReviewDate, // Keep as Date object
      lastReviewAt: now, // Keep as Date object
      history: FieldValue.arrayUnion({
        timestamp: now, // Keep as Date object
        result: result,
        stage: newStage,
      }),
    };

    // Atomically update the document
    await facetRef.update(updateData);

    logger.info(
      `PUT /api/review-facets/${facetId} - Updated stage to ${newStage}`
    );
    return NextResponse.json({
      success: true,
      newStage: newStage,
      nextReviewAt: newNextReviewDate.toISOString(),
    });
  } catch (error) {
    logger.error(`PUT /api/review-facets/${facetId} - Error`, error);
    return NextResponse.json(
      { error: 'Failed to update review facet' },
      { status: 500 }
    );
  }
}

