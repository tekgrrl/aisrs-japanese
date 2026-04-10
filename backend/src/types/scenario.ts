import { Timestamp } from 'firebase-admin/firestore';
import { IsBoolean, IsOptional } from 'class-validator';

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

export interface ExtractedKU {
    content: string;
    reading: string;
    meaning: string;
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
    outcome: 'passed' | 'failed';
    recommendedAction: 'repeat_lesson' | 'replay_chat';
}

export interface ScenarioAttempt {
    completedAt: Timestamp;
    chatHistory: ChatMessage[];
    evaluation: ScenarioEvaluation;
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
    isActive?: boolean;
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

// FIX: DTOs must be Classes for NestJS reflection/validation to work
export class GenerateScenarioDto {
    difficulty!: ScenarioDifficulty;
    theme?: string;
    sourceType?: 'library' | 'custom' | 'context-example';
    sourceContextSentence?: string;
    targetVocab?: string;
}

// FIX: DTOs must be Classes for NestJS reflection/validation to work
export class ChatTurnDto {
    userMessage!: string;
}

export class ResetSessionDto {
    @IsBoolean()
    @IsOptional()
    archive: boolean = false;
}