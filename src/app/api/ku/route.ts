import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Define the path to our JSON database
const dbPath = path.join(process.cwd(), 'db.json');

// --- Updated KnowledgeUnit Schema (Phase 2.1) ---
export interface KnowledgeUnit {
  id: string;
  type: 'Vocab' | 'Kanji' | 'Grammar' | 'Concept' | 'ExampleSentence';
  content: string; // The main "thing" (e.g., the word, the kanji, the grammar point)
  
  // 'data' holds type-specific info.
  // For 'Vocab': { reading: '...', definition: '...' }
  // For 'Kanji': { readings: 'on, kun', meaning: '...' }
  // We'll keep it simple as string-to-string for now.
  data: Record<string, string>; 
  
  personalNotes: string; // User's own context, mnemonics, etc.
  relatedUnits: string[]; // Array of other KU IDs
}
// ---------------------------------------------------

// Helper function to read the database
async function readDB(): Promise<KnowledgeUnit[]> {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data) as KnowledgeUnit[];
  } catch (error) {
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
    // We now expect the expanded fields
    const { type, content, data, personalNotes } = await request.json();

    if (!type || !content) {
      return NextResponse.json({ message: 'Missing type or content' }, { status: 400 });
    }

    const newKu: KnowledgeUnit = {
      id: crypto.randomUUID(), // Generate a unique ID on the server
      type,
      content,
      // Provide defaults for the new fields if they are missing
      data: data || {},
      personalNotes: personalNotes || '',
      relatedUnits: [], // We'll handle adding related units in a future step
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

