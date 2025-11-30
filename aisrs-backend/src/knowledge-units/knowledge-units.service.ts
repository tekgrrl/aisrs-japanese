import { Injectable, Logger } from '@nestjs/common';
import { FIRESTORE_CONNECTION, KNOWLEDGE_UNITS_COLLECTION } from '../firebase/firebase.module';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { Inject } from '@nestjs/common';
import { CURRENT_USER_ID } from '../lib/constants';
import { KnowledgeUnit } from '@/types';
import { KnowledgeUnitType } from '@/types';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class KnowledgeUnitsService {
    private readonly logger = new Logger(KnowledgeUnitsService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) { }

    async getAll() {
        try {
            const snapshot = await this.db
                .collection(KNOWLEDGE_UNITS_COLLECTION)
                .where("userId", "==", CURRENT_USER_ID)
                .orderBy("createdAt", "desc") // Order by creation time, newest first
                .get();

            if (snapshot.empty) {
                this.logger.warn("No knowledge units found for user");
                return [];
            }

            const kus: KnowledgeUnit[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                kus.push({
                    id: doc.id,
                    ...data,
                    // Convert Firestore Timestamp to string for client-side
                    createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
                    userId: data.userId || CURRENT_USER_ID, // Ensure userId is present
                } as unknown as KnowledgeUnit);
            });

            return kus;
        } catch (error) {
            this.logger.error("Failed to get knowledge units", error);
            throw error;
        }
    }

    async findByContent(content: string, type: KnowledgeUnitType): Promise<KnowledgeUnit | null> {

        // Use Cases: Component Kanji Lookup

        const contentQuery = this.db
            .collection(KNOWLEDGE_UNITS_COLLECTION)
            .where("type", "==", type)
            .where("userId", "==", CURRENT_USER_ID)
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
                userId: data.userId || CURRENT_USER_ID, // Ensure userId is present
            } as unknown as KnowledgeUnit;
        } else {
            this.logger.warn("No knowledge units found for user");
            return null;
        }
    }

    async ensureKanjiStub(char: string, metadata: any): Promise<string> {
        // 1. Try to find existing
        const existing = await this.findByContent(char, 'Kanji');

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
            createdAt: new Date().toISOString(), // Use ISO strings for consistency
            relatedUnits: [],
            personalNotes: `Auto-generated component`,
            userId: CURRENT_USER_ID,
        });

        return newRef.id;
    } // END ensureKanjiStub

    async update(id: string, updates: Partial<any>) { // typed as 'any' or a DTO to allow flexible updates
        const ref = this.db.collection(KNOWLEDGE_UNITS_COLLECTION).doc(id);

        // verify existence and ownership before writing
        const doc = await ref.get();
        if (!doc.exists || doc.data()?.userId !== CURRENT_USER_ID) {
            throw new NotFoundException(`Knowledge Unit ${id} not found`);
        }

        await ref.update(updates);
        return { id, ...updates };
    }
}
