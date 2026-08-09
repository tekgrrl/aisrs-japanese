/**
 * Shared prompt fragments for use across the prompt library.
 *
 * Unified text fragments used across the prompt library.
 * Import and interpolate these constants instead of repeating literal text.
 */

export const NO_ROMAJI =
  `Do not include Romaji anywhere in your response.`;

export function levelConstraint(jlptLevel: string): string {
  return `LEVEL CONSTRAINT (critical): every word in the example sentences — not just the grammar structure — MUST be at or below JLPT ${jlptLevel}. The ONLY exception is the specific target vocabulary/pattern being taught; everything else in the sentence must be ordinary, well-known JLPT ${jlptLevel}-or-below vocabulary. If a natural example would require a more advanced word, choose a different example scenario rather than reaching for it — do not compromise on this to make the sentence more natural or interesting.`;
}

export const JSON_ONLY_OUTPUT =
  `Return ONLY a valid JSON object. Do NOT output any text before or after it. Do NOT use markdown code blocks or backticks.`;

/**
 * Contract for sentence-assembly fragment arrays.
 * Used in: concept naturalExample, grammar lesson examples, scenario grammarNotes.
 */
export const FRAGMENT_CONTRACT =
  `The 'fragments' array MUST split the sentence into minimal grammatical chunks. ` +
  `When concatenated in order, the strings in 'fragments' MUST perfectly reconstruct the 'japanese' string. ` +
  `ALWAYS group particles with their preceding nouns. ` +
  `NEVER include Romaji or furigana in fragments.`;

/**
 * Definition of the accepted_alternatives field.
 * Used alongside FRAGMENT_CONTRACT wherever sentence-assembly facets are generated.
 */
export const ACCEPTED_ALTERNATIVES_DEF =
  `'accepted_alternatives': List every other ordering of the EXACT same fragments that produces a grammatically ` +
  `correct sentence. Do NOT include rephrased sentences or sentences using different words. ` +
  `Provide an empty array if none exist.`;
