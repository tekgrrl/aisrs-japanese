import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION } from '../firebase/firebase.module';
import { UserRoot } from '../types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(FIRESTORE_CONNECTION) private readonly db: Firestore) {}

  /**
   * Returns the default UserRoot document shape for a newly initialized user.
   * This is the canonical source of truth for what a blank user looks like.
   */
  private buildDefaultUserRoot(uid: string): UserRoot {
    return {
      id: uid,
      stats: {
        reviewForecast: {},
        hourlyForecast: {},
        currentStreak: 0,
        lastReviewDate: Timestamp.now(),
        totalReviews: 0,
        passedReviews: 0,
        levelProgress: {
          n5: { total: 0, mastered: 0 },
          n4: { total: 0, mastered: 0 },
        },
      },
      tutorContext: {
        frontierVocab: [],
        leechVocab: [],
        currentCurriculumNode: 'N5.basics',
        allowedGrammar: [],
        weakGrammarPoints: [],
        communicationStyle: 'balanced',
        semanticWeaknesses: [],
        suggestedThemes: [],
      },
    };
  }

  /**
   * Idempotent find-or-create for a user's root document.
   *
   * - If `users/{uid}` exists, returns the existing data unchanged.
   * - If it does not exist, creates it with sensible defaults and returns that.
   *
   * Safe to call on every request — no overwrites, no side-effects for existing users.
   */
  async findOrCreate(uid: string): Promise<UserRoot> {
    const userRef = this.db.collection('users').doc(uid);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      this.logger.log(`UserRoot found for uid: ${uid}`);
      return { id: uid, ...userDoc.data() } as UserRoot;
    }

    this.logger.log(`UserRoot not found for uid: ${uid}. Creating default document.`);
    const defaultUser = this.buildDefaultUserRoot(uid);

    // Use set() — the doc doesn't exist so there's no overwrite risk.
    // We intentionally don't use merge here because we're creating from scratch.
    await userRef.set(defaultUser);

    this.logger.log(`Default UserRoot created for uid: ${uid}`);
    return defaultUser;
  }

  /**
   * Simple read-only getter. Returns null if the user doesn't exist.
   * Useful for services that need to check existence without side-effects.
   */
  async findById(uid: string): Promise<UserRoot | null> {
    const userDoc = await this.db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      return null;
    }
    return { id: uid, ...userDoc.data() } as UserRoot;
  }
}
