import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION, CONCEPTS_COLLECTION, REVIEW_FACETS_COLLECTION, USER_CONCEPTS_SUBCOLLECTION } from '../firebase/firebase.module';
import { UserConcept, ConceptKnowledgeUnit, ReviewFacet } from '../types';

export type UserConceptWithData = UserConcept & {
  concept: ConceptKnowledgeUnit & { id: string };
};

@Injectable()
export class UserConceptsService {
  private readonly logger = new Logger(UserConceptsService.name);

  constructor(@Inject(FIRESTORE_CONNECTION) private readonly db: Firestore) {}

  private userConceptsRef(uid: string) {
    return this.db.collection('users').doc(uid).collection(USER_CONCEPTS_SUBCOLLECTION);
  }

  private facetsColRef(uid: string) {
    return this.db.collection('users').doc(uid).collection(REVIEW_FACETS_COLLECTION);
  }

  async enroll(uid: string, conceptId: string): Promise<UserConceptWithData> {
    const existing = await this.userConceptsRef(uid)
      .where('conceptId', '==', conceptId)
      .limit(1)
      .get();

    const now = Timestamp.now();
    let docId: string;

    if (!existing.empty) {
      docId = existing.docs[0].id;
      await this.userConceptsRef(uid).doc(docId).update({ lastSeenAt: now });
      this.logger.log(`Updated lastSeenAt for uid=${uid} conceptId=${conceptId}`);
    } else {
      const payload: Omit<UserConcept, 'id'> = {
        userId: uid,
        conceptId,
        startedAt: now,
      };
      const ref = await this.userConceptsRef(uid).add(payload);
      docId = ref.id;
      this.logger.log(`Enrolled uid=${uid} in conceptId=${conceptId} userConceptId=${docId}`);
    }

    const [ucDoc, conceptDoc] = await Promise.all([
      this.userConceptsRef(uid).doc(docId).get(),
      this.db.collection(CONCEPTS_COLLECTION).doc(conceptId).get(),
    ]);

    const userConcept = { id: ucDoc.id, ...ucDoc.data() } as UserConcept;
    const concept = { id: conceptDoc.id, ...conceptDoc.data() } as ConceptKnowledgeUnit & { id: string };

    return { ...userConcept, concept };
  }

  async findAllWithData(uid: string): Promise<UserConceptWithData[]> {
    const snapshot = await this.userConceptsRef(uid)
      .orderBy('startedAt', 'desc')
      .get();

    if (snapshot.empty) return [];

    const userConcepts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserConcept));

    const conceptRefs = userConcepts.map(uc => this.db.collection(CONCEPTS_COLLECTION).doc(uc.conceptId));
    const conceptDocs = await this.db.getAll(...conceptRefs);

    const results: UserConceptWithData[] = [];
    for (let i = 0; i < userConcepts.length; i++) {
      const conceptDoc = conceptDocs[i];
      if (!conceptDoc.exists) {
        this.logger.warn(`Concept ${userConcepts[i].conceptId} not found for user-concept ${userConcepts[i].id}`);
        continue;
      }
      results.push({
        ...userConcepts[i],
        concept: { id: conceptDoc.id, ...conceptDoc.data() } as ConceptKnowledgeUnit & { id: string },
      });
    }

    return results;
  }

  async getFacets(uid: string, conceptId: string): Promise<ReviewFacet[]> {
    const snapshot = await this.facetsColRef(uid)
      .where('kuId', '==', conceptId)
      .get();

    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ReviewFacet));
  }

  async createFacets(uid: string, conceptId: string, mechanicIndices: number[], includeAiQuestion = false): Promise<{ created: number }> {
    const conceptDoc = await this.db.collection(CONCEPTS_COLLECTION).doc(conceptId).get();
    if (!conceptDoc.exists) throw new Error(`Concept ${conceptId} not found`);

    const concept = { id: conceptDoc.id, ...conceptDoc.data() } as ConceptKnowledgeUnit & { id: string };
    const now = Timestamp.now();
    const batch = this.db.batch();
    let created = 0;

    for (const idx of mechanicIndices) {
      const mechanic = concept.data.mechanics[idx];
      if (!mechanic) {
        this.logger.warn(`Mechanic index ${idx} out of range for concept ${conceptId}`);
        continue;
      }

      const ref = this.facetsColRef(uid).doc();
      batch.set(ref, {
        kuId: conceptId,
        facetType: 'sentence-assembly',
        srsStage: 0,
        nextReviewAt: now,
        createdAt: now,
        history: [],
        data: {
          mechanicIndex: idx,
          goalTitle: mechanic.goalTitle,
          fragments: mechanic.naturalExample.fragments,
          answer: mechanic.naturalExample.japanese,
          english: mechanic.naturalExample.english,
          accepted_alternatives: mechanic.naturalExample.accepted_alternatives ?? [],
        },
      });
      created++;
    }

    if (includeAiQuestion) {
      const ref = this.facetsColRef(uid).doc();
      batch.set(ref, {
        kuId: conceptId,
        facetType: 'AI-Generated-Question',
        srsStage: 0,
        nextReviewAt: now,
        createdAt: now,
        history: [],
        data: {},
      });
      created++;
    }

    await batch.commit();

    await this.userConceptsRef(uid)
      .where('conceptId', '==', conceptId)
      .limit(1)
      .get()
      .then(snap => {
        if (!snap.empty) {
          snap.docs[0].ref.update({ facetCount: created });
        }
      });

    this.logger.log(`Created ${created} facets for uid=${uid} conceptId=${conceptId}`);
    return { created };
  }
}
