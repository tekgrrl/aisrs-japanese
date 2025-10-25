import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Database, ReviewFacet } from '@/types';

const dbPath = path.join(process.cwd(), 'db.json');

// --- DB Helper Functions ---
async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const parsedData = JSON.parse(data);
    return {
      kus: parsedData.kus || [],
      reviewFacets: parsedData.reviewFacets || [],
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { kus: [], reviewFacets: [] };
    }
    throw error;
  }
}

async function writeDb(db: Database): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
}
// --- End DB Helpers ---

/**
 * PUT /api/review-facets/[id]
 * Updates the SRS data for a single review facet after an answer.
 * Expects: { result: 'pass' | 'fail' }
 */
export async function PUT(
  request: Request,
  { params }: { params: { id: string } } // Keep params for signature, but don't use it
) {
  //
  // FIX: The `params` object is async and causing issues.
  // We will manually parse the ID from the request URL.
  //
  const url = new URL(request.url);
  const pathnameParts = url.pathname.split('/');
  const facetId = pathnameParts[pathnameParts.length - 1]; // Get the last part of the URL

  const body = await request.json();
  const { result } = body; // 'pass' or 'fail'

  if (!facetId) {
    return NextResponse.json({ error: 'Facet ID is required' }, { status: 400 });
  }
  if (result !== 'pass' && result !== 'fail') {
    return NextResponse.json(
      { error: "Result must be 'pass' or 'fail'" },
      { status: 400 }
    );
  }

  try {
    const db = await readDb();

    const facetIndex = db.reviewFacets.findIndex((f) => f.id === facetId);
    if (facetIndex === -1) {
      return NextResponse.json({ error: 'Facet not found' }, { status: 404 });
    }

    const facet = db.reviewFacets[facetIndex];
    const now = new Date();

    // --- Phase 5.1: Simple SRS Logic ---
    let newSrsStage = facet.srsStage;
    if (result === 'pass') {
      newSrsStage = Math.min(9, newSrsStage + 1); // Max stage 9
    } else {
      // Demote 2 stages on fail, min stage 0
      newSrsStage = Math.max(0, newSrsStage - 2);
    }

    // Simple exponential backoff for review times
    const srsStageDurationsInHours: { [key: number]: number } = {
      0: 10 / 60, // 10 minutes
      1: 8,
      2: 24,
      3: 48,
      4: 168, // 7 days
      5: 336, // 14 days
      6: 720, // 30 days
      7: 2880, // 120 days
      8: 5760, // 240 days
      9: 876000, // 100 years
    };

    const hoursToAdd = srsStageDurationsInHours[newSrsStage];
    const nextReviewDate = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);

    // --- FIX: Safely initialize history array ---
    const currentHistory = Array.isArray(facet.history) ? facet.history : [];

    // Update the facet
    const updatedFacet: ReviewFacet = {
      ...facet,
      srsStage: newSrsStage,
      lastReviewAt: now.toISOString(), // Now a valid field
      nextReviewAt: nextReviewDate.toISOString(),
      history: [ // Now a valid field
        ...currentHistory,
        { timestamp: now.toISOString(), result: result },
      ],
    };

    // Save back to the database
    db.reviewFacets[facetIndex] = updatedFacet;
    await writeDb(db);

    return NextResponse.json(updatedFacet);
  } catch (error) {
    console.error('Error in PUT /api/review-facets/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to update facet' },
      { status: 500 }
    );
  }
}


