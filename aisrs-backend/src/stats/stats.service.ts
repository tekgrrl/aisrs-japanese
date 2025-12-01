import { Injectable, Inject } from '@nestjs/common';
import { FIRESTORE_CONNECTION } from '../firebase/firebase.module';
import { FieldPath, FieldValue, Firestore } from 'firebase-admin/firestore';
import { KNOWLEDGE_UNITS_COLLECTION, REVIEW_FACETS_COLLECTION } from '../firebase/firebase.module';
import { CURRENT_USER_ID } from '@/lib/constants';
import { Logger } from '@nestjs/common';

@Injectable()
export class StatsService {
    private readonly logger = new Logger(StatsService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) { }

    async getDashboardStats() {
        const now = new Date().toISOString();

        // 1. KU Counts (Parallel)
        const learningCountQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where('userId', '==', CURRENT_USER_ID)
            .where('status', '==', 'learning')
            .count();

        const reviewingCountQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where('userId', '==', CURRENT_USER_ID)
            .where('status', '==', 'reviewing')
            .count();

        // 2. Review Counts
        const reviewsDueQuery = this.db.collection(REVIEW_FACETS_COLLECTION)
            .where('userId', '==', CURRENT_USER_ID)
            .where('nextReviewAt', '<=', now)
            .count();

        const [learningSnapshot, reviewingSnapshot, reviewsSnapshot] = await Promise.all([
            learningCountQuery.get(),
            reviewingCountQuery.get(),
            reviewsDueQuery.get(),
        ]);

        return {
            learnCount: learningSnapshot.data().count,
            reviewCount: reviewingSnapshot.data().count + reviewsSnapshot.data().count, // Total active items
            reviewsDue: reviewsSnapshot.data().count,
        };
    }
}
