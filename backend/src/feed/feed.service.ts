import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import {
  FIRESTORE_CONNECTION,
  GLOBAL_KNOWLEDGE_UNITS_COLLECTION,
  KNOWLEDGE_UNITS_COLLECTION,
  REVIEW_FACETS_COLLECTION,
} from '../firebase/firebase.module';
import { UserService } from '../users/user.service';
import {
  FeedItem,
  FeedItemType,
  FeedQueueSummary,
  GlobalKnowledgeUnit,
  KnowledgeUnit,
  ReviewFacet,
  UserRoot,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_DAILY_MAX_TOTAL = 20;
const DEFAULT_DAILY_MAX_NEW = 5;

/** Priority tiers — lower number = higher priority. */
const PRIORITY = {
  REVIEW: 1,
  LEECH_REPAIR: 2,
  LEARN: 3,
} as const;

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly userService: UserService,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────

  /**
   * Generates (or refreshes) the user's daily feed queue.
   *
   * Steps:
   * 1. Load user context and extract preferences/limits.
   * 2. Fetch currently pending feed items (for dedup).
   * 3. Collect due reviews → feed items (priority 1).
   * 4. Collect leech-repair items from tutorContext.leechVocab (priority 2).
   * 5. Evaluate global curriculum DAG → eligible new learn items (priority 3).
   * 6. Cap, deduplicate, batch-write new items.
   * 7. Return summary.
   */
  async generateDailyFeedQueue(uid: string): Promise<FeedQueueSummary> {
    this.logger.log(`Starting Daily Feed generation for user: ${uid}`);

    // 1. User context ---------------------------------------------------
    const userData: UserRoot = await this.userService.findOrCreate(uid);
    const tutorContext = userData.tutorContext ?? ({} as UserRoot['tutorContext']);

    const maxTotal = tutorContext.preferences?.dailyMaxTotal ?? DEFAULT_DAILY_MAX_TOTAL;
    const maxNew = tutorContext.preferences?.dailyMaxNew ?? DEFAULT_DAILY_MAX_NEW;

    this.logger.log(`Limits — maxTotal: ${maxTotal}, maxNew: ${maxNew}`);

    // 2. Existing pending feed items (for dedup) ------------------------
    const feedRef = this.db.collection('users').doc(uid).collection('feed');
    const existingPending = await feedRef.where('status', '==', 'pending').get();

    const existingTargetIds = new Set<string>();
    existingPending.forEach((doc) => {
      const data = doc.data();
      if (data.targetId) existingTargetIds.add(data.targetId);
    });

    const currentPendingCount = existingPending.size;
    this.logger.log(`Current pending feed items: ${currentPendingCount}`);

    // Budget remaining
    let budgetRemaining = Math.max(0, maxTotal - currentPendingCount);
    if (budgetRemaining === 0) {
      this.logger.log(`User ${uid} already at max pending (${currentPendingCount}). Skipping generation.`);
      return {
        success: true,
        uid,
        added: { reviews: 0, leeches: 0, learns: 0 },
        totalPending: currentPendingCount,
        message: 'Feed queue already at capacity.',
      };
    }

    const newItems: Omit<FeedItem, 'id'>[] = [];
    const now = Timestamp.now();

    // 3. Due reviews (priority 1) ----------------------------------------
    const reviewItems = await this.collectDueReviews(uid, existingTargetIds, now);
    for (const item of reviewItems) {
      if (budgetRemaining <= 0) break;
      newItems.push(item);
      existingTargetIds.add(item.targetId);
      budgetRemaining--;
    }
    const reviewsAdded = newItems.filter((i) => i.type === 'review').length;
    this.logger.log(`Reviews to add: ${reviewsAdded}`);

    // 4. Leech repairs (priority 2) --------------------------------------
    if (budgetRemaining > 0) {
      const leechItems = await this.collectLeechRepairs(uid, tutorContext, existingTargetIds, now);
      for (const item of leechItems) {
        if (budgetRemaining <= 0) break;
        newItems.push(item);
        existingTargetIds.add(item.targetId);
        budgetRemaining--;
      }
    }
    const leechesAdded = newItems.filter((i) => i.type === 'leech-repair').length;
    this.logger.log(`Leech repairs to add: ${leechesAdded}`);

    // 5. New learn items (priority 3) — capped at maxNew ----------------
    if (budgetRemaining > 0) {
      const learnBudget = Math.min(budgetRemaining, maxNew);
      const learnItems = await this.collectNewLearns(uid, tutorContext, existingTargetIds, learnBudget, now);
      for (const item of learnItems) {
        newItems.push(item);
        existingTargetIds.add(item.targetId);
        budgetRemaining--;
      }
    }
    const learnsAdded = newItems.filter((i) => i.type === 'learn').length;
    this.logger.log(`New learns to add: ${learnsAdded}`);

    // 6. Batch write ----------------------------------------------------
    if (newItems.length > 0) {
      const batch = this.db.batch();
      for (const item of newItems) {
        const docRef = feedRef.doc();
        batch.set(docRef, item);
      }
      await batch.commit();
      this.logger.log(`Batch committed: ${newItems.length} new feed items.`);
    }

    const totalPending = currentPendingCount + newItems.length;

    // 7. Summary --------------------------------------------------------
    return {
      success: true,
      uid,
      added: {
        reviews: reviewsAdded,
        leeches: leechesAdded,
        learns: learnsAdded,
      },
      totalPending,
      message: `Feed generated. Added ${newItems.length} items (${reviewsAdded}R / ${leechesAdded}L / ${learnsAdded}N).`,
    };
  }

  /**
   * Returns the user's current pending feed queue, ordered by priority → addedAt.
   */
  async getDailyFeed(uid: string): Promise<FeedItem[]> {
    const feedRef = this.db.collection('users').doc(uid).collection('feed');

    const snapshot = await feedRef
      .where('status', '==', 'pending')
      .orderBy('priority', 'asc')
      .orderBy('addedAt', 'asc')
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as FeedItem[];
  }

  /**
   * Marks a single feed item as completed.
   */
  async completeItem(uid: string, feedItemId: string): Promise<{ success: boolean }> {
    const feedItemRef = this.db
      .collection('users')
      .doc(uid)
      .collection('feed')
      .doc(feedItemId);

    const doc = await feedItemRef.get();
    if (!doc.exists) {
      throw new NotFoundException(`Feed item ${feedItemId} not found.`);
    }

    await feedItemRef.update({
      status: 'completed',
      completedAt: Timestamp.now(),
    });

    this.logger.log(`Feed item ${feedItemId} marked as completed for user ${uid}.`);
    return { success: true };
  }

  // ─── Private: Collection Strategies ────────────────────────────────

  /**
   * Collect all due review facets and convert to FeedItem shapes.
   * Deduplicates against already-queued target IDs.
   */
  private async collectDueReviews(
    uid: string,
    existingTargetIds: Set<string>,
    now: Timestamp,
  ): Promise<Omit<FeedItem, 'id'>[]> {
    const snapshot = await this.db
      .collection(REVIEW_FACETS_COLLECTION)
      .where('userId', '==', uid)
      .where('nextReviewAt', '<=', now)
      .orderBy('nextReviewAt', 'asc')
      .get();

    if (snapshot.empty) return [];

    // For each facet, look up the parent KU to get content/type
    const items: Omit<FeedItem, 'id'>[] = [];

    for (const doc of snapshot.docs) {
      const facet = doc.data() as ReviewFacet;
      if (existingTargetIds.has(doc.id)) continue; // already queued
      if (!facet.kuId) continue; // corrupted

      // Look up KU for denormalized fields
      const kuDoc = await this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(facet.kuId).get();
      const ku = kuDoc.exists ? (kuDoc.data() as KnowledgeUnit) : null;

      items.push({
        type: 'review',
        targetId: doc.id,
        kuId: facet.kuId,
        kuContent: ku?.content ?? '???',
        kuType: ku?.type ?? 'Vocab',
        priority: PRIORITY.REVIEW,
        status: 'pending',
        addedAt: now,
      });
    }

    return items;
  }

  /**
   * Collect leech-repair items from tutorContext.leechVocab.
   * For each leech vocab content string, find the user's KU and create a feed item.
   */
  private async collectLeechRepairs(
    uid: string,
    tutorContext: UserRoot['tutorContext'],
    existingTargetIds: Set<string>,
    now: Timestamp,
  ): Promise<Omit<FeedItem, 'id'>[]> {
    const leechVocab = tutorContext.leechVocab ?? [];
    if (leechVocab.length === 0) return [];

    const items: Omit<FeedItem, 'id'>[] = [];

    // Batch lookup: find user KUs matching leech content strings
    for (const content of leechVocab) {
      const kuSnapshot = await this.db
        .collection(KNOWLEDGE_UNITS_COLLECTION)
        .where('userId', '==', uid)
        .where('content', '==', content)
        .limit(1)
        .get();

      if (kuSnapshot.empty) continue;

      const kuDoc = kuSnapshot.docs[0];
      const ku = kuDoc.data() as KnowledgeUnit;

      if (existingTargetIds.has(kuDoc.id)) continue; // already queued

      items.push({
        type: 'leech-repair',
        targetId: kuDoc.id,
        kuId: kuDoc.id,
        kuContent: ku.content,
        kuType: ku.type,
        priority: PRIORITY.LEECH_REPAIR,
        status: 'pending',
        addedAt: now,
      });
    }

    return items;
  }

  /**
   * Evaluate the global curriculum DAG to find the next eligible items for learning.
   *
   * Strategy:
   * 1. Fetch all GlobalKnowledgeUnit docs.
   * 2. Fetch all of the user's existing KU content strings (to know what's already learned).
   * 3. For each global node, check prerequisites:
   *    - If prerequisites is empty/undefined → immediately eligible.
   *    - Otherwise, all prerequisite global KU IDs must map to user KUs
   *      in 'reviewing' or 'mastered' status.
   * 4. Filter out any global KU whose content already exists in the user's collection.
   * 5. Return eligible items up to the budget limit.
   */
  private async collectNewLearns(
    uid: string,
    tutorContext: UserRoot['tutorContext'],
    existingTargetIds: Set<string>,
    budget: number,
    now: Timestamp,
  ): Promise<Omit<FeedItem, 'id'>[]> {
    if (budget <= 0) return [];

    this.logger.log(`Evaluating global curriculum for user node: ${tutorContext.currentCurriculumNode}`);

    // 1. Fetch global KUs
    const globalSnapshot = await this.db.collection(GLOBAL_KNOWLEDGE_UNITS_COLLECTION).get();

    if (globalSnapshot.empty) {
      this.logger.warn('No global knowledge units found. Curriculum is empty.');
      return [];
    }

    const globalKUs: (GlobalKnowledgeUnit & { docId: string })[] = [];
    globalSnapshot.forEach((doc) => {
      globalKUs.push({ id: doc.id, docId: doc.id, ...doc.data() } as GlobalKnowledgeUnit & { docId: string });
    });

    // 2. Fetch all user KU content strings + statuses (for prerequisite checks & dedup)
    const userKUSnapshot = await this.db
      .collection(KNOWLEDGE_UNITS_COLLECTION)
      .where('userId', '==', uid)
      .get();

    // Map: global KU content → user's KU status (for dedup)
    const userContentMap = new Map<string, { status: string; id: string }>();
    // Map: global KU ID → user's status (for prerequisite resolution)
    // Since global data was copied from user data, the global doc ID might match the user doc ID.
    // But more robustly, we'll match by content.
    const userContentStatus = new Map<string, string>();

    userKUSnapshot.forEach((doc) => {
      const data = doc.data();
      userContentMap.set(data.content, { status: data.status, id: doc.id });
      userContentStatus.set(data.content, data.status);
    });

    // Build a content→globalId lookup for prerequisite resolution
    const globalContentToId = new Map<string, string>();
    for (const gku of globalKUs) {
      globalContentToId.set(gku.content, gku.docId);
    }

    // Build globalId→content for reverse lookup in prerequisite checks
    const globalIdToContent = new Map<string, string>();
    for (const gku of globalKUs) {
      globalIdToContent.set(gku.docId, gku.content);
    }

    // 3. Filter eligible global KUs
    const eligible: GlobalKnowledgeUnit[] = [];

    for (const gku of globalKUs) {
      // Skip if user already has this content
      if (userContentMap.has(gku.content)) continue;

      // Skip if already queued in feed
      if (existingTargetIds.has(gku.docId)) continue;

      // Check prerequisites (DAG traversal)
      const prereqs = gku.prerequisites ?? [];
      if (prereqs.length > 0) {
        const allMet = prereqs.every((prereqId) => {
          // Resolve prereqId → content → user status
          const prereqContent = globalIdToContent.get(prereqId);
          if (!prereqContent) return false; // prerequisite global KU doesn't exist — treat as unmet
          const userStatus = userContentStatus.get(prereqContent);
          return userStatus === 'reviewing' || userStatus === 'mastered';
        });

        if (!allMet) continue; // Prerequisites not satisfied
      }

      eligible.push(gku);
    }

    this.logger.log(`Eligible new learn items from curriculum: ${eligible.length} (budget: ${budget})`);

    // 4. Take up to budget
    const selected = eligible.slice(0, budget);

    return selected.map((gku) => ({
      type: 'learn' as FeedItemType,
      targetId: gku.id, // Global KU ID
      kuId: gku.id,
      kuContent: gku.content,
      kuType: gku.type,
      priority: PRIORITY.LEARN,
      status: 'pending' as const,
      addedAt: now,
    }));
  }
}
