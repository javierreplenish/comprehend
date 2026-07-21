import { db } from "./db";
import { runDialogueTurn } from "./dialogue";
import { isParroting } from "./textOverlap";
import { computeNextSchedule, type SessionOutcome } from "./scheduler";
import { DIMENSION_ORDER, type Dimension, type DialogueAction } from "../src/types";

interface TopicRow {
  id: number;
  label: string;
  source_locator: string;
  thesis: string;
}

export interface TurnRow {
  id: number;
  session_id: number;
  dimension: Dimension;
  attempt_number: number;
  question_text: string;
  answer_text: string | null;
  verdict: string | null;
  hint_requested: number;
  passage_shown: number;
}

function getTopic(topicId: number): TopicRow {
  const topic = db.prepare("SELECT * FROM topics WHERE id = ?").get(topicId) as TopicRow | undefined;
  if (!topic) throw new Error("Topic not found.");
  return topic;
}

// The full text a learner could be parroting from: the topic's thesis plus
// every source-card passage linked to it (those are shown verbatim in
// Flashcard Lab and on passage reveal).
function getTopicSourceText(topicId: number): string {
  const topic = getTopic(topicId);
  const cards = db.prepare(
    `SELECT c.source_passage FROM topic_source_cards tsc JOIN concepts c ON c.id = tsc.concept_id WHERE tsc.topic_id = ?`
  ).all(topicId) as Array<{ source_passage: string }>;
  return [topic.thesis, ...cards.map((c) => c.source_passage)].join("\n");
}

function getPriorSessionQuestions(userId: number, topicId: number): string[] {
  const rows = db
    .prepare(
      `SELECT dt.question_text FROM dialogue_turns dt
       JOIN dialogue_sessions ds ON ds.id = dt.session_id
       WHERE ds.user_id = ? AND ds.topic_id = ? AND ds.status = 'incomplete'`,
    )
    .all(userId, topicId) as Array<{ question_text: string }>;
  return rows.map((row) => row.question_text);
}

function getSessionTurns(sessionId: number): TurnRow[] {
  return db.prepare("SELECT * FROM dialogue_turns WHERE session_id = ? ORDER BY id ASC").all(sessionId) as TurnRow[];
}

function ensureProgressRow(userId: number, topicId: number) {
  db.prepare("INSERT OR IGNORE INTO topic_progress (user_id, topic_id) VALUES (?, ?)").run(userId, topicId);
}

// Structural enforcement of the five-dimension sequence. The system prompt
// TELLS the model not to skip dimensions or complete early - this function
// actually CHECKS it. Prompt instructions are not a guarantee; this is.
export function validateAction(action: DialogueAction, turn: TurnRow, hintRequested: boolean, parroting = false): string | null {
  // Anti-parroting is structural, like the dimension sequence: an answer
  // that is substantially the source's own wording may never advance,
  // regardless of how good the judge thought it sounded.
  if (parroting && !turn.passage_shown && (action.type === "complete_session" || (action.type === "ask_question" && action.dimension !== turn.dimension))) {
    return `You advanced, but the server detected the learner's answer is substantially verbatim from the source material. Restating the book's own words is not comprehension. Stay on dimension "${turn.dimension}" and ask them to express it in their own words, from their own angle.`;
  }
  const currentIndex = DIMENSION_ORDER.indexOf(turn.dimension);
  const isLastDimension = currentIndex === DIMENSION_ORDER.length - 1;
  const nextDimension = isLastDimension ? null : DIMENSION_ORDER[currentIndex + 1];

  if (action.type === "give_hint" && !hintRequested) {
    return "You returned give_hint but the learner did not request a hint on this turn.";
  }
  if (action.type === "complete_session" && !isLastDimension) {
    return `You returned complete_session but the current dimension is "${turn.dimension}", not "synthesis" (the final dimension). Every topic must move through all five dimensions in order before completing.`;
  }
  if (action.type === "offer_passage" && turn.passage_shown) {
    return `You returned offer_passage, but the passage was already shown for this dimension. Post-passage, the options are a narrowing question (if attempts remain), advancement, or mark_incomplete after the third post-passage attempt.`;
  }
  if (action.type === "offer_passage" && turn.attempt_number < 3) {
    return `You returned offer_passage but this was only attempt ${turn.attempt_number} of 3 on dimension "${turn.dimension}". The passage may only be offered after a third weak attempt at the same dimension.`;
  }
  if (action.type === "mark_incomplete" && !turn.passage_shown) {
    return "You returned mark_incomplete, but the source passage was never offered first. mark_incomplete is only valid after the passage has been shown AND a third post-passage attempt still falls short.";
  }
  if (action.type === "mark_incomplete" && turn.passage_shown && turn.attempt_number < 3) {
    return `You returned mark_incomplete, but this was only post-passage attempt ${turn.attempt_number} of 3. The learner has attempts remaining - narrow with a more concrete question instead.`;
  }
  if (action.type === "ask_question") {
    const isSameDimension = action.dimension === turn.dimension;
    const isAdvanceToNext = nextDimension !== null && action.dimension === nextDimension;
    if (!isSameDimension && !isAdvanceToNext) {
      return `You returned ask_question for dimension "${action.dimension}", but from "${turn.dimension}" the only valid next dimensions are staying on "${turn.dimension}" (narrowing) or advancing to "${nextDimension ?? "none - this is the last dimension, so the only valid action is complete_session"}".`;
    }
    if (isSameDimension && turn.attempt_number >= 3) {
      return turn.passage_shown
        ? `You returned a narrowing question, but post-passage attempt ${turn.attempt_number} on "${turn.dimension}" was already the third of the post-passage cycle. If the answer is weak, the action must be mark_incomplete.`
        : `You returned a narrowing question, but attempt ${turn.attempt_number} on "${turn.dimension}" was already the third attempt. The next action must be offer_passage, not another narrowing question.`;
    }
  }
  return null;
}

