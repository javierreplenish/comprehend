// The fixed sequence every concept walkthrough moves through, in order.
// All five must complete in one session for a concept to count as mastered —
// no partial credit, no resuming mid-chain (a deliberate choice: "mastered"
// means the full argument held together in one sitting).
export type Dimension = "clarify" | "probe" | "counterargument" | "application" | "synthesis";
export const DIMENSION_ORDER: Dimension[] = ["clarify", "probe", "counterargument", "application", "synthesis"];

export interface Book {
  id: number;
  title: string;
  author: string | null;
  status: "processing" | "ready" | "failed";
  uploadedByUserId: number;
  createdAt: string;
}

export interface Chapter {
  id: number;
  bookId: number;
  number: number;
  title: string;
  summary: string;
  orderIndex: number;
}

export interface Concept {
  id: number;
  chapterId: number;
  label: string;
  /** Where in the source this concept comes from - page, section, or locator string. */
  sourceLocator: string;
  /** The passage offered as support after three narrowing attempts miss. */
  sourcePassage: string;
  orderIndex: number;
}

// One row per (user, concept) - drives the spaced-repetition scheduler.
// This is pure arithmetic, no AI involved: the dialogue engine's outcome
// (mastered clean / mastered with struggle / not completed) feeds this,
// this decides when the concept is due again.
export interface ConceptProgress {
  userId: number;
  conceptId: number;
  status: "not_started" | "mastered" | "needs_revisit";
  /** Spaced-repetition interval in days until this concept is due again. */
  intervalDays: number;
  /** Number of consecutive clean (no-struggle) completions - drives interval growth. */
  streak: number;
  lastCompletedAt: string | null;
  nextDueAt: string | null;
}

// One attempt at fully completing one concept's five-dimension chain.
export interface DialogueSession {
  id: number;
  userId: number;
  conceptId: number;
  status: "in_progress" | "completed" | "incomplete";
  startedAt: string;
  endedAt: string | null;
  /** True if any dimension needed the source passage - affects scheduling, not pass/fail. */
  usedPassage: boolean;
  /** True if any hint was requested - tracked privately, never shown as a stat to anyone else. */
  usedHint: boolean;
}

// A single question-and-answer exchange within a session.
export interface DialogueTurn {
  id: number;
  sessionId: number;
  dimension: Dimension;
  /** 1-3. A fresh narrowing question increments this; advancing to a new dimension resets it to 1. */
  attemptNumber: number;
  questionText: string;
  answerText: string | null;
  /** Set once the answer is judged. Null while awaiting the user's response. */
  verdict: "advance" | "narrow" | "needs_passage" | "incomplete" | null;
  hintRequested: boolean;
  passageShown: boolean;
  createdAt: string;
}

// ---- The single AI call type: judge the latest answer, decide what happens next ----

export interface DialogueEngineInput {
  concept: Pick<Concept, "label" | "sourceLocator" | "sourcePassage">;
  currentDimension: Dimension;
  attemptNumber: number;
  /** This session's turns so far, for continuity within the walkthrough. */
  sessionHistory: Array<Pick<DialogueTurn, "dimension" | "questionText" | "answerText">>;
  /** Question text from the user's prior (incomplete) sessions on this same concept,
   *  so a restart generates genuinely fresh questions instead of repeating wording. */
  priorSessionQuestions: string[];
  /** The answer just submitted, or null if this is a hint request with no new answer yet. */
  latestAnswer: string | null;
  hintRequested: boolean;
}

export type DialogueAction =
  | { type: "ask_question"; dimension: Dimension; attemptNumber: number; questionText: string; introText: string | null }
  | { type: "give_hint"; hintText: string }
  | { type: "offer_passage"; leadInText: string }
  | { type: "complete_session"; summaryText: string }
  | { type: "mark_incomplete"; supportiveText: string };

export interface DialogueEngineResult {
  action: DialogueAction;
}
