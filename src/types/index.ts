export interface KnowledgeUnit {
  id: string;
  type: 'Vocab' | 'Kanji' | 'Grammar' | 'Concept' | 'ExampleSentence';
  content: string;
  data: Record<string, string>;
  personalNotes: string;
  relatedUnits: string[];
}

// Phase 2.2: The Review Facet Schema
export interface ReviewFacet {
  id: string;
  kuId: string; // The KnowledgeUnit it's testing
  // The specific question type for this facet
  facetType: 'Content-to-Definition' | 'Content-to-Reading' | 'Definition-to-Content' | 'Audio-to-Content' | 'AI-Context-Prompt';
  srsStage: number; // 0 (new) -> 9 (burned)
  nextReviewAt: string; // ISO 8601 string
  lastReviewAt: string | null;
  // A record of performance
  history: {
    timestamp: string;
    result: 'pass' | 'fail';
  }[];
}

// The new shape of our database
export interface Database {
  kus: KnowledgeUnit[];
  reviewFacets: ReviewFacet[];
}
