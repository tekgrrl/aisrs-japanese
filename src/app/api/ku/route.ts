import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Define the path to our JSON database
const dbPath = path.join(process.cwd(), 'db.json');

// Define the shape of our Knowledge Unit (from Phase 2.1)
// We'll expand this later, for now, it's simple.
export interface KnowledgeUnit {
  id: string;
  type: 'Vocab' | 'Kanji' | 'Grammar' | 'Concept' | 'ExampleSentence';
  content: string;
  // We'll add 'data', 'relatedUnits', 'personalNotes' later
}

// Helper function to read the database
async function readDB(): Promise<KnowledgeUnit[]> {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data) as KnowledgeUnit[];
  } catch (error) {
    // If the file doesn't exist, return an empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Helper function to write to the database
async function writeDB(data: KnowledgeUnit[]): Promise<void> {
  await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
}

// GET /api/ku
// Fetches all Knowledge Units
export async function GET() {
  try {
    const kus = await readDB();
    return NextResponse.json(kus);
  } catch (error) {
    console.error('Error reading database:', error);
    return NextResponse.json({ message: 'Error reading database' }, { status: 500 });
  }
}

// POST /api/ku
// Adds a new Knowledge Unit
export async function POST(request: Request) {
  try {
    // We expect a partial KU, without the ID
    const { type, content } = await request.json();

    if (!type || !content) {
      return NextResponse.json({ message: 'Missing type or content' }, { status: 400 });
    }

    const newKu: KnowledgeUnit = {
      id: crypto.randomUUID(), // Generate a unique ID on the server
      type,
      content,
    };

    const kus = await readDB();
    kus.push(newKu);
    await writeDB(kus);

    return NextResponse.json(newKu, { status: 201 });

  } catch (error) {
    console.error('Error writing to database:', error);
    return NextResponse.json({ message: 'Error writing to database' }, { status: 500 });
  }
}

