/**
 * Prompt + schema for word-level segmentation of a Japanese sentence, used to
 * place SSML `<break>` pauses between words for the pronunciation-practice tool.
 */

export const SEGMENTATION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    segments: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['segments'],
};

export function buildSegmentationPrompt(text: string): string {
  return `Split the following Japanese sentence into natural spoken-phrase units (bunsetsu-level — a content word plus any particles/auxiliaries attached to it), suitable for inserting a brief pause between each one when read aloud. This is how native speakers actually pause; it is coarser than splitting into individual dictionary words.

**Critical constraints:**
- Do NOT correct, translate, romanize, reorder, or alter the text in ANY way — not even to fix a typo or add missing punctuation.
- Every character of the input MUST appear in your output, in the same order, with no additions or omissions.
- Concatenating all segments in order MUST reproduce the input exactly (whitespace aside).
- **NEVER split a single word or compound across two segments — this is the most important rule.** A pause inserted in the middle of a word removes the surrounding context a text-to-speech engine needs to pick the correct reading, and can make it mispronounce a kanji entirely. For example, the compound "来シーズン" (next season, read らいシーズン) must stay in ONE segment — splitting it into "来" + "シーズン" strips 来 of the context that tells the reader it's not the verb stem 来 (as in 来る/来た, read き/く), and it gets misread. When in doubt, keep a run of characters together rather than splitting it.

Sentence: ${text}

Return ONLY raw JSON matching this shape:
{
  "segments": ["phrase1", "phrase2", "..."]
}`;
}
