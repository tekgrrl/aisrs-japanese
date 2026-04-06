import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION } from '../firebase/firebase.module';
import { UsersService } from '../users/users.service';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly usersService: UsersService,
  ) {}

  async generateDailyFeedQueue(uid: string) {
    this.logger.log(`Starting Daily Feed generation for user: ${uid}`);

    // Delegate user initialization to UsersService (idempotent find-or-create)
    const userData = await this.usersService.findOrCreate(uid);
    const tutorContext = userData.tutorContext || {};

    // SKELETON LOGIC: Evaluate global curriculum graph against user progress
    // Assume we have a global collection holding the curriculum structure.
    this.logger.log(`Evaluating global curriculum graph for User node: ${tutorContext.currentCurriculumNode}`);

    // Simulation of evaluating curriculum
    const upcomingConcepts = [
        { id: 'concept_1', type: 'Vocab', content: '新しい' },
        { id: 'concept_2', type: 'Kanji', content: '新' }
    ];

    // Build the Daily Feed queue
    const userRootRef = this.db.collection('users').doc(uid);
    const dailyFeedRef = userRootRef.collection('feed');
    
    // As a skeleton, we just append to the feed collection
    const batch = this.db.batch();
    
    const feedSnapshot = await dailyFeedRef.where('status', '==', 'pending').get();
    let currentPendingCount = feedSnapshot.size;

    const newFeedItems: any[] = [];

    // Simple evaluation logic: Only add items if pending feed queue is low
    if (currentPendingCount < 5) {
        for (const concept of upcomingConcepts) {
            const feedItemRef = dailyFeedRef.doc();
            const feedItem = {
                targetKuId: concept.id,
                type: concept.type,
                content: concept.content,
                status: 'pending',
                addedAt: Timestamp.now(),
                priority: 1
            };
            batch.set(feedItemRef, feedItem);
            newFeedItems.push(feedItem);
        }

        await batch.commit();
        this.logger.log(`Daily Feed generated. Added ${upcomingConcepts.length} items to user/${uid}/feed.`);
    } else {
        this.logger.log(`User ${uid} already has sufficient pending feed items.`);
    }

    return {
        success: true,
        uid: uid,
        generatedItems: newFeedItems.length,
        message: 'Daily feed evaluation completed.'
    };
  }
}

