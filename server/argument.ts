import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { bloomTierDescription, advancedTier, type BloomTier } from "./bloom";
import { isParroting } from "./textOverlap";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.DIALOGUE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

// ── Argument Protocol ──
// Based on Toulmin's model of argumentation. The learner is not just asked
// whether they agree with a claim — they must reconstruct how the claim is
// actually supported: what evidence is offered, what hidden assumption
// bridges that evidence to the conclusion (the WARRANT — the key move),
// how confident the claim should be, and what limits it.
//
// Stage order: claim → grounds → warrant → backing → qualifier → rebuttal
//
// The warrant is the hardest and most important stage: most weak arguments
// have evidence AND a conclusion, but the bridge between them is assumed
// rather than justified. "Studies show X" → "therefore Y" only works if
// you accept an unstated assumption. Making that assumption visible is
// what the Argument protocol exists to teach.

export type ArgumentStage = "claim" | "grounds" | "warrant" | "backing" | "qualifier" | "rebuttal";

export const ARGUMENT_STAGE_ORDER: ArgumentStage[] = [
  "claim",
  "grounds",
  "warrant",
  "backing",
  "qualifier",
  "rebuttal",
];

const ARGUMENT_SYSTEM = `You are a Socratic dialogue tutor running the ARGUMENT protocol — a structured walk through the Toulmin model of argumentation. The learner is examining how a concept from a book is argued, not just what it claims.

The six stages, in order:
- claim: What is the author actually asserting? (The conclusion being advanced)
- grounds: What evidence or data does the author use to support it?
- warrant: What HIDDEN ASSUMPTION bridges the evidence to the claim? This is the key move — most arguments look strong until you surface the unstated premise that makes the evidence "count." A warrant is often invisible to casual readers.
- backing: What supports the warrant itself? Why should we accept that bridging assumption?
- qualifier: How broadly or confidently does the author make this claim? Does it admit exceptions?
- rebuttal: What limitation, exception, or countercase does the argument acknowledge or fail to acknowledge?

Core rules:

1. Never say "wrong." A weak answer stays on the same stage with a narrower, more concrete question. action "ask_question", same stage, attemptNumber incremented.

2. Maximum 3 attempts per stage, then action "mark_incomplete" — warm, specific, names that this concept will resurface. Never "wrong" or "failed."

3. The WARRANT stage is the heart of this protocol. Do not accept:
   - Restating the claim in different words
   - Describing the evidence again
   - Vague phrases like "the evidence supports the claim"
   The learner must name the ASSUMPTION that makes the evidence relevant to the conclusion. Narrow with: "Why does that evidence mean we should accept the claim? What are you assuming is true for that connection to work?"

4. Bloom tier controls question depth — calibrate every question to the stated tier.

5. Reasoning must be visible. A bare assertion, however accurate, is weak. Ask for the because.

6. On the final stage (rebuttal), a complete_session action must include a summaryText that names the full argumentative structure the learner reconstructed — not generic praise.

7. The anti-parroting signal is in the input. If it fires, do NOT advance — ask for the idea in the learner's own framing.

8. Every question must be answerable from the concept's source material — never invent claims.`;

const ARGUMENT_TOOL: Anthropic.Tool = {
  name: "submit_argument_action",
  description: "Submit the next action in this Toulmin-based Argument dialogue.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["ask_question", "complete_session", "mark_incomplete"] },
          stage: { type: "string", enum: ARGUMENT_STAGE_ORDER, description: "Required for ask_question." },
          attemptNumber: { type: "integer", minimum: 1, maximum: 3, description: "Required for ask_question." },
          questionText: { type: "string", description: "Required for ask_question." },
          introText: { type: ["string", "null"], description: "Non-null only when moving to a new stage; null on narrowing attempts." },
          summaryText: { type: "string", description: "Required for complete_session — names the full argumentative structure reconstructed." },
          supportiveText: { type: "string", description: "Required for mark_incomplete — warm, names that the concept will resurface." },
        },
      },
    },
  },
};

