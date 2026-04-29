/**
 * Prompts for AI-generated quiz question generation.
 * Source: backend/src/questions/questions.service.ts
 */

import { ConceptKnowledgeUnit } from '../types';
import { NO_ROMAJI, JSON_ONLY_OUTPUT } from './fragments';

export type ConceptMechanic = ConceptKnowledgeUnit['data']['mechanics'][number];

// ---------------------------------------------------------------------------
// Vocab questions (verbs and adjectives)
// ---------------------------------------------------------------------------

export const VOCAB_QUESTION_OPTIONS: Record<string, string> = {
  'conjugation': 'if the word is a verb, conjugate the verb to a specific form e.g.: Give the past potential form of the verb in question',
  'particle': "Match up the Vocab in question with a particle to give a particular meaning in a sentence that you specify, you can represent the particle with a blank '[____]'",
  'translation': 'Create a sentence in English for the user to translate into Japanese. The English sentence must naturally force the use of the Target Input.',
  'fill-in-the-blank': "A context-based, fill-in-the-blank style question with a single blank '[____]'",
};

export type VocabQuestionType = keyof typeof VOCAB_QUESTION_OPTIONS;

/**
 * Builds the system prompt for vocab/grammar AI question generation.
 * Source: questions.service.ts:generateVocabQuestion
 *
 * @param questionType - One of the VOCAB_QUESTION_OPTIONS keys, randomly selected at call time.
 */
export function buildVocabQuestionPrompt(questionType: VocabQuestionType): string {
  return `You are an expert Japanese tutor and quiz generator.
You will be prompted with a single piece of Japanese Vocab: a word or grammar concept (the 'topic') and an optional reading and meaning.
Your task is to create a single, context-based question to test the user's understanding of that word or grammar concept.
If a reading and/or meaning are provided, you MUST generate a question where the topic matches those specific constraints. Do not generate questions for alternative readings or meanings of the same word.
You MUST generate a question using the following form:
${VOCAB_QUESTION_OPTIONS[questionType]};

You MUST return ONLY a valid JSON object with the following schema:
{
  "question": "The actual question that will be displayed to the user.",
  "context": "OPTIONAL. Brief English context/hint only if needed for disambiguation.",
  "answer": "The primary answer to the question.",
  "accepted_alternatives": ["Array of other grammatically valid answers (e.g. different politeness levels)."]
}
Rules:
1.  The question must directly test the provided 'topic'.
2.  For fill-in-the-blank questions, use '[____]' for the blank, exactly once, and the answer must be the single word/particle that fits the blank.
3.  Do not use Romaji to indicate the reading of whatever is being tested. ${NO_ROMAJI}
4.  The context field MUST be used for any "fill-in-the-blank" question that tests a noun or adjective, as these are often ambiguous. The context MUST provide a hint to differentiate the answer from common synonyms. (e.g., for 気分, a hint like (Context: a person's mood or feeling) is required).
5.  Ensure the generated question and any accepted answers make grammatical sense.
6.  Do NOT use literal newlines inside the JSON string values. Use spaces instead.
7.  If the provided English context does NOT strictly dictate a specific politeness level, you MUST include standard valid variations (plain form, polite 'masu' form) in the accepted_alternatives array.
8.  Use simple, standard grammar and vocabulary (equivalent to JLPT N4) for the surrounding sentence structure. Ensure the sentence is easy to read, so the user focuses on the target blank, not on deciphering the rest of the sentence.
9.  Relative Complexity Rule: The surrounding sentence MUST NOT be more difficult than the target word. If the target is advanced (N3+), use simple (N4/N5) grammar structure to ensure clarity. For advanced verbs/adjectives, prioritize questions that test conjugation or specific grammatical usage over complex semantic inference.
10. The question tests a specific concept, but natural language often has valid variations based on politeness (e.g., 食べる vs. 食べます).
11. Ambiguity Prevention: If other distinct words (synonyms) could be grammatically correct, use the English context to disambiguate by including the closest English translation/explanation of the target word.
12. If the question requires conjugation of a verb and the answer is not the base form, provide enough context to disambiguate the answer.
13. ${JSON_ONLY_OUTPUT}`;
}

/**
 * Builds the user message for vocab/grammar AI question generation.
 * Source: questions.service.ts:generateVocabQuestion
 */
export function buildVocabQuestionUserMessage(
  topic: string,
  reading?: string,
  meaning?: string,
): string {
  let msg = `Topic: ${topic}`;
  if (reading) msg += `\nReading: ${reading}`;
  if (meaning) msg += `\nMeaning: ${meaning}`;
  return msg;
}

// ---------------------------------------------------------------------------
// Noun questions
// ---------------------------------------------------------------------------

export const NOUN_QUESTION_OPTIONS: Record<string, string> = {
  'noun-particle': 'noun + particle fill-in-the-blank',
  'translation': 'Create a sentence in English for the user to translate into Japanese. The English sentence must naturally force the use of the Target Input.',
};

export type NounQuestionType = keyof typeof NOUN_QUESTION_OPTIONS;

/**
 * System prompt for noun + particle fill-in-the-blank questions.
 * The blank encompasses <noun><particle> so the user must supply both the word and
 * its grammatically correct particle for the specific context.
 * accepted_alternatives is always empty — the sentence uniquely determines the particle.
 * Pass NOUN_PARTICLE_FEW_SHOT_TURNS as fewShotTurns to generateQuestionAI.
 */
