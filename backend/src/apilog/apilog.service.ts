import { Injectable, Inject, Logger } from '@nestjs/common';
import { FIRESTORE_CONNECTION, API_LOGS_COLLECTION } from '../firebase/firebase.module';
import { Firestore } from 'firebase-admin/firestore';
import { ApiLog } from '../types';

@Injectable()
export class ApilogService {
    private readonly logger = new Logger(ApilogService.name);

    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) { }

    async startLog(log: ApiLog) {
        this.logger.log(`Starting log for ${log.route}`);
        const docRef = await this.db.collection(API_LOGS_COLLECTION).add(log);
        return docRef;
    }

    async completeLog(logRef: any, updates: Partial<ApiLog>) {
        this.logger.log(`Completing log for ${logRef.id}`);
        await logRef.update(updates);
    }

    async findAll(limit: number, route?: string, status?: string): Promise<ApiLog[]> {
        let query: FirebaseFirestore.Query = this.db.collection(API_LOGS_COLLECTION);

        if (route) {
            query = query.where('route', '==', route);
        }

        if (status) {
            query = query.where('status', '==', status);
        }

        // Order by timestamp desc
        try {
            query = query.orderBy('timestamp', 'desc');
        } catch (error) {
            this.logger.warn(`Ordering by timestamp failed, likely due to missing index or conflicting filters: ${error}`);
        }

        query = query.limit(limit);

        const snapshot = await query.get();
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // formatting timestamp to string/date for the frontend if needed?
                // For now, let's return raw data, but maybe convert Timestamp to string if serialization fails
                timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp
            } as ApiLog;
        });
    }
}
