import { Timestamp } from 'firebase-admin/firestore';

/**
 * A single lesson section from the user's hand-extended verb/grammar reference
 * ("Guide to Japanese Verbs"). Deliberately NOT a GrammarKnowledgeUnit: this
 * content isn't part of the hand-authored classification/curriculum-routing
 * system, and — critically — get_grammar_patterns only surfaces KUs the user
 * has already enrolled in, while anything in a scenario's grammarMatches[]
 * gets auto-enrolled into SRS on advanceState(). Sections here are targeted
 * via Scenario.sourceSectionId instead, which never touches grammarMatches,
 * so generating/completing a scenario from a section has no SRS side effect.
 */
export interface GrammarSection {
    id: string;
    /** Raw doc heading, e.g. "10.3 Lesson 75 - た form + ばかり". Display only — the source doc has duplicate/out-of-order numbers, not a reliable key. */
    sectionLabel: string;
    /** Short pattern name, e.g. "た form + ばかり". */
    pattern: string;
    jlptLevel?: string | null;
    /** Prose rule explanation. */
    explanation: string;
    /** The few-shot source for scenario generation, and shown to the learner as-is. */
    examples: { japanese: string; english: string }[];
    /** "Word Check" vocab from the source section. */
    vocab?: { term: string; reading?: string; meaning: string }[];
    notes?: string;
    createdAt: Timestamp;
}
