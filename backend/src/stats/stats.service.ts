import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp, Transaction } from 'firebase-admin/firestore';
import {
    FIRESTORE_CONNECTION,
    KNOWLEDGE_UNITS_COLLECTION,
    REVIEW_FACETS_COLLECTION,
    USER_STATS_COLLECTION,
    USER_KUS_SUBCOLLECTION,
} from '../firebase/firebase.module';
import { ADMIN_USER_ID } from '../lib/constants';

// Removed ADMIN_USER_ID

@Injectable()
export class StatsService {
    private readonly logger = new Logger(StatsService.name);

    constructor(@Inject(FIRESTORE_CONNECTION) private readonly db: Firestore) { }

    async getDashboardStats(uid: string) {
        // ... existing queries ...
        const learnQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("userId", "==", uid)
            .where("status", "==", "learning")
            .count()
            .get();

        const ukuLearnQuery = this.db.collection('users').doc(uid)
            .collection(USER_KUS_SUBCOLLECTION)
            .where("status", "==", "learning")
            .count()
            .get();

        const reviewQuery = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("userId", "==", uid)
            .where("status", "==", "reviewing")
            .count()
            .get();

        const facetsCol = uid === ADMIN_USER_ID
            ? this.db.collection(REVIEW_FACETS_COLLECTION).where('userId', '==', uid)
            : this.db.collection('users').doc(uid).collection(REVIEW_FACETS_COLLECTION);

        const reviewsDueQuery = facetsCol
            .where("nextReviewAt", "<=", Timestamp.now())
            .count()
            .get();

        // New: Fetch User Stats Document
        const userStatsQuery = this.db.collection(USER_STATS_COLLECTION).doc(uid).get();

        const [learnSnapshot, ukuLearnSnapshot, reviewingSnapshot, reviewsSnapshot, userStatsDoc] = await Promise.all([
            learnQuery,
            ukuLearnQuery,
            reviewQuery,
            reviewsDueQuery,
            userStatsQuery
        ]);

        const reviewsDueCount = reviewsSnapshot.data().count;
        this.logger.log(`Reviews due for user ${uid}: ${reviewsDueCount}`);

        const userStatsDocData = userStatsDoc.data();
        const userStats = userStatsDocData ? userStatsDocData : {};

        const rawReviewForecast = userStats.reviewForecast || {};
        const rawHourlyForecast = userStats.hourlyForecast || {};

        const now = new Date();
        const currentStreak = userStats.currentStreak || 0;
        const totalActive = reviewingSnapshot.data().count + reviewsDueCount;

        // --- CALCULATION LOGIC ---

        // 1. Next 24 Hours
        // Sum hourly buckets from (now + 1h) to (now + 24h)
        let next24HoursCount = 0;
        for (let i = 1; i <= 24; i++) {
            const futureHour = new Date(now.getTime() + i * 60 * 60 * 1000);
            const key = this.getDateBuckets(futureHour).hourKey;
            next24HoursCount += (rawHourlyForecast[key] || 0);
        }

        // 2. 5-Day Schedule
        // Day 0: Rest of Today (remaining hours)
        // Day 1-4: Full days (from daily forecast)

        const schedule: { date: string; isToday: boolean; count: number; runningTotal: number; label: string; }[] = [];
        let runningTotal = reviewsDueCount;

        // Day 0 (Today)
        let todayRemainingCount = 0;
        const startHour = now.getHours() + 1; // start from next hour
        if (startHour < 24) {
            const todayBuckets = this.getDateBuckets(now);
            // Reconstruct the hour keys for the rest of today
            // Note: simple string manipulation is safe here as yyyy-mm-dd is stable for the loop
            const prefix = todayBuckets.dayKey;
            for (let h = startHour; h < 24; h++) {
                const hh = String(h).padStart(2, '0');
                const key = `${prefix}-${hh}`;
                todayRemainingCount += (rawHourlyForecast[key] || 0);
            }
        }

        runningTotal += todayRemainingCount;
        schedule.push({
            date: this.getDateBuckets(now).dayKey,
            isToday: true,
            count: todayRemainingCount,
            runningTotal: runningTotal,
            label: 'Today'
        });

        // Days 1-4
        for (let i = 1; i <= 4; i++) {
            const futureDate = new Date(now);
            futureDate.setDate(now.getDate() + i);
            const key = this.getDateBuckets(futureDate).dayKey;

            const dayCount = (rawReviewForecast[key] || 0);
            runningTotal += dayCount;

            schedule.push({
                date: key,
                isToday: false,
                count: dayCount,
                runningTotal: runningTotal,
                label: futureDate.toLocaleDateString('en-US', { weekday: 'short' }) // e.g. Mon, Tue
            });
        }

        return {
            learnCount: learnSnapshot.data().count + ukuLearnSnapshot.data().count,
            reviewCount: totalActive,
            reviewsDue: reviewsDueCount,

            // New Widget Data
            next24HoursCount: next24HoursCount,
            schedule: schedule,

            // Legacy/Other support
            srsCounts: userStats.levelProgress || {},
            streak: currentStreak
        };
    }
    async updateReviewScheduleStats(
        userId: string,
        oldNextReviewAt: Date,
        newNextReviewAt: Date,
        result: 'pass' | 'fail',
        transaction: Transaction
    ) {
        const statsRef = this.db.collection(USER_STATS_COLLECTION).doc(userId);
        const statsDoc = await transaction.get(statsRef);
        const statsData = statsDoc.data() || {};

        const currentStats = {
            reviewForecast: statsData.reviewForecast || {},
            hourlyForecast: statsData.hourlyForecast || {},
            currentStreak: statsData.currentStreak || 0,
            lastReviewDate: statsData.lastReviewDate ? statsData.lastReviewDate.toDate() : null,
            totalReviews: statsData.totalReviews || 0,
            passedReviews: statsData.passedReviews || 0,
        };

        const now = new Date();

        // 1. Update Forecasts
        const oldBuckets = this.getDateBuckets(oldNextReviewAt);
        const newBuckets = this.getDateBuckets(newNextReviewAt);

        // Always decrement old bucket (cleaning up)
        if (currentStats.reviewForecast[oldBuckets.dayKey]) {
            currentStats.reviewForecast[oldBuckets.dayKey] = Math.max(0, currentStats.reviewForecast[oldBuckets.dayKey] - 1);
        }
        if (currentStats.hourlyForecast[oldBuckets.hourKey]) {
            currentStats.hourlyForecast[oldBuckets.hourKey] = Math.max(0, currentStats.hourlyForecast[oldBuckets.hourKey] - 1);
        }

        // Increment new bucket
        currentStats.reviewForecast[newBuckets.dayKey] = (currentStats.reviewForecast[newBuckets.dayKey] || 0) + 1;
        currentStats.hourlyForecast[newBuckets.hourKey] = (currentStats.hourlyForecast[newBuckets.hourKey] || 0) + 1;

        // 2. Update Streak
        const todayKey = this.getDateBuckets(now).dayKey;
        let newStreak = currentStats.currentStreak;

        if (currentStats.lastReviewDate) {
            const lastKey = this.getDateBuckets(currentStats.lastReviewDate).dayKey;

            if (lastKey !== todayKey) {
                // Check if it was yesterday
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayKey = this.getDateBuckets(yesterday).dayKey;

                if (lastKey === yesterdayKey) {
                    newStreak += 1;
                } else {
                    newStreak = 1; // Reset
                }
            }
        } else {
            newStreak = 1; // First review
        }

        // 3. Update Accuracy
        const newTotal = currentStats.totalReviews + 1;
        const newPassed = currentStats.passedReviews + (result === 'pass' ? 1 : 0);

        // 4. Write to DB
        transaction.set(statsRef, {
            userId, // Ensure userId is set
            reviewForecast: currentStats.reviewForecast,
            hourlyForecast: currentStats.hourlyForecast,
            currentStreak: newStreak,
            lastReviewDate: now, // Firestore will convert Date to Timestamp
            totalReviews: newTotal,
            passedReviews: newPassed,
        }, { merge: true });
    }

    // Helper to generate bucket keys
    private getDateBuckets(date: Date) {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');

        return {
            dayKey: `${yyyy}-${mm}-${dd}`,
            hourKey: `${yyyy}-${mm}-${dd}-${hh}`
        };
    }
}