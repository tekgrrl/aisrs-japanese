import { Injectable, Inject, Logger } from '@nestjs/common';
import { FIRESTORE_CONNECTION, API_LOGS_COLLECTION } from '../firebase/firebase.module';
import { Firestore } from 'firebase-admin/firestore';
import { ApiLog } from '../types';

@Injectable()
export class ApilogService {
    private readonly logger = new Logger(ApilogService.name);
    
    constructor(
        @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    ) {}

    async testConnection() {
        const snapshot = await this.db.collection(API_LOGS_COLLECTION).limit(1).get();
        this.logger.log(`Found ${snapshot.size} api logs`);
    }

    async startLog(log: ApiLog) {
        // Await the DB write, get the reference
        const docRef = await this.db.collection(API_LOGS_COLLECTION).add(log);
        
        // Return just the ID string
        return docRef;
    }

    async completeLog(logRef: any, updates: Partial<ApiLog>) {

        await logRef.update(updates);
    }
}
