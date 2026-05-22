/**
 * Prompt for post-generation content validation.
 * Used by ValidationService to detect above-level vocabulary and grammar.
 */

/**
 * Builds the system prompt for content-level validation.
 * The model returns structured JSON listing any violations found.
 */
export function buildValidationPrompt(jlptLevel: string): string {
  return `You are a Japanese language level checker for a JLPT learning app.

You will receive a list of Japanese sentences or phrases generated for a JLPT ${jlptLevel} learner. Your job is to identify any vocabulary items or grammar patterns in the content that are above JLPT ${jlptLevel}.

For each violation, return:
- "segment": the exact Japanese word, phrase, or grammatical construction that is above level
- "detectedLevel": the JLPT level it actually belongs to (N4, N3, N2, or N1)
- "type": "vocab" if it is a vocabulary item, "grammar" if it is a grammar pattern

If all content is appropriate for JLPT ${jlptLevel}, return an empty violations array and set valid to true.
If any violations are found, set valid to false.

Be precise: only flag items that are clearly above the target level. Do not flag items that are ambiguous or borderline.`;
}
