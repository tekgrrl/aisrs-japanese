import { NextResponse } from 'next/server';
import {
  db,
  Timestamp,
  KNOWLEDGE_UNITS_COLLECTION,
  REVIEW_FACETS_COLLECTION,
} from '@/lib/firebase';

export async function GET() {
  try {
    const learnQuery = db
      .collection(KNOWLEDGE_UNITS_COLLECTION)
      .where('status', '==', 'learning')
      .count()
      .get();

    const reviewQuery = db
      .collection(REVIEW_FACETS_COLLECTION)
      .where('nextReviewAt', '<=', Timestamp.now())
      .count()
      .get();

    const [learnSnapshot, reviewSnapshot] = await Promise.all([
      learnQuery,
      reviewQuery,
    ]);

    const learnCount = learnSnapshot.data().count;
    const reviewCount = reviewSnapshot.data().count;

    return NextResponse.json({ learnCount, reviewCount });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
