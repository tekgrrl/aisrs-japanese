import { Timestamp } from "firebase/firestore";

export interface ApiLog {
  id?: string; // Firestore document ID
  timestamp: any; // Firestore Timestamp
  route: string; // e.g., '/api/generate-lesson'
  status: "pending" | "success" | "error";
  durationMs?: number; // Time taken for the API call
  modelUsed: string;
  requestData: {
    systemPrompt?: string; // Optional, might be long
    userMessage: string; // Or the main input data
    input_userAnswer?: string;
    input_expectedAnswer?: string | null; // Allow null too
    input_question?: string | null;
    input_topic?: string | null;
  };
  responseData?: {
    rawText?: string; // The raw text from the AI
    parsedJson?: any; // The parsed JSON object (if applicable)
  };
  errorData?: {
    message?: string;
    stack?: string;
    rawError?: string; // For non-Error objects
  };
}

/**
 * Represents the root document for a user in the strict multi-tenant architecture.
 * Document path: users/{uid}
 * This document serves as the unified source of truth for the user's high-level state.
 */
export interface UserRoot {
  id: string; // The Firestore document ID (which corresponds to the user's auth UID)

  /**
   * Statistical data related to the user's reviews, engagement, and progression.
   * Consolidates legacy UserStats fields.
   */
  stats: {
    // Forecasts (Bucket Counts)
    reviewForecast: Record<string, number>; // "YYYY-MM-DD": count
    hourlyForecast: Record<string, number>; // "YYYY-MM-DD-HH": count

    // Engagement
    currentStreak: number;
    lastReviewDate: Timestamp; // ISO Date

    // Performance
    totalReviews: number;
    passedReviews: number;

    // Progression (by Level)
    levelProgress: {
      n5: { total: number; mastered: number };
      n4: { total: number; mastered: number };
      n3?: { total: number; mastered: number };
      n2?: { total: number; mastered: number };
      n1?: { total: number; mastered: number };
    };
  };

  /**
   * Data specifically used by the AI Architect (Gemini) to personalize the learning experience.
   * This context acts as the "Personal Tutor" memory mapping logic context onto interaction styling.
   */
  tutorContext: {
    /** Words learned recently that the AI should actively try to reinforce in scenarios/examples. */
    frontierVocab: string[];

    /** Words the user has failed often that need repair/re-evaluation through the AI tutor. */
    leechVocab: string[];

    /** The current topic or structural node the user is tackling in their overall curriculum. */
    currentCurriculumNode: string;

    /** The set of grammar constructs the AI is permitted to use when generating content for this user. */
    allowedGrammar: string[];

    /** Specific grammar points the user struggles with; AI should emphasize diagnosing and practicing these. */
    weakGrammarPoints: string[];

    /** The user's identified conversational tendency, signaling how the AI should prompt for polite vs. casual context. */
    communicationStyle: "too_formal" | "too_casual" | "balanced" | "hesitant";

    /** Nuance or meaning-related weaknesses (e.g., struggling to differentiate similar-meaning words). */
    semanticWeaknesses: string[];

    /** Topics or themes the user brings up frequently or has shown interest in. */
    suggestedThemes: string[];
  };
}

export interface VocabLesson {
  kuId?: string;
  type: "Vocab";
  vocab: string;
  reading: string;
  definitions: string[];
  definition?: string; // Deprecated, kept for backward compatibility
  partOfSpeech: PartOfSpeech;
  meaning_explanation: string;
  reading_explanation: string;
  context_examples?: { sentence: string; translation: string }[];
  component_kanji?: {
    kanji: string;
    reading: string;
    meaning: string;
    onyomi?: string[];
    kunyomi?: string[];
  }[];
}

export interface KanjiLesson {
  kuId?: string;
  type: "Kanji";
  kanji: string;
  meaning: string; // "eat, food"

  // Readings (Flattened from API)
  onyomi: string[];
  kunyomi: string[];

  // Visuals (From API)
  strokeCount: number;
  strokeImages: string[]; // Array of SVGs from 'kanji.strokes.images'

  // The Classifier (From API)
  radical?: {
    character: string;
    meaning: string;
    image: string; // SVG url
    animation?: string[]; // Optional: radical animation frames
  };

  references?: {
    grade: number;
    kodansha: number;
    classic_nelson: number;
  };

  // User Data (From Firestore/DB)
  /** @deprecated - migrating to User state models */
  personalMnemonic?: string;

  // Mnemonics from AI
  mnemonic_meaning: string;
  mnemonic_reading: string;

  // Context (From your DB)
  // This replaces the static "examples" string
  relatedVocab: {
    id: string;
    content: string;
    reading: string;
  }[];
}

export interface GlobalVocabLesson {
  type: "Vocab";
  vocab: string;
  reading: string;
  definitions: string[];
  definition?: string;
  partOfSpeech: PartOfSpeech;
  meaning_explanation: string;
  reading_explanation: string;
  context_examples?: { sentence: string; translation: string }[];
  component_kanji?: {
    kanji: string;
    reading: string;
    meaning: string;
    onyomi?: string[];
    kunyomi?: string[];
  }[];
}

export interface GlobalKanjiLesson {
  type: "Kanji";
  kanji: string;
  meaning: string;
  onyomi: string[];
  kunyomi: string[];
  strokeCount: number;
  strokeImages: string[];
  radical?: {
    character: string;
    meaning: string;
    image: string;
    animation?: string[];
  };
  references?: {
    grade: number;
    kodansha: number;
    classic_nelson: number;
  };
  mnemonic_meaning: string;
  mnemonic_reading: string;
  relatedVocab: {
    id: string;
    content: string;
    reading: string;
  }[];
}

