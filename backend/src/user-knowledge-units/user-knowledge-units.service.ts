import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION, KNOWLEDGE_UNITS_COLLECTION, USER_KUS_SUBCOLLECTION } from '../firebase/firebase.module';
import { KnowledgeUnit, UserKnowledgeUnit } from '../types';

@Injectable()
export class UserKnowledgeUnitsService {
  private readonly logger = new Logger(UserKnowledgeUnitsService.name);

  constructor(@Inject(FIRESTORE_CONNECTION) private readonly db: Firestore) {}

  private userKusRef(uid: string) {
    return this.db.collection('users').doc(uid).collection(USER_KUS_SUBCOLLECTION);
  }

  async findByKuId(uid: string, kuId: string): Promise<UserKnowledgeUnit | null> {
    const snapshot = await this.userKusRef(uid)
      .where('kuId', '==', kuId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as UserKnowledgeUnit;
  }

  private async _joinKUs(uid: string, snapshot: FirebaseFirestore.QuerySnapshot): Promise<KnowledgeUnit[]> {
    if (snapshot.empty) return [];

    const ukus = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserKnowledgeUnit));

    const kuRefs = ukus.map(uku => this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(uku.kuId));
    const kuDocs = await this.db.getAll(...kuRefs);

    const result: KnowledgeUnit[] = [];
    for (let i = 0; i < ukus.length; i++) {
      const uku = ukus[i];
      const kuDoc = kuDocs[i];
      if (!kuDoc.exists) {
        this.logger.warn(`Global KU ${uku.kuId} not found for UKU ${uku.id}`);
        continue;
      }
      const kuData = kuDoc.data()!;
      result.push({
        id: kuDoc.id,
        ...kuData,
        personalNotes: uku.personalNotes,
        userNotes: uku.userNotes,
        createdAt: (kuData.createdAt as Timestamp).toDate().toISOString(),
      } as unknown as KnowledgeUnit);
    }

    return result;
  }

  async findAllAsKUs(uid: string): Promise<KnowledgeUnit[]> {
    const snapshot = await this.userKusRef(uid).get();
    return this._joinKUs(uid, snapshot);
  }

  async findLearningQueueAsKUs(uid: string): Promise<KnowledgeUnit[]> {
    const snapshot = await this.userKusRef(uid)
      .where('status', '==', 'learning')
      .get();
    return this._joinKUs(uid, snapshot);
  }

  async create(uid: string, kuId: string): Promise<UserKnowledgeUnit> {
    const existing = await this.findByKuId(uid, kuId);
    if (existing) {
      this.logger.log(`UKU already exists for uid=${uid} kuId=${kuId}`);
      return existing;
    }

    const now = Timestamp.now();
    const payload: Omit<UserKnowledgeUnit, 'id'> = {
      userId: uid,
      kuId,
      personalNotes: '',
      createdAt: now,
      status: 'learning',
      facet_count: 0,
    };

    const ref = await this.userKusRef(uid).add(payload);
    this.logger.log(`Created UKU id=${ref.id} for uid=${uid} kuId=${kuId}`);
    return { id: ref.id, ...payload };
  }
}