async function askFirstQuestion(userId: number, topicId: number, sessionId: number) {
  const topic = getTopic(topicId);
  const result = await runDialogueTurn({
    concept: { label: topic.label, sourceLocator: topic.source_locator, sourcePassage: topic.thesis },
    currentDimension: "clarify",
    attemptNumber: 1,
    sessionHistory: [],
    priorSessionQuestions: getPriorSessionQuestions(userId, topicId),
    latestAnswer: null,
    hintRequested: false,
    passageShown: false,
  });
  if (result.action.type !== "ask_question") throw new Error("Expected the first turn to be a question.");
  const { dimension, attemptNumber, questionText } = result.action;
  const info = db
    .prepare("INSERT INTO dialogue_turns (session_id, dimension, attempt_number, question_text) VALUES (?, ?, ?, ?)")
    .run(sessionId, dimension, attemptNumber, questionText);
  return { turnId: info.lastInsertRowid as number, dimension, attemptNumber, questionText, introText: result.action.introText };
}

export async function startSession(userId: number, topicId: number) {
  ensureProgressRow(userId, topicId);
  const info = db.prepare("INSERT INTO dialogue_sessions (user_id, topic_id) VALUES (?, ?)").run(userId, topicId);
  const sessionId = info.lastInsertRowid as number;
  const firstTurn = await askFirstQuestion(userId, topicId, sessionId);
  return { sessionId, ...firstTurn };
}

function applySchedule(userId: number, topicId: number, outcome: SessionOutcome) {
  const priorRow = db.prepare("SELECT interval_days, streak FROM topic_progress WHERE user_id = ? AND topic_id = ?").get(userId, topicId) as
    | { interval_days: number; streak: number }
    | undefined;
  const prior = priorRow ? { intervalDays: priorRow.interval_days, streak: priorRow.streak } : { intervalDays: 1, streak: 0 };
  const schedule = computeNextSchedule(prior, outcome);
  db.prepare(
    `UPDATE topic_progress SET status = ?, interval_days = ?, streak = ?, last_completed_at = datetime('now'),
     next_due_at = datetime('now', '+' || ? || ' days') WHERE user_id = ? AND topic_id = ?`,
  ).run(schedule.status, schedule.intervalDays, schedule.streak, schedule.nextDueInDays, userId, topicId);
  return schedule;
}

