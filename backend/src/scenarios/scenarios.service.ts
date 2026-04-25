import {
  Injectable,
  Logger,
  Inject,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { Firestore, CollectionReference, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { Scenario, GenerateScenarioDto, ScenarioState, ExtractedKU, ChatMessage, ScenarioEvaluation, ScenarioAttempt } from '../types/scenario';
import { KnowledgeUnitsService } from '../knowledge-units/knowledge-units.service';
import { UserKnowledgeUnitsService } from '../user-knowledge-units/user-knowledge-units.service';
import { LessonsService } from '../lessons/lessons.service';
import { UserService } from '../users/user.service';
import { FIRESTORE_CONNECTION, SCENARIOS_COLLECTION, REVIEW_FACETS_COLLECTION } from '../firebase/firebase.module';
import { GeminiService } from '../gemini/gemini.service';
import { ALLOWED_USER_ROLES, ALLOWED_AI_ROLES, buildArchitectPrompt, buildChatSystemPrompt } from '../prompts/scenario.prompts';

import { ScenarioTemplate, SCENARIO_TEMPLATES } from './templates';

@Injectable()
export class ScenariosService {
  private readonly logger = new Logger(ScenariosService.name);
  private collectionRef: CollectionReference;

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly geminiService: GeminiService,
    private readonly knowledgeUnitsService: KnowledgeUnitsService,
    private readonly userKnowledgeUnitsService: UserKnowledgeUnitsService,
    private readonly lessonsService: LessonsService,
    private readonly userService: UserService,
  ) {
    this.collectionRef = this.db.collection(SCENARIOS_COLLECTION);
  }

  async getAllScenarios(userId: string, limitDays?: number): Promise<Scenario[]> {
    let query = this.collectionRef
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc');

    if (limitDays) {
      const date = new Date();
      date.setDate(date.getDate() - limitDays);
      const timestamp = Timestamp.fromDate(date);
      query = query.where('createdAt', '>', timestamp);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => doc.data() as Scenario);
  }

  async getScenariosBySourceKuId(userId: string, sourceKuId: string): Promise<Pick<Scenario, 'id' | 'title' | 'sourceContextSentence' | 'createdAt'>[]> {
    const snapshot = await this.collectionRef
      .where('userId', '==', userId)
      .where('sourceKuId', '==', sourceKuId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(doc => {
      const d = doc.data() as Scenario;
      return { id: doc.id, title: d.title, sourceContextSentence: d.sourceContextSentence, createdAt: d.createdAt };
    });
  }

  getTemplates(): ScenarioTemplate[] {
    return SCENARIO_TEMPLATES;
  }

  async getScenario(uid: string, id: string): Promise<Scenario | null> {
    const doc = await this.collectionRef.doc(id).get();
    if (!doc.exists) return null;
    const data = doc.data() as Scenario;
    if (data.userId !== uid) return null;
    return data;
  }

  async generateScenario(userId: string, dto: GenerateScenarioDto): Promise<string> {
    // Apply user preferences as defaults for fields not explicitly set in the DTO
    const userPrefs = (await this.userService.findById(userId))?.preferences;
    const resolvedDto: GenerateScenarioDto = {
      ...dto,
      difficulty: dto.difficulty ?? userPrefs?.jlptLevel ?? 'N4',
      userRole: dto.userRole ?? userPrefs?.preferredUserRole,
    };

    const prompt = buildArchitectPrompt(resolvedDto);

    try {
      const jsonString = await this.geminiService.generateScenario(prompt);
      const data = JSON.parse(jsonString);

      const docRef = this.collectionRef.doc();
      const id = docRef.id;

      // Helper to clean "helpful" formatting like "本屋 (Bookstore)" or "ほんや (honya)"
      const cleanContent = (str: string) => str ? str.replace(/\(.*\)/g, '').replace(/（.*）/g, '').trim() : '';
      const cleanMeaning = (str: string) => str ? str.replace(/^-/, '').trim() : '';

      const newScenario: Scenario = {
        id,
        userId,
        title: data.title,
        description: data.description,
        difficultyLevel: resolvedDto.difficulty!,
        setting: {
          location: data.setting.location,
          participants: data.setting.participants,
          goal: data.setting.goal,
          timeOfDay: data.setting.timeOfDay,
          visualPrompt: data.setting.visualPrompt,
        },
        roles: data.roles,
        dialogue: data.dialogue,
        extractedKUs: data.extractedKUs.map((ku: any) => ({
          content: cleanContent(ku.content),
          reading: cleanContent(ku.reading),
          meaning: cleanMeaning(ku.meaning),
          type: 'vocab',
          status: 'new',
          jlptLevel: ku.jlptLevel ?? null,
        })),
        grammarNotes: data.grammarNotes,
        state: 'encounter',
        createdAt: Timestamp.now(),
        chatHistory: [],
        isObjectiveMet: false,
        isActive: true,
        sourceType: resolvedDto.sourceType,
        sourceContextSentence: resolvedDto.sourceContextSentence,
        targetVocab: resolvedDto.targetVocab,
        sourceKuId: resolvedDto.sourceKuId
      };

      const cleanData = Object.fromEntries(
        Object.entries(newScenario).filter(([_, value]) => value !== undefined)
      );

      await docRef.set(cleanData);
      return id;

    } catch (error) {
      this.logger.error('Scenario Generation Failed:', error);
      throw new InternalServerErrorException('Failed to generate scenario from AI', error);
    }
  }

  async advanceState(uid: string, id: string): Promise<void> {
    this.logger.log(`Advancing state for scenario ${id}`);
    const scenario = await this.getScenario(uid, id);
    if (!scenario) throw new NotFoundException('Scenario not found');

    let newState: ScenarioState = scenario.state;
    // Prepare updates object
    const updateData: Record<string, any> = {};

    switch (scenario.state) {
      case 'encounter':
        // Transition Encounter -> Drill
        // Link each extracted KU to its global KU and create a UserKnowledgeUnit.
        if (scenario.extractedKUs && scenario.extractedKUs.length > 0) {
          const updatedKUs: ExtractedKU[] = [];

          for (const ku of scenario.extractedKUs) {
            if (ku.kuId) {
              updatedKUs.push(ku);
              continue;
            }

            try {
              const globalKu = await this.knowledgeUnitsService.findByContent(ku.content, 'Vocab');

              if (globalKu) {
                this.logger.log(`Linking "${ku.content}" to existing global KU ${globalKu.id}`);
                await this.userKnowledgeUnitsService.create(uid, globalKu.id);
                updatedKUs.push({ ...ku, kuId: globalKu.id, status: 'learning' });
              } else {
                this.logger.log(`No global KU found for "${ku.content}" — creating new KU with level hint ${ku.jlptLevel ?? 'none'}`);
                const newKuId = await this.knowledgeUnitsService.ensureVocab(ku.content, {
                  reading: ku.reading,
                  definition: ku.meaning,
                  jlptLevel: ku.jlptLevel,
                });
                await this.userKnowledgeUnitsService.create(uid, newKuId);
                updatedKUs.push({ ...ku, kuId: newKuId, status: 'learning' });
              }
            } catch (error) {
              this.logger.error(`Failed to process KU "${ku.content}" during advanceState`, error);
              updatedKUs.push(ku);
            }
          }

          updateData.extractedKUs = updatedKUs;
        }

        // Emit Grammar KUs + UKUs + UserGrammarLessons for each grammar note
        if (scenario.grammarNotes && scenario.grammarNotes.length > 0) {
          for (const note of scenario.grammarNotes) {
            try {
              const kuId = await this.knowledgeUnitsService.ensureGrammarKU(note);
              await this.userKnowledgeUnitsService.create(uid, kuId);
              await this.lessonsService.createUserGrammarLesson(
                uid,
                kuId,
                { sourceType: 'scenario', sourceId: scenario.id, sourceTitle: scenario.title },
                note.exampleInContext,
              );
            } catch (err) {
              this.logger.error(`Failed to process grammar note "${note.title}"`, err);
            }
          }
          this.logger.log(`Processed ${scenario.grammarNotes.length} grammar notes for uid=${uid} scenarioId=${scenario.id}`);
        }

        newState = 'drill';
        break;
      case 'drill':
        newState = 'simulate';
        // Seed chat history if AI speaks first
        const initialHistory = this.getInitialChatHistory(scenario);
        if (initialHistory.length > 0) {
          updateData.chatHistory = initialHistory;
        }
        break;
      case 'simulate':
        newState = 'completed';
        break;
    }

    updateData.state = newState;

    if (newState === 'completed') {
      updateData.completedAt = Timestamp.now();

      // GENERATE EVALUATION
      if (scenario.chatHistory && scenario.chatHistory.length > 0) {
        try {
          const evaluation = await this.generateEvaluation(scenario);
          if (evaluation) {
            updateData.evaluation = evaluation;
          }
        } catch (e) {
          this.logger.error("Failed to generate scenario evaluation", e);
        }
      }
    }

    this.logger.log(`Updating state for scenario ${id} to ${newState}`);
    await this.collectionRef.doc(id).update(updateData);
  }



  async resetSession(uid: string, id: string, archive: boolean): Promise<void> {
    this.logger.log(`Resetting session for scenario ${id} (Archive: ${archive})`);
    const scenario = await this.getScenario(uid, id);
    if (!scenario) throw new NotFoundException('Scenario not found');

    const updateData: any = {
      state: 'simulate',
      chatHistory: this.getInitialChatHistory(scenario), // Reset to initial seed if applicable
      evaluation: FieldValue.delete(), // clear evaluation
      completedAt: FieldValue.delete(), // clear completedAt
      isObjectiveMet: false, // Reset objective met status
      isActive: true, // Reset to active too
    };

    // Archiving Logic
    if (archive && scenario.state === 'completed' && scenario.chatHistory && scenario.evaluation && scenario.completedAt) {
      const attempt: ScenarioAttempt = {
        completedAt: scenario.completedAt,
        chatHistory: scenario.chatHistory,
        evaluation: scenario.evaluation
      };
      updateData.pastAttempts = FieldValue.arrayUnion(attempt);
    }

    await this.collectionRef.doc(id).update(updateData);
  }

  async deactivateScenario(uid: string, id: string): Promise<void> {
    this.logger.log(`Deactivating scenario ${id}`);
    const scenario = await this.getScenario(uid, id);
    if (!scenario) throw new NotFoundException('Scenario not found');
    await this.collectionRef.doc(id).update({ isActive: false });
  }

  async handleChat(uid: string, id: string, userMessage: string): Promise<ChatMessage[]> {
    const scenario = await this.getScenario(uid, id);
    if (!scenario) throw new NotFoundException('Scenario not found');

    // 1. Construct User Message
    const userMsgObj: ChatMessage = {
      speaker: 'user',
      text: userMessage,
      timestamp: Date.now(),
    };

    // 2. Format History
    let historyLines = "No previous conversation.";
    if (scenario.chatHistory && scenario.chatHistory.length > 0) {
      historyLines = scenario.chatHistory.map(msg => {
        const role = msg.speaker === 'user' ? 'User' : 'AI';
        return `${role}: ${msg.text}`;
      }).join('\n');
    }

    // 3. Build Prompt
    // 3a. Format Reference Script
    let referenceScript = "No reference script available.";
    if (scenario.dialogue && scenario.dialogue.length > 0) {
      referenceScript = scenario.dialogue.map(line => {
        return `${line.speaker}: ${line.text} (${line.translation || ''})`;
      }).join('\n');
    }

    let userRole = scenario.roles?.user;
    let aiRole = scenario.roles?.ai;

    if (!userRole || !aiRole) {
      // Fallback for older scenarios that lack the 'roles' field
      const roles = this.determineRoles(scenario.setting.participants);
      userRole = roles.userRole;
      aiRole = roles.aiRole;
    }

    const systemPrompt = buildChatSystemPrompt(scenario, aiRole, userRole, referenceScript, historyLines);

    // 3. Get AI Response
    const aiResponse = await this.geminiService.generateChatResponse(
      systemPrompt,
      userMessage,
      { scenarioId: id, topic: scenario.title }
    );

    if (!aiResponse) {
      throw new InternalServerErrorException("Failed to generate AI response");
    }

    // 4. Construct AI Message
    const aiMsgObj: ChatMessage = {
      speaker: 'ai',
      text: aiResponse.message,
      timestamp: Date.now(),
      correction: aiResponse.correction,
      sceneFinished: aiResponse.sceneFinished,
    };

    // 5. Persist to Firestore (Atomic Update)
    const updateData: Record<string, any> = {
      chatHistory: FieldValue.arrayUnion(userMsgObj, aiMsgObj)
    };

    // If the AI says the scene is finished, update isObjectiveMet
    if (aiResponse.sceneFinished) {
      updateData.isObjectiveMet = true;
      updateData.isActive = false; // Auto-deactivate
    }

    await this.collectionRef.doc(id).update(updateData);

    // 6. Return Full History (so frontend can sync)
    // We assume the frontend has the previous state, but returning full history is safer for sync
    const currentHistory = scenario.chatHistory || [];
    return [...currentHistory, userMsgObj, aiMsgObj];
  }


  private getInitialChatHistory(scenario: Scenario): ChatMessage[] {
    if (!scenario.dialogue || scenario.dialogue.length === 0) return [];

    const firstLine = scenario.dialogue[0];
    const { aiRole, userRole } = this.determineRoles(scenario.setting.participants);

    const speaker = firstLine.speaker.toLowerCase();
    const ai = aiRole.toLowerCase();
    const user = userRole.toLowerCase();

    // Safety: If speaker matches User, definitely DO NOT seed.
    if (user.includes(speaker) || speaker.includes(user)) {
      return [];
    }

    // If the first speaker IS the AI, seed the chat
    // Fuzzy match: if "Teacher" is in "Teacher (Sensei)" or vice versa
    if (ai.includes(speaker) || speaker.includes(ai)) {
      return [{
        speaker: 'ai',
        text: firstLine.text,
        timestamp: Date.now()
      }];
    }

    return [];
  }

  // Helper method for evaluation
  private async generateEvaluation(scenario: Scenario): Promise<ScenarioEvaluation> {
    // 1. Determine Roles for Context
    let userRole = scenario.roles?.user;
    let aiRole = scenario.roles?.ai;

    if (!userRole || !aiRole) {
      const roles = this.determineRoles(scenario.setting.participants);
      userRole = roles.userRole;
      aiRole = roles.aiRole;
    }

    // 2. Prepare Context for Gemini Service
    const context = {
      title: scenario.title,
      goal: scenario.setting.goal,
      difficulty: scenario.difficultyLevel,
      isObjectiveMet: scenario.isObjectiveMet ?? false,
      userRole,
      aiRole
    };

    // 3. Prepare History (Map ChatMessage[] to simpler structure if needed, though interfaces align)
    const history = (scenario.chatHistory || []).map(msg => ({
      speaker: msg.speaker,
      text: msg.text
    }));

    // 4. Delegate to Gemini Service
    const evaluation = await this.geminiService.evaluateScenario(history, context);

    // 5. Apply Business Logic for Outcome
    // IF success AND rating >= 3 -> Passed
    // ELSE -> Failed
    if (evaluation.success && evaluation.rating >= 3) {
      evaluation.outcome = 'passed';
      evaluation.recommendedAction = 'replay_chat'; // or maybe just 'practice_roleplay'
    } else {
      evaluation.outcome = 'failed';
      evaluation.recommendedAction = 'repeat_lesson';
    }

    return evaluation;
  }


  private determineRoles(participants: string[]): { aiRole: string; userRole: string } {
    if (!participants || participants.length === 0) {
      return { aiRole: 'Partner', userRole: 'Traveler' };
    }

    let userRole = participants.find(p => ALLOWED_USER_ROLES.some(k => p.toLowerCase().includes(k.toLowerCase())));
    let aiRole: string;

    if (userRole) {
      // AI is the other participant
      aiRole = participants.find(p => p !== userRole) || 'Partner';
    } else {
      // Try to find AI Role first
      const foundAiRole = participants.find(p => ALLOWED_AI_ROLES.some(k => p.toLowerCase().includes(k.toLowerCase())));

      if (foundAiRole && !userRole) {
        aiRole = foundAiRole;
        userRole = participants.find(p => p !== aiRole) || 'Traveler';
      } else {
        // Fallback: Assume index 1 is user (common in generated scenarios like ["Staff", "Traveler"])
        if (participants.length > 1) {
          userRole = participants[1];
          aiRole = participants[0];
        } else {
          // Only 1 participant?
          userRole = 'Traveler'; // Default
          aiRole = participants[0] || 'Partner';
        }
      }
    }

    this.logger.log(`AI Role: ${aiRole}, User Role: ${userRole}`);

    return { aiRole, userRole };
  }
}