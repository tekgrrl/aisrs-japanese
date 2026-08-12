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
 * Register guidance for any Japanese sentence a learner will read or hear.
 * Used wherever the AI generates example/context sentences: grammar examples,
 * vocab context_examples, concept naturalExample/examples.
 */
export const PREFER_SPOKEN_REGISTER =
  `NATURAL SPOKEN REGISTER (critical): favor the form an actual native speaker would say in conversation over a ` +
  `grammatically valid but stiff/bookish alternative. The most common failure mode is past-tense negation: ` +
  `〜くありませんでした for i-adjectives (e.g. 寒くありませんでした, "it was not cold") and 〜ではありませんでした ` +
  `for na-adjectives/nouns (e.g. 学生ではありませんでした, "was not a student") are grammatically correct but read as ` +
  `formal written Japanese, not natural spoken Japanese — even in polite speech, natural spoken Japanese uses ` +
  `〜くなかったです and 〜じゃなかったです instead (e.g. 寒くなかったです, 学生じゃなかったです). Apply the same ` +
  `judgment generally: when a grammatically valid form is rarely used in real conversation in favor of a more ` +
  `natural spoken alternative, use the natural one — unless the pattern being taught IS specifically that form.`;

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
  `'accepted_alternatives': a JSON array of STRINGS — never an array of arrays. Each string is one other ordering ` +
  `of the EXACT same fragments, concatenated back into a single grammatically correct sentence ` +
  `(e.g. if fragments are ["今、", "テレビを", "見ています。"], a valid entry is the STRING "テレビを今、見ています。", ` +
  `NOT the array ["テレビを", "今、", "見ています。"]). Do NOT include rephrased sentences or sentences using different words. ` +
  `Provide an empty array if none exist.`;
