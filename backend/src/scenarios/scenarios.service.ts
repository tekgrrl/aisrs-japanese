import { Injectable, Inject, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Firestore, CollectionReference, Timestamp } from '@google-cloud/firestore';
import { Scenario, GenerateScenarioDto, ScenarioState } from '../types/scenario';
import { FIRESTORE_CONNECTION, SCENARIOS_COLLECTION } from '../firebase/firebase.module';
import { GeminiService } from '../gemini/gemini.service';

@Injectable()
export class ScenariosService {
  private collectionRef: CollectionReference;

  constructor(
    @Inject(FIRESTORE_CONNECTION) private readonly db: Firestore,
    private readonly geminiService: GeminiService,
  ) {
    this.collectionRef = this.db.collection(SCENARIOS_COLLECTION);
  }

  async getScenario(id: string): Promise<Scenario | null> {
    const doc = await this.collectionRef.doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as Scenario;
  }

  /**
   * Phase 1: The Architect
   * Generates the scenario using Gemini.
   */
  async generateScenario(userId: string, dto: GenerateScenarioDto): Promise<string> {
    const prompt = this.buildArchitectPrompt(dto);

    try {
      // Call the specialized method in GeminiService
      // This handles logging, error catching, and JSON cleaning
      const jsonString = await this.geminiService.generateScenario(prompt);
      const data = JSON.parse(jsonString);

      const docRef = this.collectionRef.doc();
      const id = docRef.id;

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
        dialogue: data.dialogue,
        // Map extracted KUs and force status to 'new'
        extractedKUs: data.extractedKUs.map((ku: any) => ({
          ...ku,
          status: 'new',
        })),
        grammarNotes: data.grammarNotes,
        state: 'encounter',
        createdAt: Timestamp.now(),
      };

      await docRef.set(newScenario);
      return id;

    } catch (error) {
      console.error('Scenario Generation Failed:', error);
      throw new InternalServerErrorException('Failed to generate scenario from AI');
    }
  }

  /**
   * Moves the scenario to the next phase (Encounter -> Drill -> Simulate)
   */
  async advanceState(id: string): Promise<void> {
    const scenario = await this.getScenario(id);
    if (!scenario) throw new NotFoundException('Scenario not found');

    let newState: ScenarioState = scenario.state;

    switch (scenario.state) {
      case 'encounter':
        newState = 'drill';
        break;
      case 'drill':
        // TODO: Future check - ensure all KUs are learned before advancing
        newState = 'simulate';
        break;
      case 'simulate':
        newState = 'completed';
        break;
    }

    await this.collectionRef.doc(id).update({
      state: newState,
      completedAt: newState === 'completed' ? Timestamp.now() : undefined
    });
  }

  /**
   * Phase 4: The Director
   * Handles the roleplay chat
   */
  async handleChat(id: string, userMessage: string) {
    // TODO: Implement the Director agent for the Simulation phase
    return {
      message: `(Placeholder) That is a good attempt at saying "${userMessage}", but try being more polite.`,
      speaker: 'Server',
      correction: null
    };
  }

  // --- Private Helpers ---

  private buildArchitectPrompt(dto: GenerateScenarioDto): string {
    return `
You are an expert Japanese language curriculum designer.
Create a "Genki-style" learning scenario for an ADULT traveler/expat (not a student).

**Parameters:**
- Target Level: ${dto.difficulty}
- Theme/Setting: ${dto.theme || 'A common situation for an adult living in Japan'}

**Requirements:**
1. **Dialogue:** Create a natural, realistic dialogue (6-12 lines). Use a mix of polite (Desu/Masu) and casual forms appropriate for the setting.
2. **Vocabulary:** STRICTLY LIMIT vocabulary to ${dto.difficulty} level. Introduce exactly 3-5 "Target Words" required for the specific goal.
3. **Grammar Notes:** Identify 1-2 key grammar points used in the dialogue and explain them like a textbook (Genki style).
4. **Visual Context:** Provide a descriptive prompt that could be used to generate an image of the scene.

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
  "dialogue": [
    { "speaker": "Role A", "text": "Japanese text", "translation": "English translation" }
  ],
  "extractedKUs": [
    { "content": "Target Word 1", "type": "vocab" },
    { "content": "Target Word 2", "type": "vocab" }
  ],
  "grammarNotes": [
    { "title": "Grammar Point Name", "explanation": "Clear explanation", "exampleInContext": "Example from dialogue" }
  ]
}
`;
  }
}