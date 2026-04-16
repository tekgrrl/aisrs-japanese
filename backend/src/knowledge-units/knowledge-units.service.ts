import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FIRESTORE_CONNECTION, KNOWLEDGE_UNITS_COLLECTION } from '../firebase/firebase.module';
import { Firestore, Timestamp, DocumentReference } from '@google-cloud/firestore';
import { Inject } from '@nestjs/common';
// Removed CURRENT_USER_ID import
import { KnowledgeUnit } from '@/types';
import { KnowledgeUnitType } from '@/types';
import { NotFoundException } from '@nestjs/common';
import { Query } from '@google-cloud/firestore';

@Injectable()
export class KnowledgeUnitsService {

    private readonly logger = new Logger(KnowledgeUnitsService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) { }

    async findAll(uid: string, { status, type, content }: { status?: string, type?: string, content?: string[] }) {
        try {
            let query: Query = this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
                .where("userId", "==", uid);

            if (status) {
                query = query.where("status", "==", status);
            }

            if (type) {
                query = query.where("type", "==", type);
            }

            if (content) {
                query = query.where("content", "in", content);
            }

            const snapshot = await query.orderBy("createdAt", "desc").get();

            if (snapshot.empty) {
                this.logger.warn("No knowledge units found for user");
                return [];
            }


            const kus: KnowledgeUnit[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const ts = data.createdAt as Timestamp;
                kus.push({
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to string for client-side
                    createdAt: ts.toDate().toISOString(),
                    userId: data.userId || uid, // Ensure userId is present
                } as unknown as KnowledgeUnit);
            });

            return kus;
        } catch (error) {
            this.logger.error("Failed to get knowledge units", error);
            throw error;
        }
    }

    async findByContent(uid: string, content: string, type: KnowledgeUnitType): Promise<KnowledgeUnit | null> {

        // Use Cases: Component Kanji Lookup

        const contentQuery = this.db
            .collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("type", "==", type)
            .where("userId", "==", uid)
            .where("content", "==", content)
            .limit(1);
        const contentSnapshot = await contentQuery.get();

        if (!contentSnapshot.empty) {
            const doc = contentSnapshot.docs[0];
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Convert Firestore Timestamp to string for client-side
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
                userId: data.userId || uid, // Ensure userId is present
            } as unknown as KnowledgeUnit;
        } else {
            this.logger.warn("No knowledge units found for user");
            return null;
        }
    }

    async findByKanjiComponent(uid: string, kanjiChar: string): Promise<KnowledgeUnit[]> {
        // Note: Firestore doesn't support substring search (LIKE %char%).
        // If you don't have a 'components' array on Vocab KUs, you have to do a client-side filter
        // or rely on the fact that you might have stored this relationship.

        // Hack for now: Fetch all Vocab and filter in memory (fine for small datasets < 1000 docs)
        // Better long term: Add an array field `containedKanji` to Vocab KUs.

        const snapshot = await this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
            .where('userId', '==', uid)
            .where('type', '==', 'Vocab')
            .get();

        const matches: KnowledgeUnit[] = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.content && data.content.includes(kanjiChar)) {
                // Rehydrate logic...
                matches.push({ id: doc.id, ...data } as unknown as KnowledgeUnit);
            }
        });

        return matches;
    }

    async ensureKanjiStub(uid: string, char: string, metadata: any): Promise<string> {
        // 1. Try to find existing
        const existing = await this.findByContent(uid, char, 'Kanji');

        if (existing) {
            // Optional: Ensure status is 'learning' if it was 'suspended'
            if (existing.status !== 'learning') {
                await this.db.collection(KNOWLEDGE_UNITS_COLLECTION)
                    .doc(existing.id)
                    .update({ status: 'learning' });
            }
            return existing.id;
        }

        // 2. Create New Stub
        const newRef = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc();
        await newRef.set({
            content: char,
            type: 'Kanji',
            data: {
                meaning: metadata?.meaning || '...',
                onyomi: metadata?.onyomi || [],
                kunyomi: metadata?.kunyomi || [],
            },
            status: 'learning',
            facet_count: 0,
            createdAt: Timestamp.now(), // Use ISO strings for consistency
            relatedUnits: [],
            personalNotes: `Auto-generated component`,
            userId: uid,
        });

        return newRef.id;
    }

    async ensureVocab(uid: string, content: string): Promise<string> {
        // 1. Try to find existing
        const existing = await this.findByContent(uid, content, 'Vocab');

        if (existing) {
            return existing.id;
        }

        // 2. Create New
        const newRef = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc();
        await newRef.set({
            content: content,
            type: 'Vocab',
            data: {
                reading: '', // Will be filled by Gemini
                definition: '', // Will be filled by Gemini
            },
            status: 'learning',
            facet_count: 0,
            createdAt: Timestamp.now(),
            relatedUnits: [],
            personalNotes: '',
            userId: uid,
        });

        return newRef.id;
    }

    async update(uid: string, id: string, updates: Partial<any>) { // typed as 'any' or a DTO to allow flexible updates
        const ref = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(id);

        // verify existence and ownership before writing
        const doc = await ref.get();
        if (!doc.exists || doc.data()?.userId !== uid) {
            throw new NotFoundException(`Knowledge Unit ${id} not found`);
        }

        await ref.update(updates);
        return { id, ...updates };
    }

    async create(uid: string, body: any) {
        // Validate body (basic)
        if (!body.type || !body.content) {
            this.logger.warn("POST /knowledge-units - Validation failed", body);
            throw new BadRequestException("Type and Content are required");
        }

        const newKuData = {
            ...body,
            relatedUnits: body.relatedUnits || [], // Ensure array exists
            data: body.data || {}, // Ensure object exists
            createdAt: Timestamp.now(), // Add Firestore timestamp
            status: "learning",
            facet_count: 0,
            userId: uid,
        };

        const newDocRef = await this.db
            .collection(KNOWLEDGE_UNITS_COLLECTION)
            .add(newKuData);

        this.logger.log(`POST /knowledge-units - Created unit ${newDocRef.id}`);
        return { id: newDocRef.id };
    } // END create

    async bulkUpdate(uid: string, items: Partial<KnowledgeUnit>[]): Promise<{ updated: number; skipped: number; ids: string[] }> {
        if (!Array.isArray(items) || items.length === 0) {
            throw new BadRequestException('items must be a non-empty array');
        }

        // Fields that must never be overwritten by an external caller
        const IMMUTABLE = new Set(['id', 'userId', 'createdAt', 'status', 'facet_count']);

        const toUpdate: { ref: DocumentReference; data: Record<string, any> }[] = [];
        let skipped = 0;

        for (const item of items) {
            if (!item.id) {
                this.logger.warn('bulkUpdate - skipping item missing id', item);
                skipped++;
                continue;
            }
            const payload: Record<string, any> = {};
            for (const [k, v] of Object.entries(item)) {
                if (!IMMUTABLE.has(k)) payload[k] = v;
            }
            if (Object.keys(payload).length === 0) {
                skipped++;
                continue;
            }
            toUpdate.push({
                ref: this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(item.id),
                data: payload,
            });
        }

        const BATCH_SIZE = 500;
        const updatedIds: string[] = [];

        for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
            const chunk = toUpdate.slice(i, i + BATCH_SIZE);
            const batch = this.db.batch();
            for (const { ref, data } of chunk) {
                // merge: true patches without overwriting unmentioned fields
                batch.set(ref, data, { merge: true });
                updatedIds.push(ref.id);
            }
            await batch.commit();
        }

        this.logger.log(`bulkUpdate - updated ${updatedIds.length}, skipped ${skipped}`);
        return { updated: updatedIds.length, skipped, ids: updatedIds };
    }

    async bulkIngest(uid: string, items: Partial<KnowledgeUnit>[]): Promise<{ created: number; skipped: number; ids: string[] }> {
        if (!Array.isArray(items) || items.length === 0) {
            throw new BadRequestException('items must be a non-empty array');
        }

        // Fetch existing content+type combos for this user to support dedup
        const existingSnapshot = await this.db
            .collection(KNOWLEDGE_UNITS_COLLECTION)
            .where('userId', '==', uid)
            .select('content', 'type')
            .get();

        const existingKeys = new Set<string>();
        existingSnapshot.forEach(doc => {
            const d = doc.data();
            if (d.content && d.type) {
                existingKeys.add(`${d.type}::${d.content}`);
            }
        });

        const toCreate: { ref: DocumentReference; data: Record<string, any> }[] = [];
        let skipped = 0;

        for (const item of items) {
            if (!item.content || !item.type) {
                this.logger.warn('bulkIngest - skipping item missing content or type', item);
                skipped++;
                continue;
            }
            const key = `${item.type}::${item.content}`;
            if (existingKeys.has(key)) {
                skipped++;
                continue;
            }
            existingKeys.add(key); // prevent dupes within the same request
            const ref = item.id
                ? this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(item.id)
                : this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc();
            toCreate.push({
                ref,
                data: {
                    content: item.content,
                    type: item.type,
                    data: item.data || {},
                    relatedUnits: item.relatedUnits || [],
                    personalNotes: item.personalNotes || '',
                    userNotes: item.userNotes || '',
                    status: 'learning',
                    facet_count: 0,
                    createdAt: Timestamp.now(),
                    userId: uid,
                },
            });
        }

        // Firestore batch limit is 500 writes per commit
        const BATCH_SIZE = 500;
        const createdIds: string[] = [];

        for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
            const chunk = toCreate.slice(i, i + BATCH_SIZE);
            const batch = this.db.batch();
            for (const { ref, data } of chunk) {
                batch.set(ref, data);
                createdIds.push(ref.id);
            }
            await batch.commit();
        }

        this.logger.log(`bulkIngest - created ${createdIds.length}, skipped ${skipped}`);
        return { created: createdIds.length, skipped, ids: createdIds };
    }

    async findOne(uid: string, id: string): Promise<KnowledgeUnit> {
        const docRef = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new NotFoundException(`Knowledge Unit ${id} not found`);
        }

        const data = doc.data();

        // Enforce Data Isolation
        if (data?.userId !== uid) {
            throw new NotFoundException(`Knowledge Unit ${id} not found`);
        }

        return {
            id: doc.id,
            ...data,
            // Safe Timestamp conversion matching findAll logic
            createdAt: typeof data.createdAt?.toDate === 'function'
                ? data.createdAt.toDate().toISOString()
                : data.createdAt,
        } as unknown as KnowledgeUnit;
    }
}