export function buildNounParticleQuestionPrompt(): string {
  return `You are an expert Japanese tutor and quiz generator.
You will be given a Japanese noun (the 'topic') with its reading and meaning.
Your task is to write a single Japanese sentence that uses that noun with a specific particle, then blank out the noun+particle pair together so the user must supply both.

Rules:
1. The blank '[____]' replaces the noun AND its particle together — e.g. the answer might be 図書館で, 駅から, 友達と, 歯を.
2. The 'context' field MUST follow this exact format: "Specify [English label] as [semantic role]" — where the semantic role describes the particle's function precisely enough that only one particle is correct.
3. 'accepted_alternatives' MUST always be an empty array. The sentence structure uniquely determines the correct particle.
4. Do NOT use は or が as the particle. Use action particles only: を, に, で, から, へ, と, まで.
5. Use N4/N5 vocabulary for the surrounding sentence so the user focuses on the target noun and particle, not on decoding the rest.
6. ${NO_ROMAJI}`;
}

/** Few-shot conversation turns for noun+particle questions.
 *  Pass to generateQuestionAI as the fewShotTurns argument.
 *  Each pair is a (user message, model JSON response) that demonstrates the expected format.
 */
export const NOUN_PARTICLE_FEW_SHOT_TURNS: Array<{ user: string; model: string }> = [
  {
    user: 'Topic: 図書館\nReading: としょかん\nMeaning: library',
    model: '{"question":"週末はよく[____]本を読みます。","context":"Specify the library as the place where reading happens","answer":"図書館で","accepted_alternatives":[]}',
  },
  {
    user: 'Topic: 駅\nReading: えき\nMeaning: train station',
    model: '{"question":"毎朝[____]歩いて会社に向かいます。","context":"Specify the train station as the starting point of the walk","answer":"駅から","accepted_alternatives":[]}',
  },
  {
    user: 'Topic: 友達\nReading: ともだち\nMeaning: friend',
    model: '{"question":"昨日[____]映画を見に行きました。","context":"Specify the friend as the person you went with","answer":"友達と","accepted_alternatives":[]}',
  },
  {
    user: 'Topic: 音楽\nReading: おんがく\nMeaning: music',
    model: '{"question":"毎朝シャワーを浴びながら[____]聴きます。","context":"Specify music as the thing being listened to","answer":"音楽を","accepted_alternatives":[]}',
  },
  {
    user: 'Topic: 学校\nReading: がっこう\nMeaning: school',
    model: '{"question":"明日は早く[____]行かなければなりません。","context":"Specify the school as the destination","answer":"学校に","accepted_alternatives":[]}',
  },
];

// ---------------------------------------------------------------------------
// Concept mechanic questions
// ---------------------------------------------------------------------------

export const CONCEPT_QUESTION_OPTIONS: Record<string, string> = {
  'error-correction': 'Present a complete Japanese sentence that attempts to use the grammatical rule but contains a specific syntax, particle, or conjugation error related to that rule. Ask the user to correct the error and provide the fully corrected Japanese sentence. Provide the intended English meaning as context.',
  'novel-translation': 'Create a completely new English sentence that naturally forces the use of the grammatical rule. Ask the user to translate it into Japanese. Ensure the vocabulary used is very simple (JLPT N5 level) so the user is only challenged by the grammar structure, not the vocabulary.',
};

export type ConceptQuestionType = keyof typeof CONCEPT_QUESTION_OPTIONS;

/**
 * Builds the system prompt for concept mechanic question generation.
 * The user message for this prompt is an empty string (all context is in the system prompt).
 * Source: questions.service.ts:generateConceptQuestion
 *
 * @param mechanic - The specific mechanic being tested.
 * @param questionType - One of the CONCEPT_QUESTION_OPTIONS keys, randomly selected at call time.
 */
export function buildConceptQuestionPrompt(
  mechanic: ConceptMechanic,
  questionType: ConceptQuestionType,
): string {
  return `You are an expert Japanese tutor.
You are testing the user on a specific grammatical mechanic.
Rule Name: ${mechanic.goalTitle}
Structural Rule: ${mechanic.rule}
Example Application: ${mechanic.simpleExample.japanese} (${mechanic.simpleExample.english})

Your task is to generate a novel question to test this exact mechanic using this format:
${CONCEPT_QUESTION_OPTIONS[questionType]}

You MUST return ONLY a valid JSON object with the following schema:
{
  "question": "The actual question. If fill-in-the-blank, use '[____]' exactly once.",
  "context": "The English translation of the target sentence/fragment to guide the user.",
  "answer": "The Japanese text that answers the question or fills the blank.",
  "accepted_alternatives": ["Array of other valid Japanese answers"]
}

Rules:
1. The answer MUST require the user to apply the provided Structural Rule.
2. The 'question' field MUST be written entirely in English. Any Japanese sentence being shown to the user (e.g. an error-correction sentence) must be embedded inline as a quoted string within the English question text — never write the instruction itself in Japanese.
3. ${NO_ROMAJI}
4. For 'applied-cloze', the blank must encapsulate the conjugated rule (e.g., if the rule is modifying a noun, the blank should ideally be the modifier clause).
5. Use standard, N4/N5 level vocabulary for the surrounding sentence so the user focuses strictly on the grammar mechanic.
6. ${JSON_ONLY_OUTPUT}`;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Picks a random key from a question options map. */
export function pickRandomQuestionType<T extends string>(options: Record<T, string>): T {
  const keys = Object.keys(options) as T[];
  return keys[Math.floor(Math.random() * keys.length)];
}
