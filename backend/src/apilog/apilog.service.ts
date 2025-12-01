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
}
