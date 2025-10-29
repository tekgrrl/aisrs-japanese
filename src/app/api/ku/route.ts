import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { KNOWLEDGE_UNITS_COLLECTION } from '@/lib/firebase-config';
import { KnowledgeUnit } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from '@/lib/logger';

// GET all Knowledge Units
export async function GET() {
  logger.info('GET /api/ku - Fetching all units');
  try {
    const snapshot = await db
      .collection(KNOWLEDGE_UNITS_COLLECTION)
      .orderBy('createdAt', 'desc') // Order by creation time, newest first
      .get();

    if (snapshot.empty) {
      logger.info('GET /api/ku - No units found.');
      return NextResponse.json([]);
    }

    const kus: KnowledgeUnit[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      kus.push({
        id: doc.id,
        ...data,
        // Convert Firestore Timestamp to string for client-side
        createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
      } as KnowledgeUnit);
    });

    logger.info(`GET /api/ku - Returning ${kus.length} units.`);
    return NextResponse.json(kus);
  } catch (error) {
    logger.error('GET /api/ku - Error fetching units', error);
    return NextResponse.json(
      { error: 'Failed to fetch knowledge units' },
      { status: 500 }
    );
  }
}

// POST a new Knowledge Unit
export async function POST(request: Request) {
  logger.info('POST /api/ku - Creating new unit');
  try {
    const body = await request.json();

    // Validate body (basic)
    if (!body.type || !body.content) {
      logger.warn('POST /api/ku - Validation failed', body);
      return NextResponse.json(
        { error: 'Type and Content are required' },
        { status: 400 }
      );
    }

    const newKuData = {
      ...body,
      relatedUnits: body.relatedUnits || [], // Ensure array exists
      data: body.data || {}, // Ensure object exists
      createdAt: Timestamp.now(), // Add Firestore timestamp
      status: 'learning',
      facet_count: 0,
    };

    const newDocRef = await db
      .collection(KNOWLEDGE_UNITS_COLLECTION)
      .add(newKuData);

    logger.info(`POST /api/ku - Created unit ${newDocRef.id}`);
    return NextResponse.json({ id: newDocRef.id }, { status: 201 });
  } catch (error) {
    logger.error('POST /api/ku - Error creating unit', error);
    return NextResponse.json(
      { error: 'Failed to create knowledge unit' },
      { status: 500 }
    );
  }
}

