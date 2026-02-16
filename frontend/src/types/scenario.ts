// import { Timestamp } from 'firebase-admin/firestore';
// Mocking Timestamp for frontend to avoid firebase-admin dependency
export type Timestamp = { seconds: number; nanoseconds: number; toDate: () => Date; } | any;

export type ScenarioDifficulty = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type ScenarioState = 'encounter' | 'drill' | 'simulate' | 'completed';

export interface ChatMessage {
    speaker: 'user' | 'ai';
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
    type: 'vocab' | 'kanji';
    kuId?: string;
    status: 'new' | 'learning' | 'mastered';
}

export interface GrammarNote {
    title: string;
    explanation: string;
    exampleInContext: string;
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
    outcome?: 'passed' | 'failed';
    recommendedAction?: 'repeat_lesson' | 'replay_chat';
}

export interface Scenario {
    id: string;
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

    state: ScenarioState;
    chatHistory?: ChatMessage[];
    isObjectiveMet?: boolean;
    evaluation?: ScenarioEvaluation;

    createdAt: Timestamp;
    completedAt?: Timestamp;
    pastAttempts?: ScenarioAttempt[];

    roles?: {
        user: string;
        ai: string;
    };
}

export interface ScenarioAttempt {
    completedAt: Timestamp;
    chatHistory: ChatMessage[];
    evaluation: ScenarioEvaluation;
}

export class GenerateScenarioDto {
    difficulty!: ScenarioDifficulty;
    theme?: string;
}

export class ChatTurnDto {
    userMessage!: string;
}