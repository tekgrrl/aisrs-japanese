import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Define the path to our JSON database
// process.cwd() is the root of the Next.js project
const dbPath = path.join(process.cwd(), 'db.json');

// Define the shape of our Knowledge Unit (from Phase 2.1)
// We will expand this later.
interface KnowledgeUnit {
  id: string;
  type: 'Vocab' | 'Kanji' | 'Grammar' | 'Concept' | 'ExampleSentence';
  content: string;
  // ... other fields from schema
}

// GET /api/ku
// Fetches all Knowledge Units
export async function GET() {
  try {
    // Read the database file
    const data = await fs.readFile(dbPath, 'utf8');
    const kus = JSON.parse(data);
    return NextResponse.json(kus);
  } catch (error) {
    // If the file doesn't exist, return an empty array
    if (error.code === 'ENOENT') {
      return NextResponse.json([]);
    }
    return NextResponse.json({ message: 'Error reading database' }, { status: 500 });
  }
}

// POST /api/ku
// Adds a new Knowledge Unit
export async function POST(request: Request) {
  try {
    const newKu: KnowledgeUnit = await request.json();
    
    let kus: KnowledgeUnit[] = [];
    try {
      // Read existing KUs
      const data = await fs.readFile(dbPath, 'utf8');
      kus = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start with an empty array
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Add new KU (in a real app, we'd add validation, UUIDs, etc.)
    kus.push(newKu);

    // Write back to the file
    await fs.writeFile(dbPath, JSON.stringify(kus, null, 2));

    return NextResponse.json(newKu, { status: 201 });

  } catch (error) {
    return NextResponse.json({ message: 'Error writing to database' }, { status: 500 });
  }
}
