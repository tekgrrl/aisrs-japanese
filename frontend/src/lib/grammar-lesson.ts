/**
 * Grammar lessons occasionally arrive with multiple formation variants bundled
 * into a single string (joined by a literal or escaped newline) instead of
 * separate array entries. Splitting on newlines here keeps variants visually
 * distinct regardless of which shape the data is in.
 */
export function normalizeFormation(formation: string | string[]): string[] {
  const arr = Array.isArray(formation) ? formation : [formation];
  return arr
    .flatMap((f) => f.replace(/\\n/g, '\n').split('\n'))
    .map((f) => f.trim())
    .filter(Boolean);
}
