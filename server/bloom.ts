// ── Bloom's Revised Taxonomy difficulty scaffold ──
// Bloom controls HOW DEMANDING a question is across all three protocols
// (Mastery / Argument / Audit). The learner never sees "Bloom tier" — they
// see question phrasing that's naturally more demanding as they progress.
//
// Tier mapping used throughout:
//   1 = Remember / Understand  → define, describe, explain, paraphrase
//   2 = Apply / Analyze        → trace a mechanism, compare, distinguish, break down
//   3 = Evaluate / Create      → judge competing claims, propose, design, defend
//
// Tier is stored on topic_progress.bloom_tier and advances when a session
// is completed at the current tier. Mastery always starts at tier 1;
// Argument unlocks at tier 2 after Mastery; Audit unlocks at tier 3 after
// Argument is completed once.

export type BloomTier = 1 | 2 | 3;

export interface BloomContext {
  tier: BloomTier;
  protocol: "mastery" | "argument" | "audit";
}

/** Human-readable description of this Bloom tier for the prompt. */
export function bloomTierDescription(ctx: BloomContext): string {
  const verbs: Record<BloomTier, string> = {
    1: "Remember and Understand — ask the learner to define, describe, explain, or put the idea in their own words. Questions should be answerable with accurate recall and clear paraphrase.",
    2: "Apply and Analyze — ask the learner to trace a mechanism, compare two cases, distinguish a nuance, or break down a structure. Questions should require going beyond recall to active reasoning.",
    3: "Evaluate and Create — ask the learner to judge the strength of competing claims, propose an alternative, design a test case, or construct a novel synthesis. Questions should require the learner to take a position and defend it.",
  };
  return `Bloom difficulty tier: ${ctx.tier} (${verbs[ctx.tier]}) — calibrate every question and every judgment to this level. A tier-1 learner who gives a tier-3 answer should still be credited; a tier-3 learner who gives a tier-1 answer (surface-level, no judgment) should be narrowed.`;
}

/** Which protocol unlocks at which minimum tier. */
export const PROTOCOL_TIER: Record<"mastery" | "argument" | "audit", BloomTier> = {
  mastery: 1,
  argument: 2,
  audit: 3,
};

/** True when the learner's current bloom_tier is high enough to access this protocol. */
export function protocolUnlocked(userTier: BloomTier, protocol: "argument" | "audit"): boolean {
  return userTier >= PROTOCOL_TIER[protocol];
}

/** Advance the Bloom tier when a protocol session completes.
 *  Mastery complete → tier becomes max(current, 2)
 *  Argument complete → tier becomes max(current, 3)
 *  Audit complete → stays at 3 (ceiling) */
export function advancedTier(currentTier: BloomTier, completedProtocol: "mastery" | "argument" | "audit"): BloomTier {
  if (completedProtocol === "mastery") return Math.max(currentTier, 2) as BloomTier;
  if (completedProtocol === "argument") return Math.max(currentTier, 3) as BloomTier;
  return 3;
}
