/** Escapes text for safe inclusion inside SSML markup. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Confirms `segments` reconstructs `original` exactly, modulo whitespace
 * (including full-width U+3000). Deliberately strict beyond that — no
 * punctuation/script normalization — because this exists specifically to
 * catch an LLM segmenter "helpfully" correcting, translating, or dropping
 * characters from what the user typed.
 */
export function validateSegments(original: string, segments: string[]): boolean {
  const normalize = (s: string) => s.replace(/[\s　]/g, '');
  return normalize(segments.join('')) === normalize(original);
}

/**
 * Deterministic, zero-API-call fallback: split on Japanese clause-ending
 * punctuation and whitespace. Coarser than word-level segmentation but
 * always available.
 */
export function punctuationSplit(text: string): string[] {
  return text
    .split(/([、。！？\s　]+)/)
    .filter((s) => s.length > 0);
}

/**
 * Builds `<speak>` SSML with a break inserted between each segment.
 * Escapes each segment individually before joining — escaping the
 * already-joined string would corrupt the literal `<break>` tags.
 */
export function buildPacedSsml(segments: string[], pauseMs: number): string {
  const body = segments
    .map((s) => escapeXml(s))
    .join(`<break time="${pauseMs}ms"/>`);
  return `<speak>${body}</speak>`;
}