function formatArgumentInput(
  concept: { label: string; sourceLocator: string; sourcePassage: string },
  currentStage: ArgumentStage,
  attemptNumber: number,
  bloomTier: BloomTier,
  history: Array<{ stage: string; questionText: string; answerText: string | null }>,
  latestAnswer: string | null,
  advisoryNote?: string
): string {
  const hist = history.length
    ? history.map((t) => `- [${t.stage}] Q: ${t.questionText}\n  A: ${t.answerText ?? "(unanswered)"}`).join("\n")
    : "(none yet — this is the first stage)";
  return `Concept: "${concept.label}"
Source locator: ${concept.sourceLocator}
Source passage (reference only — do not recite verbatim unless essential): """${concept.sourcePassage}"""

${bloomTierDescription({ tier: bloomTier, protocol: "argument" })}

Current stage: ${currentStage}
Current attempt number: ${attemptNumber}

This session's turns so far:
${hist}

The learner's latest answer: """${latestAnswer ?? "(awaiting first answer)"}"""
${advisoryNote ? `\nSERVER SIGNAL: ${advisoryNote}` : ""}
Decide the next action now.`;
}

async function runArgumentTurn(
  concept: { label: string; sourceLocator: string; sourcePassage: string },
  currentStage: ArgumentStage,
  attemptNumber: number,
  bloomTier: BloomTier,
  history: Array<{ stage: string; questionText: string; answerText: string | null }>,
  latestAnswer: string | null,
  advisoryNote?: string,
  correction?: string
): Promise<any> {
  const content = formatArgumentInput(concept, currentStage, attemptNumber, bloomTier, history, latestAnswer, advisoryNote);
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: ARGUMENT_SYSTEM,
    tools: [ARGUMENT_TOOL],
    tool_choice: { type: "tool", name: "submit_argument_action" },
    messages: [{ role: "user", content: content + (correction ? `\n\nCORRECTION: ${correction}` : "") }],
  });
  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("The Argument engine did not return a structured action.");
  return (toolUse.input as any).action;
}

function validateArgumentAction(action: any, currentStage: ArgumentStage, attemptNumber: number): string | null {
  const stageIndex = ARGUMENT_STAGE_ORDER.indexOf(currentStage);
  const isLastStage = stageIndex === ARGUMENT_STAGE_ORDER.length - 1;
  if (action.type === "ask_question") {
    const actionStageIndex = ARGUMENT_STAGE_ORDER.indexOf(action.stage);
    if (actionStageIndex < stageIndex) return `Cannot go back to stage "${action.stage}" from "${currentStage}".`;
    if (action.stage === currentStage && attemptNumber >= 3) return `Stage "${currentStage}" has reached max attempts. Use mark_incomplete.`;
    if (actionStageIndex > stageIndex + 1) return `Cannot skip stages. From "${currentStage}" the next must be "${ARGUMENT_STAGE_ORDER[stageIndex + 1]}".`;
  }
  if (action.type === "complete_session" && !isLastStage) return `complete_session only valid on the last stage (rebuttal), not "${currentStage}".`;
  return null;
}

function getTopicForArgument(topicId: number): { label: string; sourceLocator: string; sourcePassage: string } {
  const t = db.prepare("SELECT label, source_locator, source_passage FROM topics WHERE id = ?").get(topicId) as any;
  if (!t) throw new Error("Topic not found.");
  return { label: t.label, sourceLocator: t.source_locator ?? "location not specified", sourcePassage: t.source_passage ?? t.thesis ?? "" };
}

export async function startArgumentSession(userId: number, topicId: number) {
  // Bloom tier from topic_progress — defaults to 1 if no record
  const progress = db.prepare("SELECT bloom_tier FROM topic_progress WHERE user_id = ? AND topic_id = ?").get(userId, topicId) as any;
  const bloomTier: BloomTier = (progress?.bloom_tier ?? 1) as BloomTier;

  const concept = getTopicForArgument(topicId);
  const firstStage: ArgumentStage = "claim";
  const action = await runArgumentTurn(concept, firstStage, 1, bloomTier, [], null);
  if (action.type !== "ask_question") throw new Error("Expected the Argument engine to open with a question.");

  const sessionInfo = db.prepare("INSERT INTO argument_sessions (user_id, topic_id, bloom_tier) VALUES (?, ?, ?)").run(userId, topicId, bloomTier);
  const sessionId = sessionInfo.lastInsertRowid as number;
  const turnInfo = db.prepare("INSERT INTO argument_turns (session_id, stage, attempt_number, question_text) VALUES (?, ?, 1, ?)").run(sessionId, firstStage, action.questionText);

  return { sessionId, turnId: turnInfo.lastInsertRowid as number, stage: firstStage, questionText: action.questionText, introText: action.introText ?? null, bloomTier };
}

