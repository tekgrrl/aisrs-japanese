// import { Timestamp } from 'firebase-admin/firestore';
// Mocking Timestamp for frontend to avoid firebase-admin dependency
export type Timestamp =
  | { seconds: number; nanoseconds: number; toDate: () => Date }
  | any;

export type ScenarioDifficulty = "N5" | "N4" | "N3" | "N2" | "N1";
export type ScenarioState = "encounter" | "drill" | "simulate" | "completed";

export interface ChatMessage {
  speaker: "user" | "ai";
  text: string;
  timestamp: number;
  correction?: string;
  sceneFinished?: boolean;
}

export interface ScenarioDialogueLine {
  speaker: string;
  text: string;
  translation: string;
  audioUrl?: string;
}

// UPDATED: Split content into distinct fields for cleaner import
export interface ExtractedKU {
  content: string; // The Japanese writing (e.g., "本屋")
  reading: string; // The reading (e.g., "ほんや")
  meaning: string; // The English meaning (e.g., "Bookstore")
  type: "vocab" | "kanji";
  kuId?: string;
  status: "new" | "learning" | "mastered";
  jlptLevel?: string;
}

export interface GrammarNote {
  pattern?: string;
  title: string;
  explanation: string;
  exampleInContext: {
    japanese: string;
    english: string;
    fragments: string[];
    accepted_alternatives: string[];
  };
}

export interface ScenarioEvaluation {
  success: boolean;
  rating: number;
  feedback: string;
  corrections: {
    original: string;
    correction: string;
    explanation: string;
  }[];
  outcome?: "passed" | "failed";
  recommendedAction?: "repeat_lesson" | "replay_chat";
}

export interface Scenario {
  id: string;
  /** @deprecated - migrating to User state models */
  userId: string;
  title: string;
  description: string;
  difficultyLevel: ScenarioDifficulty;

  setting: {
    location: string;
    participants: string[];
    goal: string;
    timeOfDay: string;
    visualPrompt: string;
  };

  dialogue: ScenarioDialogueLine[];
  extractedKUs: ExtractedKU[];
  grammarNotes: GrammarNote[];

  /** @deprecated - migrating to User state models */
  state: ScenarioState;
  /** @deprecated - migrating to User state models */
  chatHistory?: ChatMessage[];
  /** @deprecated - migrating to User state models */
  isObjectiveMet?: boolean;
  /** @deprecated - migrating to User state models */
  evaluation?: ScenarioEvaluation;

  /** @deprecated - migrating to User state models */
  createdAt: Timestamp;
  /** @deprecated - migrating to User state models */
  completedAt?: Timestamp;
  /** @deprecated - migrating to User state models */
  pastAttempts?: ScenarioAttempt[];

  roles?: {
    user: string;
    ai: string;
  };

  sourceType?: 'library' | 'custom' | 'context-example';
  sourceContextSentence?: string;
  targetVocab?: string;
  sourceKuId?: string;
  isActive?: boolean;

  progress?: Record<string, LevelProgress>;
  currentLevelStatus?: ProgressStatus;
}

export interface ScenarioTemplate {
  id: string;
  title: string;
  description: string;
  difficultyLevel: ScenarioDifficulty;
  setting: {
    location: string;
    participants: string[];
    goal: string;
    timeOfDay: string;
    visualPrompt: string;
  };
  dialogue: ScenarioDialogueLine[];
  extractedKUs: ExtractedKU[];
  grammarNotes: GrammarNote[];
  roles?: {
    user: string;
    ai: string;
  };
}

export interface ScenarioSession {
  id: string;
  userId: string;
  templateId: string; // Bridges to ScenarioTemplate.id
  state: ScenarioState;
  chatHistory?: ChatMessage[];
  isObjectiveMet?: boolean;
  evaluation?: ScenarioEvaluation;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  pastAttempts?: ScenarioAttempt[];
}

export interface ScenarioAttempt {
  completedAt: Timestamp;
  chatHistory: ChatMessage[];
  evaluation: ScenarioEvaluation;
}

export type ProgressStatus = 'reviewing' | 'failing' | 'passing' | 'passed';

export interface Attempt {
  attemptedAt: Timestamp;
  stars: 1 | 2 | 3 | 4 | 5;
}

export interface LevelProgress {
  status: ProgressStatus;
  bestStars: number; // 0 = no attempt yet
  lastAttemptAt: Timestamp | null;
  attempts: Attempt[];
}

export class GenerateScenarioDto {
  difficulty?: ScenarioDifficulty;
  theme?: string;
  sourceType?: 'library' | 'custom' | 'context-example';
  sourceContextSentence?: string;
  targetVocab?: string;
  sourceKuId?: string;
  userRole?: string;
  aiRole?: string;
}

export class ChatTurnDto {
  userMessage!: string;
}
