import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
// Import from the new shared types file
import { Database, KnowledgeUnit } from '@/types';

const dbPath = path.join(process.cwd(), 'db.json');

// Helper function to read the DB with the new structure
async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    // Ensure both arrays exist even if the file is partially formed
    const parsedData = JSON.parse(data);
    const db: Database = {
      kus: parsedData.kus || [],
      reviewFacets: parsedData.reviewFacets || [],
    };
    return db;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // If file doesn't exist, return the correct empty structure
      return { kus: [], reviewFacets: [] };
    }
    console.error('Failed to read db.json:', error);
    throw error;
  }
}

// Helper function to write to the DB
async function writeDb(db: Database): Promise<void> {
  try {
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write db.json:', error);
  }
}

export async function GET() {
  const db = await readDb();
  // Return only the KUs from this endpoint
  return NextResponse.json(db.kus);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await readDb();

    const newKu: KnowledgeUnit = {
      id: crypto.randomUUID(),
      type: body.type,
      content: body.content,
      data: body.data || {},
      personalNotes: body.personalNotes || '',
      relatedUnits: body.relatedUnits || [],
    };

    // Make sure we're pushing to the 'kus' array
    db.kus.push(newKu);

    await writeDb(db);

    return NextResponse.json(newKu, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/ku:', error);
    return NextResponse.json({ error: 'Failed to create KU' }, { status: 500 });
  }
}