export interface UserLessonData {
  lessonId: string; // The ID of the generic lesson it adapts
  userId: string;
  kuId: string;
  personalMnemonic?: string;
}

export type Lesson =
  | VocabLesson
  | KanjiLesson
  | GlobalVocabLesson
  | GlobalKanjiLesson;

export type KnowledgeUnitType =
  | "Vocab"
  | "Kanji"
  | "Grammar"
  | "Concept"
  | "ExampleSentence";

export type PartOfSpeech =
  | "transitive-verb"
  | "intransitive-verb"
  | "i-adjective"
  | "na-  "
  | "noun"
  | "noun-prenominal"
  | "proper-noun"
  | "noun-suru"
  | "counter"
  | "adverb"
  | "auxiliary-verb"
  | "prefix"
  | "suffix"
  | "conjunction"
  | "grammar"
  | "expresssion";

export interface KnowledgeUnit {
  id: string;
  /** @deprecated - migrating to User state models */
  userId: string;
  type: KnowledgeUnitType;
  content: string; // The main "thing" (e.g., "食べる", "家族", "Giving/Receiving")
  data: {
    reading?: string;
    definition?: string;
    meaning?: string; // For Kanji
    jlptLevel?: string | null;
    wanikaniLevel?: number | null;
    // We can add more specific fields here later
    [key: string]: any;
  };
  /** @deprecated - migrating to User state models */
  personalNotes: string;
  /** @deprecated - migrating to User state models */
  userNotes?: string;
  relatedUnits: string[]; // Array of other KnowledgeUnit IDs
  /** @deprecated - migrating to User state models */
  createdAt: Timestamp; // Added for sorting
  /** @deprecated - migrating to User state models */
  status: "learning" | "reviewing";
  /** @deprecated - migrating to User state models */
  facet_count: number;
  /** @deprecated - migrating to User state models */
  history?: any[]; // Or define a proper history type
}

export interface GlobalKnowledgeUnit {
  id: string;
  type: KnowledgeUnitType;
  content: string;
  data: {
    reading?: string;
    definition?: string;
    meaning?: string;
    jlptLevel?: string | null;
    wanikaniLevel?: number | null;
    [key: string]: any;
  };
  relatedUnits: string[];
}

export interface UserKnowledgeUnit {
  id: string;
  userId: string;
  kuId: string; // Bridges to GlobalKnowledgeUnit.id
  personalNotes: string;
  userNotes?: string;
  createdAt: Timestamp;
  status: "learning" | "reviewing";
  facet_count: number;
  history?: any[];
}

export type KnowledgeUnitClient = Omit<KnowledgeUnit, "createdAt"> & {
  createdAt: string;
};

export type FacetType =
  | "Content-to-Definition"
  | "Definition-to-Content"
  | "Content-to-Reading"
  | "AI-Generated-Question"
  | "Reading-to-Content"
  | "Kanji-Component-Meaning" // e.g., "食" -> "eat"
  | "Kanji-Component-Reading" // e.g., "食" -> "ショク"
  | "audio";

export interface ReviewFacet {
  id: string;
  userId: string;
  kuId: string; // ID of the parent KnowledgeUnit
  facetType: FacetType;
  srsStage: number; // 0 (new) to 8 (mastered)
  nextReviewAt: Timestamp; // ISO string
  lastReviewAt?: Timestamp; // ISO string
  history?: Array<{
    timestamp: string;
    result: "pass" | "fail";
    stage: number;
  }>;
  currentQuestionId?: string;
  questionAttempts?: number;
  data?: any;
}

/**
 * Represents a "joined" review item, combining the
 * facet with its parent KU.
 */
export interface ReviewItem {
  facet: ReviewFacet;
  ku: KnowledgeUnit | (GlobalKnowledgeUnit & UserKnowledgeUnit);
  lesson?:
    | Lesson
    | (GlobalVocabLesson & UserLessonData)
    | (GlobalKanjiLesson & UserLessonData);
}

// This represents the structure of our old db.json
// We're keeping it for reference but not using it for Firestore.
export interface Database {
  kus: KnowledgeUnit[];
  reviewFacets: ReviewFacet[];
}

export type LessonDifficulty =
  | "JLPT-N5"
  | "JLPT-N4"
  | "JLPT-N3"
  | "JLPT-N2"
  | "JLPT-N1";

export interface QuestionItem {
  id: string;
  /** @deprecated - migrating to User state models */
  userId: string;
  kuId: string;
  data: {
    context?: string;
    question: string;
    answer: string;
    acceptedAlternatives?: string[];
    difficulty: LessonDifficulty;
  };
  /** @deprecated - migrating to User state models */
  status?: "active" | "flagged" | "inactive"; // Default is 'active' if undefined
  createdAt: string | Timestamp;
  /** @deprecated - migrating to User state models */
  lastUsed?: string | Timestamp;
  /** @deprecated - migrating to User state models */
  previousAnswers?: {
    answer: string;
    result: "pass" | "fail";
    timestamp: Timestamp;
  }[];
}

export interface GlobalQuestion {
  id: string;
  kuId: string;
  data: {
    context?: string;
    question: string;
    answer: string;
    acceptedAlternatives?: string[];
    difficulty: LessonDifficulty;
  };
  createdAt: string | Timestamp;
}

export interface UserQuestionState {
  userId: string;
  questionId: string; // Bridges to GlobalQuestion.id
  status: "active" | "flagged" | "inactive";
  lastUsed?: string | Timestamp;
  previousAnswers?: {
    answer: string;
    result: "pass" | "fail";
    timestamp: Timestamp;
  }[];
}
