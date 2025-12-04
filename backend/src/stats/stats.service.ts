import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import {
    FIRESTORE_CONNECTION,
    KNOWLEDGE_UNITS_COLLECTION,
    REVIEW_FACETS_COLLECTION,
    USER_STATS_COLLECTION // Make sure this is exported in firebase.module/constants
} from '../firebase/firebase.module';

const CURRENT_USER_ID = 'user_default';

@Injectable()
export class StatsService {
    private readonly logger = new Logger(StatsService.name);

    constructor(@Inject(FIRESTORE_CONNECTION) private readonly db: Firestore) { }

    async getDashboardStats() {
        // ... existing queries ...
        const learnQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("userId", "==", CURRENT_USER_ID)
            .where("status", "==", "learning")
            .count()
            .get();

        const reviewQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("userId", "==", CURRENT_USER_ID)
            .where("status", "==", "reviewing")
            .count()
            .get();

        const reviewsDueQuery = this.db.collection(REVIEW_FACETS_COLLECTION)
            .where("userId", "==", CURRENT_USER_ID)
            .where("nextReviewAt", "<=", Timestamp.now()) // Safe timestamp comparison
            .count()
            .get();

        // New: Fetch User Stats Document
        const userStatsQuery = this.db.collection(USER_STATS_COLLECTION).doc(CURRENT_USER_ID).get();

        const [learnSnapshot, reviewingSnapshot, reviewsSnapshot, userStatsDoc] = await Promise.all([
            learnQuery,
            reviewQuery,
            reviewsDueQuery,
            userStatsQuery
        ]);

        this.logger.log(`Reviews due for user ${CURRENT_USER_ID}: ${reviewsSnapshot.data().count}`);

        const userStatsDocData = userStatsDoc.data();
        const userStats = userStatsDocData ? userStatsDocData : {};

        return {
            learnCount: learnSnapshot.data().count,
            reviewCount: reviewingSnapshot.data().count + reviewsSnapshot.data().count, // Total active items
            reviewsDue: reviewsSnapshot.data().count,

            // Include the detailed breakdown for your widgets
            srsCounts: userStats.levelProgress || {},
            reviewForecast: userStats.reviewForecast || {},
            hourlyForecast: userStats.hourlyForecast || {},
            streak: userStats.currentStreak || 0
        };
    }
}