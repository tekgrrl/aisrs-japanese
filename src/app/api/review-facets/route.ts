import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
// Import all types
import { Database, ReviewFacet, KnowledgeUnit } from '@/types';

const dbPath = path.join(process.cwd(), 'db.json');

// --- DB Helper Functions (specific to this route) ---
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
 * GET /api/review-facets
 * Fetches all review facets.
 * Later, we can add query params like ?due=true
 */
export async function GET() {
  const db = await readDb();
  return NextResponse.json(db.reviewFacets);
}

/**
 * POST /api/review-facets
 * Generates default facets for a given KnowledgeUnit (kuId).
 * Expects: { kuId: string }
 */
export async function POST(request: Request) {
  const body = await request.json();
  const { kuId } = body;

  if (!kuId) {
    return NextResponse.json({ error: 'kuId is required' }, { status: 400 });
  }

  const db = await readDb();
  const ku = db.kus.find((k) => k.id === kuId);

  if (!ku) {
    return NextResponse.json({ error: 'KnowledgeUnit not found' }, { status: 404 });
  }

  // Check for existing facets for this KU to avoid duplicates
  const existingFacets = db.reviewFacets.filter(f => f.kuId === kuId);
  if (existingFacets.length > 0) {
    // Just return the existing ones, this isn't an error
    return NextResponse.json(existingFacets, { status: 200 });
  }

  const newFacets: ReviewFacet[] = [];
  const now = new Date().toISOString();

  // --- Logic to generate default facets based on KU type ---
  if (ku.type === 'Vocab') {
    // Vocab -> Definition
    if (ku.data.definition) {
      newFacets.push({
        id: crypto.randomUUID(),
        kuId: ku.id,
        facetType: 'Content-to-Definition',
        srsStage: 0,
        nextReviewAt: now,
        lastReviewAt: null,
        history: [],
      });
      // Definition -> Vocab
      newFacets.push({
        id: crypto.randomUUID(),
        kuId: ku.id,
        facetType: 'Definition-to-Content',
        srsStage: 0,
        nextReviewAt: now,
        lastReviewAt: null,
        history: [],
      });
    }
    // Vocab (Kanji) -> Reading (Hiragana)
    if (ku.data.reading) {
      newFacets.push({
        id: crypto.randomUUID(),
        kuId: ku.id,
        facetType: 'Content-to-Reading',
        srsStage: 0,
        nextReviewAt: now,
        lastReviewAt: null,
        history: [],
      });
    }
  }
  // TODO: Add `else if (ku.type === 'Kanji')` ...
  // TODO: Add `else if (ku.type === 'Grammar')` ...

  if (newFacets.length === 0) {
    return NextResponse.json({ error: 'No default facets could be generated for this KU type. Does it have a definition?' }, { status: 400 });
  }

  // Add new facets to the database
  db.reviewFacets.push(...newFacets);
  await writeDb(db);

  return NextResponse.json(newFacets, { status: 201 });
}
