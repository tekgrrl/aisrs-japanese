import { Injectable, Inject } from '@nestjs/common';
import { FIRESTORE_CONNECTION } from '../firebase/firebase.module';
import { FieldPath, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
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
        const learnQuery = this.db
            .collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("userId", "==", CURRENT_USER_ID)
            .where("status", "==", "learning")
            .count()
            .get();

        const reviewQuery = this.db
            .collection(REVIEW_FACETS_COLLECTION)
            .where("userId", "==", CURRENT_USER_ID)
            .where("nextReviewAt", "<=", Timestamp.now())
            .count()
            .get();

        const [learnSnapshot, reviewSnapshot] = await Promise.all([
            learnQuery,
            reviewQuery,
        ]);

        const learnCount = learnSnapshot.data().count;
        const reviewCount = reviewSnapshot.data().count;

        return { learnCount, reviewCount };
    }
}
