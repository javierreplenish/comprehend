// ── Anti-parroting guard ──
// The dialogue prompt tells the judge that echoing the book's own wording is
// weak. This module makes that structural: a deterministic measure of how
// much of the learner's answer is lifted verbatim from the source, checked
// server-side before an advance is allowed - the same philosophy as
// validateAction in sessions.ts. Prompt instructions are not a guarantee;
// this is.

const SHINGLE_SIZE = 5; // 5-word sequences: long enough that shared shingles mean copying, not shared vocabulary

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + SHINGLE_SIZE <= tokens.length; i++) {
    set.add(tokens.slice(i, i + SHINGLE_SIZE).join(" "));
  }
  return set;
}

/**
 * Fraction of the answer's 5-word sequences that appear verbatim in the
 * source (0..1). Returns 0 for answers too short to judge fairly - a
 * technical term or short phrase overlapping is not parroting.
 */
export function sourceOverlapRatio(answer: string, source: string): number {
  const answerTokens = tokenize(answer);
  if (answerTokens.length < 15) return 0;
  const answerShingles = shingles(answerTokens);
  if (answerShingles.size === 0) return 0;
  const sourceShingles = shingles(tokenize(source));
  let hits = 0;
  for (const s of answerShingles) if (sourceShingles.has(s)) hits++;
  return hits / answerShingles.size;
}

/** Above this, the answer is substantially the book's own words rearranged. */
export const PARROTING_THRESHOLD = 0.45;

export function isParroting(answer: string, source: string): boolean {
  return sourceOverlapRatio(answer, source) >= PARROTING_THRESHOLD;
}
