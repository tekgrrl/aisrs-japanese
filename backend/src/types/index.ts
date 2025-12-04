import { Timestamp } from "firebase-admin/firestore";

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
    content?: string | null;
    kuId?: string | null;
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

interface UserStats {
  userId: string;

  // Forecasts (Bucket Counts)
  reviewForecast: Record<string, number>; // "YYYY-MM-DD": count
  hourlyForecast: Record<string, number>; // "YYYY-MM-DD-HH": count

  // Engagement
  currentStreak: number;
  lastReviewDate: string; // ISO Date

  // Performance
  totalReviews: number;
  passedReviews: number;

  // Progression (by Level)
  levelProgress: {
    n5: { total: number, mastered: number },
    n4: { total: number, mastered: number },
    // ...
  }
}

export interface VocabLesson {
  kuId?: string;
  type: "Vocab";
  vocab: string;
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
  meaning: string;
  reading_onyomi?: { reading: string; example: string }[];
  reading_kunyomi?: { reading: string; example: string }[];
  radicals?: { radical: string; meaning: string }[];
  mnemonic_meaning: string;
  mnemonic_reading: string;
}

export type Lesson = VocabLesson | KanjiLesson;

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
  | "na-adjective"
  | "noun"
  | "noun-prenominal"
  | "proper-noun"
  | "noun-suru"
  | "counter"
  | "adverb"
  | "auxiliary-verb"
  | "prefix"
  | "suffix"
  | "conjunction";

export interface KnowledgeUnit {
  id: string;
  userId: string;
  type: KnowledgeUnitType;
  content: string; // The main "thing" (e.g., "食べる", "家族", "Giving/Receiving")
  data: {
    reading?: string;
    definition?: string;
    meaning?: string; // For Kanji
    // We can add more specific fields here later
    [key: string]: any;
  };
  personalNotes: string;
  relatedUnits: string[]; // Array of other KnowledgeUnit IDs
  createdAt: Timestamp; // Added for sorting
  status: "learning" | "reviewing";
  facet_count: number;
  history?: any[]; // Or define a proper history type
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
  | "Kanji-Component-Reading"; // e.g., "食" -> "ショク"

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
}

/**
 * Represents a "joined" review item, combining the
 * facet with its parent KU.
 */
export interface ReviewItem {
  facet: ReviewFacet;
  ku: KnowledgeUnit;
  lesson?: Lesson;
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
  userId: string;
  kuId: string;
  data: {
    context?: string;
    question: string;
    answer: string;
    acceptedAlternatives?: string[];
    difficulty: LessonDifficulty;
  };
  status?: "active" | "flagged" | "inactive"; // Default is 'active' if undefined
  createdAt: string | Timestamp;
  lastUsed?: string | Timestamp;
  previousAnswers?: {
    answer: string;
    result: "pass" | "fail";
    timestamp: Timestamp;
  }[];
}