export async function respondToArgumentTurn(userId: number, sessionId: number, turnId: number, answerText: string) {
  const session = db.prepare("SELECT * FROM argument_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId) as any;
  if (!session || session.status !== "in_progress") throw new Error("Session not found or already ended.");

  const turn = db.prepare("SELECT * FROM argument_turns WHERE id = ? AND session_id = ?").get(turnId, sessionId) as any;
  if (!turn || turn.answer_text !== null) throw new Error("Turn not found or already answered.");
  db.prepare("UPDATE argument_turns SET answer_text = ? WHERE id = ?").run(answerText, turnId);

  const concept = getTopicForArgument(session.topic_id);
  const history = (db.prepare("SELECT * FROM argument_turns WHERE session_id = ? ORDER BY id ASC").all(sessionId) as any[]).map((t) => ({
    stage: t.stage, questionText: t.question_text, answerText: t.answer_text,
  }));

  const parroting = isParroting(answerText, concept.sourcePassage);
  const advisoryNote = parroting ? "The answer overlaps the source material verbatim. Do not advance — ask for it in the learner's own framing." : undefined;

  let action = await runArgumentTurn(concept, turn.stage as ArgumentStage, turn.attempt_number, session.bloom_tier as BloomTier, history, answerText, advisoryNote);
  let violation = validateArgumentAction(action, turn.stage as ArgumentStage, turn.attempt_number);
  if (violation) {
    action = await runArgumentTurn(concept, turn.stage as ArgumentStage, turn.attempt_number, session.bloom_tier as BloomTier, history, answerText, advisoryNote, violation);
    violation = validateArgumentAction(action, turn.stage as ArgumentStage, turn.attempt_number);
    if (violation) action = { type: "mark_incomplete", supportiveText: "This argument is worth returning to — we'll come back when the time is right." };
  }

  // Update verdict
  const verdict = action.type === "complete_session" ? "advance" : action.type === "mark_incomplete" ? "incomplete" : action.stage === turn.stage ? "narrow" : "advance";
  db.prepare("UPDATE argument_turns SET verdict = ? WHERE id = ?").run(verdict, turnId);

  if (action.type === "mark_incomplete") {
    db.prepare("UPDATE argument_sessions SET status = 'incomplete', ended_at = datetime('now') WHERE id = ?").run(sessionId);
    return { action: "incomplete" as const, supportiveText: action.supportiveText };
  }

  if (action.type === "complete_session") {
    db.prepare("UPDATE argument_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?").run(sessionId);
    // Advance Bloom tier
    const currentTier = session.bloom_tier as BloomTier;
    const newTier = advancedTier(currentTier, "argument");
    db.prepare(`INSERT INTO topic_progress (user_id, topic_id, bloom_tier, status, interval_days, streak)
      VALUES (?, ?, ?, 'mastered', 1, 0)
      ON CONFLICT(user_id, topic_id) DO UPDATE SET bloom_tier = excluded.bloom_tier`
    ).run(userId, session.topic_id, newTier);
    return { action: "complete" as const, summaryText: action.summaryText };
  }

  // Next turn
  const nextTurnInfo = db.prepare("INSERT INTO argument_turns (session_id, stage, attempt_number, question_text) VALUES (?, ?, ?, ?)").run(
    sessionId, action.stage, action.attemptNumber, action.questionText
  );
  return { action: "continue" as const, turnId: nextTurnInfo.lastInsertRowid as number, stage: action.stage as ArgumentStage, questionText: action.questionText, introText: action.introText ?? null };
}
