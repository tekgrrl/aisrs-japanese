import { Timestamp } from 'firebase-admin/firestore';

export type KnowledgeUnitType =
  | 'Vocab'
  | 'Kanji'
  | 'Grammar'
  | 'Concept'
  | 'ExampleSentence';

export interface KnowledgeUnit {
  id: string;
  type: KnowledgeUnitType;
  content: string; // The main "thing" (e.g., "食べる", "家族", "Giving/Receiving")
  data: {
    reading?: string;
    definition?: string;
    // We can add more specific fields here later
    [key: string]: any;
  };
  personalNotes: string;
  relatedUnits: string[]; // Array of other KnowledgeUnit IDs
  createdAt: string | Timestamp; // Added for sorting
  status: 'learning' | 'reviewing';
  facet_count: number;
}

export type ReviewFacetType =
  | 'Content-to-Definition'
  | 'Definition-to-Content'
  | 'Content-to-Reading'
  | 'AI-Generated-Question';

export interface ReviewFacet {
  id: string;
  kuId: string; // ID of the parent KnowledgeUnit
  facetType: ReviewFacetType;
  srsStage: number; // 0 (new) to 8 (mastered)
  nextReviewAt: string; // ISO string
  lastReviewAt?: string; // ISO string
  history?: Array<{
    timestamp: string;
    result: 'pass' | 'fail';
    stage: number;
  }>;
}

/**
 * Represents a "joined" review item, combining the
 * facet with its parent KU.
 */
export interface ReviewItem {
  facet: ReviewFacet;
  ku: KnowledgeUnit;
}

// This represents the structure of our old db.json
// We're keeping it for reference but not using it for Firestore.
export interface Database {
  kus: KnowledgeUnit[];
  reviewFacets: ReviewFacet[];
}

