import { Module, Global } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getFirestore } from 'firebase-admin/firestore';
// Custom Token for Injection
export const FIRESTORE_CONNECTION = 'FIRESTORE_CONNECTION';
export const KNOWLEDGE_UNITS_COLLECTION = "knowledge-units";
export const REVIEW_FACETS_COLLECTION = "review-facets";
export const LESSONS_COLLECTION = "lessons";
export const API_LOGS_COLLECTION = "api-logs";
export const QUESTIONS_COLLECTION = "questions";
export const USER_STATS_COLLECTION = 'user-stats';
export const Timestamp = admin.firestore.Timestamp;
export const FieldValue = admin.firestore.FieldValue;

@Global() // Makes this module available everywhere without importing it
@Module({
  imports: [ConfigModule.forRoot()],
  providers: [
    {
      provide: FIRESTORE_CONNECTION,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Prevent double initialization in hot-reload
        if (!admin.apps.length) {
          admin.initializeApp({
            projectId: configService.get<string>('GOOGLE_CLOUD_PROJECT'), // Matches your emulator/project config
          });
        }
        const firestoreDbName = configService.get<string>('FIRESTORE_DB') || '(default)';
        return getFirestore(admin.app(), firestoreDbName);
      },
    },
  ],
  exports: [FIRESTORE_CONNECTION], // Export the provider so other modules can use it
})
export class FirebaseModule { }