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
import { FIRESTORE_CONNECTION, SCENARIOS_COLLECTION, REVIEW_FACETS_COLLECTION } from '../firebase/firebase.module';
import { GeminiService } from '../gemini/gemini.service';

// Centralized Role Definitions to ensure Prompt and Heuristic are always in sync
const ALLOWED_USER_ROLES = [
  'Traveler', 'Traveller', 'Customer', 'Guest', 'Student', 'Patient', 'Me', 'Watashi', 'Passenger',
  '客', '私', '旅行者', '学生', '患者', '乗客'
];

const ALLOWED_AI_ROLES = [
  'Teacher', 'Sensei', 'Staff', 'Clerk', 'Shopkeeper', 'Manager', 'Doctor', 'Nurse', 'Police', 'Officer', 'Station Attendant',
  '先生', '店員', '医者', '看護師', '警察', '駅員', '係員'
];

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
    const prompt = this.buildArchitectPrompt(dto);

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
        difficultyLevel: dto.difficulty,
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
        sourceType: dto.sourceType,
        sourceContextSentence: dto.sourceContextSentence,
        targetVocab: dto.targetVocab
      };

      // console.log(newScenario);
      console.dir(dto, { depth: null, colors: true });

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

    const systemPrompt = `
      You are a roleplay partner in a Japanese immersion scenario.
      **Scenario Context:**
      - Title: ${scenario.title}
      - Setting: ${scenario.setting.location}
      - Your Role: ${aiRole}
      - User Role: ${userRole}
      - Goal: ${scenario.setting.goal}
      - Difficulty: ${scenario.difficultyLevel}

      **REFERENCE SCRIPT (PLOT OUTLINE):**
      ${referenceScript}

      **PREVIOUS CHAT HISTORY:**
      ${historyLines}

      **INSTRUCTIONS:**
      1. You are acting out the role of ${aiRole}.
      2. Use the 'REFERENCE SCRIPT' as your guide for the conversation flow.
      3. You must ensure key events/questions from the script occur (e.g., if the script has the shopkeeper ask for a passport, YOU must ask for the passport).
      4. Speak ONLY in Japanese appropriate for the setting and your role.
      5. Engage the user to help them achieve the goal.
      6. Do NOT repeat greetings if they have already been said (check 'PREVIOUS CHAT HISTORY').
      7. Only ask for *missing* details.
      8. Reply naturally to the User's last message.
      9. If the user makes a mistake (grammar/vocab), reply naturally but include a short "correction" in the JSON.
      10. Keep responses concise (1-2 sentences).
      11. CHECK GOAL: If the user has explicitly and successfully achieved the goal ("${scenario.setting.goal}") during this turn, set 'sceneFinished' to true in your JSON response. Otherwise false.
    `;

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

  private buildArchitectPrompt(dto: GenerateScenarioDto): string {
    const contextExampleDirective = dto.sourceType === 'context-example' && dto.sourceContextSentence && dto.targetVocab
      ? `\n**Context Example Constraints:**\n- You MUST create a roleplay scenario where the user MUST use the target vocab ('${dto.targetVocab}') in a situation matching the following sentence: '${dto.sourceContextSentence}'.\n- The scenario goal MUST involve using this word in context.\n`
      : '';

    return `
You are an expert Japanese language curriculum designer.
Create a "Genki-style" learning scenario for an ADULT traveler/expat (not a student).

**Parameters:**
- Target Level: ${dto.difficulty}
- Theme/Setting: ${dto.theme || 'A common situation for an adult living in Japan'}${contextExampleDirective}

**Requirements:**
1. **Dialogue:** Create a natural, realistic dialogue (6-12 lines). Use a mix of polite (Desu/Masu) and casual forms appropriate for the setting.
2. **Vocabulary:** STRICTLY LIMIT vocabulary to ${dto.difficulty} level. Introduce exactly 3-5 "Target Words" required for the specific goal.
3. **Grammar Notes:** Identify 1-2 key grammar points used in the dialogue and explain them like a textbook (Genki style).
4. **Visual Context:** Provide a descriptive prompt that could be used to generate an image of the scene.
5. **Role Constraints:**
   - **User Roles:** ${ALLOWED_USER_ROLES.join(', ')}
   - **Partner Roles:** ${ALLOWED_AI_ROLES.join(', ')}
   - Use these exact terms (or their Japanese equivalents provided in the list) for the 'roles' object and 'participants' array.
6. **Data Formatting (CRITICAL):**
   - **NO ROMAJI**. Never include Romaji in any field.
   - **Extracted KUs:**
     - \`content\`: Japanese text ONLY (e.g., "本屋"). No readings or definitions in this field.
     - \`reading\`: Kana reading ONLY (e.g., "ほんや"). No Romaji.
     - \`meaning\`: English definition ONLY.
     - \`jlptLevel\`: JLPT level hint for this word (e.g., "N4"). MUST be one of: N5, N4, N3, N2, N1. Use your best judgement for the level of each individual word.
   - For \`grammarNotes\`:
     - \`pattern\`: The extractable grammar pattern in isolation (e.g., "～をお願いします", "～ている"). This should be concise and reusable across contexts.

**Output Schema (Return ONLY raw JSON):**
{
  "title": "Scenario Title",
  "description": "Brief context (e.g. 'You are at a convenience store...')",
  "setting": {
    "location": "Specific location",
    "participants": ["Role A", "Role B"],
    "goal": "What the user needs to achieve",
    "timeOfDay": "Morning/Evening/etc",
    "visualPrompt": "Detailed visual description of the scene for an image generator"
  },
  "roles": {
    "user": "EXACT_NAME_OF_USER_ROLE_FROM_PARTICIPANTS_ARRAY", 
    "ai": "EXACT_NAME_OF_AI_ROLE_FROM_PARTICIPANTS_ARRAY"
  },
  "dialogue": [
    { 
      "speaker": "EXACT_NAME_FROM_PARTICIPANTS_ARRAY", 
      "text": "Japanese text", 
      "translation": "English translation" 
    }
  ],
  "extractedKUs": [
    {
      "content": "本屋",
      "reading": "ほんや",
      "meaning": "Bookstore",
      "type": "vocab",
      "jlptLevel": "N4"
    }
  ],
  "grammarNotes": [
    {
      "pattern": "The extractable grammar pattern, e.g. ～をお願いします",
      "title": "Grammar Point Name",
      "explanation": "Clear explanation",
      "exampleInContext": {
        "japanese": "The example sentence in Japanese only, no furigana or Romaji",
        "english": "The English translation of the example",
        "fragments": ["minimal", "meaningful", "chunks", "of", "the", "sentence"],
        "accepted_alternatives": ["array of valid re-orderings or omittable-particle variants, or empty array"]
      }
    }
  ]
}

**Grammar Note Fragments Rules:**
- \`fragments\` MUST be an array of minimal grammatical chunks that together reconstruct the full \`japanese\` sentence when joined with no spaces.
- Each fragment should be the smallest meaningful unit — split at particle boundaries, verb endings, and conjunctions (e.g., ["あれ", "は", "いくら", "です", "か"] for "あれはいくらですか").
- NEVER include Romaji or furigana in fragments.
- \`accepted_alternatives\` should list any valid alternative orderings of the same sentence, or be an empty array if none exist.
- Joining all fragments in order MUST exactly reproduce the \`japanese\` field.
`;
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