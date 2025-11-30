import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';

// Custom Token for Injection
export const FIRESTORE_CONNECTION = 'FIRESTORE_CONNECTION';
export const KNOWLEDGE_UNITS_COLLECTION = "knowledge-units";
export const REVIEW_FACETS_COLLECTION = "review-facets";
export const LESSONS_COLLECTION = "lessons";
export const API_LOGS_COLLECTION = "api-logs";
export const QUESTIONS_COLLECTION = "questions"; 
export const Timestamp = admin.firestore.Timestamp;
export const FieldValue = admin.firestore.FieldValue;

@Global() // Makes this module available everywhere without importing it
@Module({
  providers: [
    {
      provide: FIRESTORE_CONNECTION,
      useFactory: () => {
        // Prevent double initialization in hot-reload
        if (!admin.apps.length) {
          admin.initializeApp({
            projectId: 'aisrs-japanese-dev', // Matches your emulator/project config
            // credential: ... (Add prod cert logic here later)
          });
        }
        return admin.firestore();
      },
    },
  ],
  exports: [FIRESTORE_CONNECTION], // Export the provider so other modules can use it
})
export class FirebaseModule {}