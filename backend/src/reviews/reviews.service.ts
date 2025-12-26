import {
    Injectable,
    Inject,
    Logger,
    NotFoundException,
    forwardRef,
} from '@nestjs/common';
import { FieldPath, FieldValue, Firestore, Timestamp } from 'firebase-admin/firestore';
import {
    FIRESTORE_CONNECTION,
    REVIEW_FACETS_COLLECTION,
    KNOWLEDGE_UNITS_COLLECTION,
    USER_STATS_COLLECTION,
} from '../firebase/firebase.module';
import { GeminiService } from '../gemini/gemini.service';
import { QuestionsService } from '../questions/questions.service';
import { CURRENT_USER_ID } from '@/lib/constants';
import { FacetType, KnowledgeUnit, Lesson, ReviewFacet } from '@/types';
import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';
import { LessonsService } from '@/lessons/lessons.service';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class ReviewsService {
    private readonly logger = new Logger(ReviewsService.name);

    // SRS intervals in hours (maps to srsStage)
    private readonly INTERVALS = {
        0: 10 / 60, // 10 minutes
        1: 8, // 8 hours
        2: 24, // 1 day
        3: 72, // 3 days
        4: 168, // 1 week
        5: 336, // 2 weeks
        6: 730, // 1 month (approx)
        7: 2920, // 4 months
        8: 8760, // 1 year
    };

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
        private readonly geminiService: GeminiService,
        @Inject(forwardRef(() => QuestionsService)) // <-- WRAP THIS
        private readonly questionsService: QuestionsService,
        private readonly knowledgeUnitsService: KnowledgeUnitsService,
        private readonly lessonsService: LessonsService,
        private readonly statsService: StatsService,
    ) { }

    async getByFacetId(facetId: string) {
        const doc = await this.db
            .collection(REVIEW_FACETS_COLLECTION)
            .doc(facetId)
            .get();
        if (!doc.exists) return null;
        return doc.data();
    }

    async updateFacetSrs(facetId: string, result: 'pass' | 'fail') {
        return this.db.runTransaction(async (transaction) => {
            const query = this.db
                .collection(REVIEW_FACETS_COLLECTION)
                .where(FieldPath.documentId(), '==', facetId)
                .where('userId', '==', CURRENT_USER_ID);

            const snapshot = await query.get();

            if (snapshot.empty) {
                throw new NotFoundException('Facet not found');
            }

            const facetDoc = snapshot.docs[0];
            const facetRef = facetDoc.ref;
            const facetData = facetDoc.data() as ReviewFacet;

            // Determine the new SRS stage and time of next review
            const currentSrsStage = facetData.srsStage || 0;
            // Dates from Firestore are timestamps, convert if necessary (though usually handled by SDK)
            // const oldNextReviewDate = facetData.nextReviewAt ? facetData.nextReviewAt.toDate() : new Date();

            const nextSrsStage = this.calculateNextStage(currentSrsStage, result);

            const now = new Date();
            const hoursToAdd = nextSrsStage === 0 ? 0 : this.INTERVALS[nextSrsStage];
            const nextReviewDate = new Date(now.getTime() + hoursToAdd * 60 * 60 * 1000);

            // Calculate and update Stats via StatsService
            // Note: We use the *old* nextReviewAt for stats scheduling accuracy if needed
            const oldNextReviewDate = facetData.nextReviewAt instanceof Timestamp
                ? facetData.nextReviewAt.toDate()
                : (facetData.nextReviewAt ? new Date(facetData.nextReviewAt) : new Date());

            await this.statsService.updateReviewScheduleStats(
                CURRENT_USER_ID,
                oldNextReviewDate,
                nextReviewDate,
                result,
                transaction
            );

            // WRITE (Facet)
            this.logger.log(`Updating facet ${facetId} to stage ${nextSrsStage} (${result.toUpperCase()})`);

            transaction.update(facetRef, {
                srsStage: nextSrsStage,
                nextReviewAt: nextReviewDate,
                lastReviewAt: now,
                history: FieldValue.arrayUnion({
                    stage: nextSrsStage,
                    timestamp: now,
                    result,
                }),
            });

            // 4. WRITE (Knowledge Unit Propagation)
            // If the item reached Mastered (Mushin - Stage 8), we update the KU status.
            if (nextSrsStage === 8 && facetData.kuId) {
                const kuRef = this.db
                    .collection(KNOWLEDGE_UNITS_COLLECTION)
                    .doc(facetData.kuId);
                // Optimistic update for now
                transaction.update(kuRef, { status: 'mastered' });
            }

            this.logger.log(
                `SRS Update [${facetId}]: ${result.toUpperCase()} | Stage ${currentSrsStage} -> ${nextSrsStage}`,
            );

            return {
                success: true,
                facetId,
                newStage: nextSrsStage,
                nextReview: nextReviewDate,
            };
        });
    }

    /**
     * Calculates the next SRS stage based on the current stage and the result.
     * Implements the specific AISRS progression paths (Sumi-suri -> Mushin).
     */
    private calculateNextStage(currentStage: number, result: 'pass' | 'fail'): number {
        if (result === 'pass') {
            // Progression is linear: 0->1->2->3->4...->8
            // Capped at Stage 8 (Mushin)
            return Math.min(currentStage + 1, 8);
        } else {
            // Failure Transitions
            switch (currentStage) {
                case 0: return 0; // Sumi-suri: Initial -> Initial
                case 1: return 1; // Sumi-suri: Step 1 -> Step 1 (Reset to path start)
                case 2: return 1; // Sumi-suri: Step 2 -> Step 1
                case 3: return 1; // Sumi-suri: Step 3 -> Step 1
                case 4: return 2; // Kaisho I -> Sumi-suri III (Stage 2) - "Two failures in Kaisho resets back to SRS 2"? 
                // Wait, clarification said: "Let's make it drop to SRS Stage 4". 
                // BUT also "Two failures in Kaisho resets back to SRS 2".
                // Let's re-read the approved logic table carefully.
                // Table says: 4 -> Fail -> 2.
                // Table says: 5 -> Fail -> 4.
                // This assumes "Two failures in Kaisho" means dropping from 5->4 (1 fail), then 4->2 (2 fails).
                // So 4->2 is correct per table.
                case 5: return 4; // Kaisho II -> Kaisho I
                case 6: return 4; // Gyosho -> Kaisho I
                case 7: return 6; // Sosho -> Gyosho
                case 8: return 6; // Mushin -> Gyosho
                default: return Math.max(0, currentStage - 1); // Fallback safe
            }
        }
    }

    async updateFacetQuestion(facetId: string, questionId: string) {
        const facetRef = this.db.collection(REVIEW_FACETS_COLLECTION).doc(facetId);
        await facetRef.update({
            currentQuestionId: questionId,
            questionAttempts: 0,
        });
        this.logger.log(`Updated facet ${facetId} with new question ${questionId}`);
    }

    async evaluateAnswer(
        userAnswer: string,
        expectedAnswers: string[],
        question: string,
        topic: string,
        questionId: string,
    ) {
        // 1. Local Check
        const isLocalMatch = expectedAnswers.some(
            (ans) => ans.toLowerCase() === userAnswer.toLowerCase(),
        );

        if (isLocalMatch) {
            this.logger.log(`Local match passed for topic: ${topic}`);
            this.questionsService.updateQuestionHistory(
                questionId,
                userAnswer,
                'pass',
            );
            return {
                result: 'pass',
                explanation: 'Correct!',
            };
        }

        // 2. AI Fallback
        this.logger.log(`Local match failed for topic: ${topic}. Calling Gemini.`);

        const systemPrompt = `You are an AISRS evaluator. A user is being quizzed.
- The question was: "${question || 'N/A'}"
- The topic was: "${topic || 'N/A'}"
- The expected answer(s) are: "${JSON.stringify(expectedAnswers)}"
- The user's answer is: "${userAnswer}"

Your task is to evaluate if the user's answer is correct.
1.  Read the "expected answer(s)". This may be a single answer (e.g., "Family") or a comma-separated list of possible correct answers (e.g., "ドク, トク, よむ").
2.  Compare the user's answer to the list. The user is correct if their answer is *any one* of the items in the list.
3.  If you feel that the answer is correct but not in the list, return a pass with an explanation.  
4.  Be lenient with hiragana vs katakana (e.g., if expected is "ドク" and user typed "どく", it's a pass).
5.  Be lenient with extra punctuation or whitespace.
6.  Provide your evaluation ONLY as a valid JSON object with the following schema:
{
  "result": "pass" | "fail",
  "explanation": "A brief, one-sentence explanation for *why* the user passed or failed, referencing their answer."
}
Example for a pass: {"result": "pass", "explanation": "Correct! よむ is one of the kun'yomi readings."}
Example for a fail: {"result": "fail", "explanation": "Incorrect. The expected readings were ドク, トク, or よむ."}
`;

        const schema = {
            type: 'OBJECT',
            properties: {
                result: { type: 'STRING', enum: ['pass', 'fail'] },
                explanation: { type: 'STRING' },
            },
            required: ['result', 'explanation'],
        };

        return this.geminiService.evaluateAnswer(
            systemPrompt,
            userAnswer,
            expectedAnswers,
            { userAnswer, expectedAnswers, question, topic },
        );
    } // END evaluateAnswer

    async generateReviewFacets(
        kuId: string,
        facetsToCreate: { key: string; data?: any }[],
    ) {
        const batch = this.db.batch();
        let count = 0;
        const now = Timestamp.now();
        let parentFacetCount = 0; // Correctly track parent's direct facets

        for (const facet of facetsToCreate) {
            const { key, data } = facet;
            this.logger.log(`Generating review facet ${key} for KU ${kuId}`);
            let targetKuId = kuId; // Default to the parent KU (Vocab)

            // --- Handle Kanji Components ---
            if (key.startsWith('Kanji-Component-') && key !== 'Kanji-Component-Meaning' && key !== 'Kanji-Component-Reading') {
                const parts = key.split('-');
                if (parts.length === 3) {
                    const kanjiChar = parts[2];
                    targetKuId = await this.knowledgeUnitsService.ensureKanjiStub(kanjiChar, data);
                }
                // At this point we should have a KU for the Kanji Component, so skip the rest of the loop
                continue;
            }

            // --- Create the Facet (Batch) ---
            // Now we just create the facet pointing to whichever ID we resolved (Vocab or Kanji)
            const newFacetRef = this.db.collection(REVIEW_FACETS_COLLECTION).doc();
            batch.set(newFacetRef, {
                kuId: targetKuId,
                facetType: key,
                srsStage: 0,
                nextReviewAt: now,
                createdAt: now,
                history: [],
                userId: CURRENT_USER_ID,
            });

            count++;
        }

        if (count > 0) {
            try {
                await this.knowledgeUnitsService.update(kuId, {
                    status: 'reviewing',
                    // Atomically increment existing value by count
                    facet_count: FieldValue.increment(count)
                });
                this.logger.log(`Updated parent KU ${kuId}: status=reviewing, facet_count+=${count}`);
            } catch (e) {
                this.logger.error(`Failed to update parent KU ${kuId}`, e);
            }
        }

        await batch.commit();
        return { success: true, count };
    } // END generateReviewFacets

    async getDueReviews() {
        const now = Timestamp.now();

        const snapshot = await this.db.collection(REVIEW_FACETS_COLLECTION)
            .where('userId', '==', CURRENT_USER_ID)
            .where('nextReviewAt', '<=', now)
            .orderBy('nextReviewAt', 'asc')
            .get();

        if (snapshot.empty) {
            this.logger.log(`No due reviews found for user ${CURRENT_USER_ID}`);
            return [];
        }

        // Map in parallel to build the full ReviewItem objects
        const reviewItems = await Promise.all(snapshot.docs.map(async (doc) => {
            const facetData = doc.data();
            const facet = { id: doc.id, ...facetData } as ReviewFacet;

            if (!facet.kuId) {
                this.logger.warn(`Skipping corrupted facet ${facet.id}: missing kuId`);
                return null; // Return null so we can filter it out in the next step
            }

            // Fetch related KU
            // (Assuming findOne handles the 404 gracefully or returns null, 
            // you might want to try/catch here if data integrity is loose)
            let ku: KnowledgeUnit | null = null;
            try {
                ku = await this.knowledgeUnitsService.findOne(facet.kuId);
            } catch (e) {
                this.logger.warn(`Orphaned facet ${facet.id}: KU ${facet.kuId} not found`);
            }

            // Fetch related Lesson
            let lesson: Lesson | null = null;
            if (ku) {
                lesson = await this.lessonsService.findByKuId(ku.id);
            }

            return {
                facet,
                ku,
                lesson
            };
        }));

        // Filter out items where KU was deleted/missing to prevent frontend crashes
        this.logger.log(`Found ${reviewItems.length} due reviews`);
        return reviewItems.filter(item => item !== null && item.ku !== null);
    } // END getDueReviews

    async getAllFacets() {
        const snapshot = await this.db.collection(REVIEW_FACETS_COLLECTION)
            .where('userId', '==', CURRENT_USER_ID)
            .get();

        if (snapshot.empty) {
            return [];
        }

        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                nextReviewAt: data.nextReviewAt instanceof Timestamp ? data.nextReviewAt.toDate().toISOString() : data.nextReviewAt,
                lastReviewAt: data.lastReviewAt instanceof Timestamp ? data.lastReviewAt.toDate().toISOString() : data.lastReviewAt,
                createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            };
        });
    }

}