export async function respondToTurn(userId: number, sessionId: number, turnId: number, input: { answerText?: string; hintRequested?: boolean }) {
  const session = db.prepare("SELECT * FROM dialogue_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId) as
    | { id: number; topic_id: number; status: string; used_passage: number; used_hint: number }
    | undefined;
  if (!session) throw new Error("Session not found.");
  if (session.status !== "in_progress") throw new Error("This session has already ended.");

  const turn = db.prepare("SELECT * FROM dialogue_turns WHERE id = ? AND session_id = ?").get(turnId, sessionId) as TurnRow | undefined;
  if (!turn) throw new Error("Turn not found.");

  const topic = getTopic(session.topic_id);
  const turns = getSessionTurns(sessionId);
  const sessionHistory = turns.map((t) => ({ dimension: t.dimension, questionText: t.question_text, answerText: t.answer_text }));

  const hintRequested = Boolean(input.hintRequested);
  const parroting = !hintRequested && !turn.passage_shown && isParroting(input.answerText ?? "", getTopicSourceText(session.topic_id));
  if (hintRequested) {
    db.prepare("UPDATE dialogue_turns SET hint_requested = 1 WHERE id = ?").run(turnId);
    db.prepare("UPDATE dialogue_sessions SET used_hint = 1 WHERE id = ?").run(sessionId);
  } else {
    db.prepare("UPDATE dialogue_turns SET answer_text = ? WHERE id = ?").run(input.answerText ?? "", turnId);
  }

  const engineInput = {
    concept: { label: topic.label, sourceLocator: topic.source_locator, sourcePassage: topic.thesis },
    currentDimension: turn.dimension,
    attemptNumber: turn.attempt_number,
    passageShown: Boolean(turn.passage_shown),
    sessionHistory,
    priorSessionQuestions: getPriorSessionQuestions(userId, session.topic_id),
    latestAnswer: hintRequested ? null : (input.answerText ?? null),
    hintRequested,
    advisoryNote: parroting
      ? "The learner's answer overlaps the source material verbatim to a substantial degree. Do not advance on this answer - narrow, and ask for it in their own words."
      : undefined,
  };

  let result = await runDialogueTurn(engineInput);
  let violation = validateAction(result.action, turn, hintRequested, parroting);
  if (violation) {
    console.warn(`Dialogue engine violated the rules on turn ${turnId}: ${violation}`);
    result = await runDialogueTurn(engineInput, violation);
    violation = validateAction(result.action, turn, hintRequested, parroting);
    if (violation) {
      throw new Error(`The reasoning engine could not produce a valid next step after correction: ${violation}`);
    }
  }

  const action = result.action;

  if (action.type === "give_hint") {
    return { action: "give_hint" as const, hintText: action.hintText };
  }

  if (action.type === "ask_question") {
    const isNewDimension = action.dimension !== turn.dimension;
    db.prepare("UPDATE dialogue_turns SET verdict = ? WHERE id = ?").run(isNewDimension ? "advance" : "narrow", turnId);
    const info = db.prepare("INSERT INTO dialogue_turns (session_id, dimension, attempt_number, question_text, passage_shown) VALUES (?, ?, ?, ?, ?)").run(
      sessionId,
      action.dimension,
      action.attemptNumber,
      action.questionText,
      action.dimension === turn.dimension ? turn.passage_shown : 0,
    );
    return { action: "ask_question" as const, turnId: info.lastInsertRowid as number, dimension: action.dimension, attemptNumber: action.attemptNumber, questionText: action.questionText, introText: action.introText };
  }

  if (action.type === "offer_passage") {
    db.prepare("UPDATE dialogue_turns SET verdict = 'needs_passage' WHERE id = ?").run(turnId);
    db.prepare("UPDATE dialogue_sessions SET used_passage = 1 WHERE id = ?").run(sessionId);
    const nextTurnId = db
      .prepare("INSERT INTO dialogue_turns (session_id, dimension, attempt_number, question_text, passage_shown) VALUES (?, ?, ?, ?, 1)")
      .run(sessionId, turn.dimension, 1, action.leadInText).lastInsertRowid as number;
    return { action: "offer_passage" as const, leadInText: action.leadInText, sourcePassage: topic.thesis, turnId: nextTurnId };
  }

  if (action.type === "complete_session") {
    db.prepare("UPDATE dialogue_turns SET verdict = 'advance' WHERE id = ?").run(turnId);
    db.prepare("UPDATE dialogue_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?").run(sessionId);
    const outcome: SessionOutcome = session.used_passage || session.used_hint || hintRequested ? "struggled" : "clean";
    const schedule = applySchedule(userId, session.topic_id, outcome);
    return { action: "complete_session" as const, summaryText: action.summaryText, nextDueInDays: schedule.nextDueInDays };
  }

  // mark_incomplete
  db.prepare("UPDATE dialogue_turns SET verdict = 'incomplete' WHERE id = ?").run(turnId);
  db.prepare("UPDATE dialogue_sessions SET status = 'incomplete', ended_at = datetime('now') WHERE id = ?").run(sessionId);
  const schedule = applySchedule(userId, session.topic_id, "incomplete");
  return { action: "mark_incomplete" as const, supportiveText: action.supportiveText, nextDueInDays: schedule.nextDueInDays };
}

export function getDueTopics(userId: number, chapterId: number) {
  return db
    .prepare(
      `SELECT t.id, t.label, tp.status, tp.next_due_at FROM topics t
       LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.user_id = ?
       WHERE t.chapter_id = ?
       ORDER BY t.order_index ASC`,
    )
    .all(userId, chapterId);
}

export { DIMENSION_ORDER };
