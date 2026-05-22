import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { Firestore, Timestamp, Query } from 'firebase-admin/firestore';
import { FIRESTORE_CONNECTION, CONTENT_FLAGS_COLLECTION, LESSONS_COLLECTION } from '../firebase/firebase.module';
import { ApilogService } from '../apilog/apilog.service';
import { ValidationResult, ContentFlag } from '../types';
import { buildValidationPrompt } from '../prompts/validation.prompts';

@Injectable()
export class ValidationService implements OnModuleInit {
  private readonly logger = new Logger(ValidationService.name);
  private client: GoogleGenAI;
  private modelName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly apilogService: ApilogService,
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not defined');
    this.modelName = this.configService.get<string>('MODEL_GEMINI_FLASH') || 'gemini-2.0-flash';
    this.client = new GoogleGenAI({ apiKey });
  }

  async validateContent(segments: string[], jlptLevel: string, uid: string): Promise<ValidationResult> {
    const systemPrompt = buildValidationPrompt(jlptLevel);
    const userMessage = segments.join('\n');

    const logRef = await this.apilogService.startLog({
      timestamp: Timestamp.now(),
      route: '/validation/content',
      status: 'pending',
      modelUsed: this.modelName,
      requestData: { userMessage, jlptLevel, segmentCount: segments.length, uid },
    });

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              valid: { type: 'BOOLEAN' },
              violations: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    segment: { type: 'STRING' },
                    detectedLevel: { type: 'STRING' },
                    type: { type: 'STRING', enum: ['vocab', 'grammar'] },
                  },
                  required: ['segment', 'detectedLevel', 'type'],
                },
              },
            },
            required: ['valid', 'violations'],
          },
        },
      });

      const result = JSON.parse(response.text ?? '{}') as ValidationResult;
      await this.apilogService.completeLog(logRef, {
        status: 'success',
        responseData: { parsedJson: result },
      });
      return result;
    } catch (err) {
      await this.apilogService.completeLog(logRef, {
        status: 'error',
        errorData: { message: (err as Error).message },
      });
      throw err;
    }
  }

  async flagLesson(
    kuId: string,
    kuContent: string,
    userLevel: string,
    result: ValidationResult,
  ): Promise<void> {
    const now = Timestamp.now();

    await this.db.collection(LESSONS_COLLECTION).doc(kuId).update({
      'validation.status': result.valid ? 'pass' : 'fail',
      'validation.checkedAt': now,
      'validation.violations': result.violations ?? [],
    });

    if (!result.valid && result.violations?.length) {
      const flag: Omit<ContentFlag, 'id'> = {
        kuId,
        sourceType: 'lesson',
        sourceId: kuId,
        kuContent,
        userLevel,
        violations: result.violations,
        status: 'open',
        createdAt: now,
      };
      await this.db.collection(CONTENT_FLAGS_COLLECTION).add(flag);
      this.logger.warn(`Content flag created for kuId=${kuId} (${result.violations.length} violation(s))`);
    } else if (result.valid) {
      await this.resolveOpenFlags(kuId, now);
    }
  }

  async flagScenario(
    scenarioId: string,
    title: string,
    userLevel: string,
    result: ValidationResult,
  ): Promise<void> {
    if (!result.valid && result.violations?.length) {
      const flag: Omit<ContentFlag, 'id'> = {
        sourceType: 'scenario',
        sourceId: scenarioId,
        kuContent: title,
        userLevel,
        violations: result.violations,
        status: 'open',
        createdAt: Timestamp.now(),
      };
      await this.db.collection(CONTENT_FLAGS_COLLECTION).add(flag);
      this.logger.warn(`Scenario flag created for id=${scenarioId} (${result.violations.length} violation(s))`);
    }
  }

  async createManualFlag(params: {
    sourceType: 'lesson' | 'scenario';
    sourceId: string;
    kuContent: string;
    userLevel: string;
    manualNote: string;
  }): Promise<string> {
    const flag: Omit<ContentFlag, 'id'> = {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      kuContent: params.kuContent,
      userLevel: params.userLevel,
      violations: [],
      status: 'open',
      manualNote: params.manualNote,
      createdAt: Timestamp.now(),
    };
    const ref = await this.db.collection(CONTENT_FLAGS_COLLECTION).add(flag);
    return ref.id;
  }

  private async resolveOpenFlags(kuId: string, now: Timestamp): Promise<void> {
    const openFlags = await this.db.collection(CONTENT_FLAGS_COLLECTION)
      .where('kuId', '==', kuId)
      .where('status', '==', 'open')
      .get();
    if (!openFlags.empty) {
      const batch = this.db.batch();
      openFlags.docs.forEach(doc => batch.update(doc.ref, { status: 'resolved', resolvedAt: now }));
      await batch.commit();
      this.logger.log(`Resolved ${openFlags.size} open flag(s) for kuId=${kuId}`);
    }
  }

  async getFlags(status?: string): Promise<ContentFlag[]> {
    let query: Query = this.db.collection(CONTENT_FLAGS_COLLECTION);
    if (status) {
      query = query.where('status', '==', status);
    }
    query = query.orderBy('createdAt', 'desc').limit(100);
    const snap = await query.get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ContentFlag);
  }

  async updateFlag(
    flagId: string,
    updates: { status: 'resolved' | 'dismissed'; dismissNote?: string },
  ): Promise<void> {
    const ref = this.db.collection(CONTENT_FLAGS_COLLECTION).doc(flagId);
    const payload: Record<string, any> = { status: updates.status };
    if (updates.status === 'dismissed' && updates.dismissNote) {
      payload.dismissNote = updates.dismissNote;
    }
    if (updates.status === 'resolved') {
      payload.resolvedAt = Timestamp.now();
    }
    await ref.update(payload);
  }
}
