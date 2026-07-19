import type { ConceptProgress } from "../src/types";

export type SessionOutcome = "clean" | "struggled" | "incomplete";

const MIN_INTERVAL_DAYS = 1;
const MAX_INTERVAL_DAYS = 90;
const CLEAN_MULTIPLIER = 2.3; // completed all five dimensions with no hint or passage
const STRUGGLED_MULTIPLIER = 1.4; // completed, but needed a hint or the source passage
const INCOMPLETE_INTERVAL_DAYS = 2; // "a couple of days, not weeks" - per the struggle-path design

export interface ScheduleUpdate {
  status: ConceptProgress["status"];
  intervalDays: number;
  streak: number;
  nextDueInDays: number;
}

/**
 * Pure function: given the prior progress state and how a session ended,
 * compute the new interval. This never touches the AI - the dialogue engine's
 * job ends at "clean | struggled | incomplete"; everything after that is arithmetic.
 */
export function computeNextSchedule(prior: Pick<ConceptProgress, "intervalDays" | "streak">, outcome: SessionOutcome): ScheduleUpdate {
  if (outcome === "incomplete") {
    return { status: "needs_revisit", intervalDays: INCOMPLETE_INTERVAL_DAYS, streak: 0, nextDueInDays: INCOMPLETE_INTERVAL_DAYS };
  }

  const multiplier = outcome === "clean" ? CLEAN_MULTIPLIER : STRUGGLED_MULTIPLIER;
  const nextInterval = Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, Math.round(prior.intervalDays * multiplier)));
  const nextStreak = outcome === "clean" ? prior.streak + 1 : 0;

  return { status: "mastered", intervalDays: nextInterval, streak: nextStreak, nextDueInDays: nextInterval };
}
