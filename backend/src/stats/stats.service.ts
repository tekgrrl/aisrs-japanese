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

        // Helper to generate keys (matching ReviewsService logic)
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');

        const currentDayKey = `${yyyy}-${mm}-${dd}`;
        const currentHourKey = `${yyyy}-${mm}-${dd}-${hh}`;

        // Filter Forecasts
        const rawReviewForecast = userStats.reviewForecast || {};
        const filteredReviewForecast = Object.keys(rawReviewForecast)
            .filter(key => key >= currentDayKey)
            .reduce((obj, key) => {
                obj[key] = rawReviewForecast[key];
                return obj;
            }, {});

        const rawHourlyForecast = userStats.hourlyForecast || {};
        const filteredHourlyForecast = Object.keys(rawHourlyForecast)
            .filter(key => key >= currentHourKey)
            .reduce((obj, key) => {
                obj[key] = rawHourlyForecast[key];
                return obj;
            }, {});

        return {
            learnCount: learnSnapshot.data().count,
            reviewCount: reviewingSnapshot.data().count + reviewsSnapshot.data().count, // Total active items
            reviewsDue: reviewsSnapshot.data().count,

            // Include the detailed breakdown for your widgets
            srsCounts: userStats.levelProgress || {},
            reviewForecast: filteredReviewForecast,
            hourlyForecast: filteredHourlyForecast,
            streak: userStats.currentStreak || 0
        };
    }
}