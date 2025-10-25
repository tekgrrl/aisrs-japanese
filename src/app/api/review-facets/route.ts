import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { Database, KnowledgeUnit, ReviewFacet, ReviewItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const dbPath = path.join(process.cwd(), 'db.json');

// --- DB Utility Functions ---
async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(dbPath, 'utf-8');
    return JSON.parse(data) as Database;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File not found, return empty DB
      return { kus: [], reviewFacets: [] };
    }
    throw error;
  }
}

async function writeDb(data: Database): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * GET /api/review-facets
 * Fetches all review facets.
 * If ?due=true, fetches only facets due for review AND joins them
 * with their parent KU.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dueOnly = searchParams.get('due') === 'true';

  try {
    const db = await readDb();
    const now = new Date().toISOString();

    if (dueOnly) {
      const dueFacets = db.reviewFacets.filter(
        (facet) => facet.nextReviewAt <= now
      );

      // "Join" the data
      const reviewItems: ReviewItem[] = dueFacets
        .map((facet) => {
          const ku = db.kus.find((k) => k.id === facet.kuId);
          if (!ku) return null; // Orphaned facet, skip
          return { facet, ku };
        })
        .filter((item): item is ReviewItem => item !== null); // Filter out nulls

      return NextResponse.json(reviewItems);
    } else {
      // Just return all raw facets (for the Manage page)
      return NextResponse.json(db.reviewFacets);
    }
  } catch (error) {
    console.error('Error in GET /api/review-facets:', error);
    return NextResponse.json(
      { error: 'Failed to read database' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/review-facets
 * Generates and saves default facets for a given KnowledgeUnit (kuId).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { kuId } = body;

    if (!kuId) {
      return NextResponse.json(
        { error: 'Missing kuId' },
        { status: 400 }
      );
    }

    const db = await readDb();
    const ku = db.kus.find((k) => k.id === kuId);

    if (!ku) {
      return NextResponse.json(
        { error: 'KnowledgeUnit not found' },
        { status: 404 }
      );
    }

    const existingFacets = db.reviewFacets.filter((f) => f.kuId === kuId);
    if (existingFacets.length > 0) {
      return NextResponse.json(
        { error: 'Facets already exist for this KU' },
        { status: 409 }
      );
    }

    const newFacets: ReviewFacet[] = [];
    const now = new Date().toISOString();

    // --- UPDATED LOGIC ---
    if (ku.type === 'Vocab') {
      // Create default facets for Vocab
      if (ku.data && 'definition' in ku.data) {
        newFacets.push({
          id: uuidv4(),
          kuId: ku.id,
          facetType: 'Content-to-Definition',
          srsStage: 0,
          nextReviewAt: now,
        });
        newFacets.push({
          id: uuidv4(),
          kuId: ku.id,
          facetType: 'Definition-to-Content',
          srsStage: 0,
          nextReviewAt: now,
        });
      }
      if (ku.data && 'reading' in ku.data) {
        newFacets.push({
          id: uuidv4(),
          kuId: ku.id,
          facetType: 'Content-to-Reading',
          srsStage: 0,
          nextReviewAt: now,
        });
      }
    } else if (ku.type === 'Grammar' || ku.type === 'Concept') {
      // Create a single AI-Generated facet
      newFacets.push({
        id: uuidv4(),
        kuId: ku.id,
        facetType: 'AI-Generated-Question',
        srsStage: 0,
        nextReviewAt: now,
      });
    }
    // Other types (Kanji, etc.) can be added here later

    if (newFacets.length === 0) {
      return NextResponse.json(
        { error: 'No default facets could be generated for this KU type' },
        { status: 400 }
      );
    }

    db.reviewFacets.push(...newFacets);
    await writeDb(db);

    return NextResponse.json(newFacets, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/review-facets:', error);
    return NextResponse.json(
      { error: 'Failed to write to database' },
      { status: 500 }
    );
  }
}

