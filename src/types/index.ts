/**
 * A "Knowledge Unit" is the core atom of knowledge.
 * It's the "thing" you are learning (e.g., a word, a grammar point).
 */
export interface KnowledgeUnit {
  id: string; // UUID
  type:
    | 'Vocab'
    | 'Kanji'
    | 'Grammar'
    | 'Concept'
    | 'ExampleSentence';
  content: string; // The "front" of the card (e.g., "食べる", "家族", "Giving and Receiving")
  data: Record<string, string>; // { reading: "たべる", definition: "To eat" }
  personalNotes: string;
  relatedUnits: string[]; // Array of other KnowledgeUnit IDs
}

/**
 * A "Review Facet" is a specific "side" of a Knowledge Unit to be reviewed.
 * One KU can have many facets.
 */
export type FacetType =
  | 'Content-to-Definition'
  | 'Definition-to-Content'
  | 'Content-to-Reading'
  | 'Reading-to-Content'
  | 'AI-Generated-Question';

export interface ReviewFacet {
  id: string; // UUID
  kuId: string; // Parent KnowledgeUnit ID
  facetType: FacetType;
  srsStage: number; // 0 (new) -> 8 (mastered)
  nextReviewAt: string; // ISO 8601 string

  // --- NEWLY ADDED FIELDS ---
  lastReviewAt?: string; // ISO 8601 string
  history?: {
    timestamp: string;
    result: 'pass' | 'fail';
  }[];
}

/**
 * The structure of our db.json file
 */
export interface Database {
  kus: KnowledgeUnit[];
  reviewFacets: ReviewFacet[];
}

/**
 * A "joined" data structure for the review UI.
 */
export interface ReviewItem {
  facet: ReviewFacet;
  ku: KnowledgeUnit;
}

