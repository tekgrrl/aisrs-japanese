import { Injectable, Inject, Logger } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION, GRAMMAR_SECTIONS_COLLECTION } from '../firebase/firebase.module';
import { GrammarSection } from '../types';

@Injectable()
export class GrammarSectionsService {
    private readonly logger = new Logger(GrammarSectionsService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) { }

    async findAll(): Promise<GrammarSection[]> {
        const snapshot = await this.db.collection(GRAMMAR_SECTIONS_COLLECTION).orderBy('sectionLabel').get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GrammarSection));
    }

    async findById(id: string): Promise<GrammarSection | null> {
        const doc = await this.db.collection(GRAMMAR_SECTIONS_COLLECTION).doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() } as GrammarSection;
    }
}
