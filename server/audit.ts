import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { bloomTierDescription, advancedTier, type BloomTier } from "./bloom";
import { isParroting } from "./textOverlap";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.DIALOGUE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// ── Audit Protocol ──
// Based on Paul-Elder Critical Thinking Framework. Where Argument asks
// "is this claim well-supported?", Audit asks "is this reasoning inspectable
// and revisable?" — a metacognitive move: stepping back to examine the
// entire thought process, not just one claim.
//
// Stage order: purpose → question → assumptions → viewpoint → evidence → inference → consequences
//
// This is not a bias detector. It is a method for making reasoning
// transparent. The learner learns to ask: What are you trying to achieve?
// What exactly are you asking? What are you taking for granted? Whose
// perspective is missing? What information are you relying on? What does
// that information actually show? What follows if you're wrong?
//
// Audit unlocks after the learner has completed one Argument session
// (bloom_tier reaches 3). A learner who can reconstruct a Toulmin argument
// AND inspect the reasoning behind it has demonstrated genuine critical
// thinking depth.

export type AuditStage = "purpose" | "question" | "assumptions" | "viewpoint" | "evidence" | "inference" | "consequences";

export const AUDIT_STAGE_ORDER: AuditStage[] = [
  "purpose",
  "question",
  "assumptions",
  "viewpoint",
  "evidence",
  "inference",
  "consequences",
];

const AUDIT_SYSTEM = `You are a Socratic dialogue tutor running the AUDIT protocol — a structured walk through the Paul-Elder elements of reasoning. The learner is not evaluating a claim from outside; they are standing inside the reasoning and inspecting its machinery.

The seven stages, in order:
- purpose: What is the author or thinker actually trying to achieve? What goal or interest shapes this reasoning? (Not just "to argue X" — what deeper aim?)
- question: What is the precise question being addressed? Is it the right question, or does it beg a prior question?
- assumptions: What is being taken for granted that is never stated? What would the reasoning require to be true in order to proceed? Which of these assumptions is most questionable?
- viewpoint: Whose perspective or frame of reference is this reasoning anchored in? What perspective is absent or suppressed? What would the reasoning look like from that other vantage point?
- evidence: What specific information is the reasoning relying on? How was that information produced or selected? What does it actually show versus what the reasoner claims it shows?
- inference: How does the author move from the evidence to the conclusion? What is the logical step? Is the inference valid — does the conclusion actually follow, or does it overreach?
- consequences: If this reasoning is accepted and acted on, what follows? What are the implications the author acknowledges? What implications are unacknowledged or suppressed?

Core rules:

1. Never say "wrong." A weak answer stays on the same stage with a narrower question. action "ask_question", same stage, attemptNumber incremented.

2. Maximum 3 attempts per stage, then action "mark_incomplete." Warm, specific.

3. The ASSUMPTIONS and VIEWPOINT stages are the hardest. Do not accept:
   - Restating the argument's claims as assumptions
   - Naming a viewpoint without saying what it would change
   The learner must name an assumption that is genuinely unacknowledged, or name a perspective and say what it would see differently.

4. The INFERENCE stage is the bridge between evidence and conclusion — similar to Toulmin's warrant but at the level of logic rather than rhetoric. Narrow with: "Does that conclusion actually follow from the evidence, or is there a step missing?"

5. Bloom tier controls question depth — calibrate every question and judgment.

6. At consequences (final stage), complete_session requires a summaryText that names the full reasoning chain the learner made inspectable: what purpose, which assumptions were exposed, what inference was examined.

7. The anti-parroting signal fires when the learner restates the source text rather than reasoning about it. If it fires, do NOT advance.

8. Audit is metacognitive: the learner should be thinking ABOUT the reasoning, not just reproducing it. Answers that describe the concept instead of inspecting the reasoning machinery are weak — narrow with "That describes what the author says. What does it tell us about how the author is reasoning?"`;

const AUDIT_TOOL: Anthropic.Tool = {
  name: "submit_audit_action",
  description: "Submit the next action in this Paul-Elder Audit dialogue.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["ask_question", "complete_session", "mark_incomplete"] },
          stage: { type: "string", enum: AUDIT_STAGE_ORDER, description: "Required for ask_question." },
          attemptNumber: { type: "integer", minimum: 1, maximum: 3, description: "Required for ask_question." },
          questionText: { type: "string", description: "Required for ask_question." },
          introText: { type: ["string", "null"], description: "Non-null only when moving to a new stage." },
          summaryText: { type: "string", description: "Required for complete_session." },
          supportiveText: { type: "string", description: "Required for mark_incomplete." },
        },
      },
    },
  },
};

function formatAuditInput(
  concept: { label: string; sourceLocator: string; sourcePassage: string },
  currentStage: AuditStage,
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
Source passage (reference for the reasoning being audited): """${concept.sourcePassage}"""

${bloomTierDescription({ tier: bloomTier, protocol: "audit" })}

Current stage: ${currentStage}
Current attempt number: ${attemptNumber}

This session's turns so far:
${hist}

The learner's latest answer: """${latestAnswer ?? "(awaiting first answer)"}"""
${advisoryNote ? `\nSERVER SIGNAL: ${advisoryNote}` : ""}
Decide the next action now.`;
}

async function runAuditTurn(
  concept: { label: string; sourceLocator: string; sourcePassage: string },
  currentStage: AuditStage,
  attemptNumber: number,
  bloomTier: BloomTier,
  history: Array<{ stage: string; questionText: string; answerText: string | null }>,
  latestAnswer: string | null,
  advisoryNote?: string,
  correction?: string
): Promise<any> {
  const content = formatAuditInput(concept, currentStage, attemptNumber, bloomTier, history, latestAnswer, advisoryNote);
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: AUDIT_SYSTEM,
    tools: [AUDIT_TOOL],
    tool_choice: { type: "tool", name: "submit_audit_action" },
    messages: [{ role: "user", content: content + (correction ? `\n\nCORRECTION: ${correction}` : "") }],
  });
  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("The Audit engine did not return a structured action.");
  return (toolUse.input as any).action;
}

function validateAuditAction(action: any, currentStage: AuditStage, attemptNumber: number): string | null {
  const stageIndex = AUDIT_STAGE_ORDER.indexOf(currentStage);
  const isLastStage = stageIndex === AUDIT_STAGE_ORDER.length - 1;
  if (action.type === "ask_question") {
    const actionStageIndex = AUDIT_STAGE_ORDER.indexOf(action.stage);
    if (actionStageIndex < stageIndex) return `Cannot go back to stage "${action.stage}" from "${currentStage}".`;
    if (action.stage === currentStage && attemptNumber >= 3) return `Stage "${currentStage}" has reached max attempts. Use mark_incomplete.`;
    if (actionStageIndex > stageIndex + 1) return `Cannot skip stages. From "${currentStage}" the next must be "${AUDIT_STAGE_ORDER[stageIndex + 1]}".`;
  }
  if (action.type === "complete_session" && !isLastStage) return `complete_session only valid on the last stage (consequences), not "${currentStage}".`;
  return null;
}

function getTopicForAudit(topicId: number): { label: string; sourceLocator: string; sourcePassage: string } {
  const t = db.prepare("SELECT label, source_locator, source_passage FROM topics WHERE id = ?").get(topicId) as any;
  if (!t) throw new Error("Topic not found.");
  return { label: t.label, sourceLocator: t.source_locator ?? "location not specified", sourcePassage: t.source_passage ?? t.thesis ?? "" };
}

export async function startAuditSession(userId: number, topicId: number) {
  const progress = db.prepare("SELECT bloom_tier, status FROM topic_progress WHERE user_id = ? AND topic_id = ?").get(userId, topicId) as any;
  const bloomTier: BloomTier = (progress?.bloom_tier ?? 1) as BloomTier;

  if (bloomTier < 3) throw new Error("Complete the Argument session for this concept first to unlock the Audit.");

  const concept = getTopicForAudit(topicId);
  const firstStage: AuditStage = "purpose";
  const action = await runAuditTurn(concept, firstStage, 1, bloomTier, [], null);
  if (action.type !== "ask_question") throw new Error("Expected the Audit engine to open with a question.");

  const sessionInfo = db.prepare("INSERT INTO audit_sessions (user_id, topic_id, bloom_tier) VALUES (?, ?, ?)").run(userId, topicId, bloomTier);
  const sessionId = sessionInfo.lastInsertRowid as number;
  const turnInfo = db.prepare("INSERT INTO audit_turns (session_id, stage, attempt_number, question_text) VALUES (?, ?, 1, ?)").run(sessionId, firstStage, action.questionText);

  return { sessionId, turnId: turnInfo.lastInsertRowid as number, stage: firstStage, questionText: action.questionText, introText: action.introText ?? null, bloomTier };
}

export async function respondToAuditTurn(userId: number, sessionId: number, turnId: number, answerText: string) {
  const session = db.prepare("SELECT * FROM audit_sessions WHERE id = ? AND user_id = ?").get(sessionId, userId) as any;
  if (!session || session.status !== "in_progress") throw new Error("Session not found or already ended.");

  const turn = db.prepare("SELECT * FROM audit_turns WHERE id = ? AND session_id = ?").get(turnId, sessionId) as any;
  if (!turn || turn.answer_text !== null) throw new Error("Turn not found or already answered.");
  db.prepare("UPDATE audit_turns SET answer_text = ? WHERE id = ?").run(answerText, turnId);

  const concept = getTopicForAudit(session.topic_id);
  const history = (db.prepare("SELECT * FROM audit_turns WHERE session_id = ? ORDER BY id ASC").all(sessionId) as any[]).map((t) => ({
    stage: t.stage, questionText: t.question_text, answerText: t.answer_text,
  }));

  const parroting = isParroting(answerText, concept.sourcePassage);
  const advisoryNote = parroting ? "The answer overlaps the source material verbatim. Do not advance — ask for reasoning ABOUT the text, not reproduction of it." : undefined;

  let action = await runAuditTurn(concept, turn.stage as AuditStage, turn.attempt_number, session.bloom_tier as BloomTier, history, answerText, advisoryNote);
  let violation = validateAuditAction(action, turn.stage as AuditStage, turn.attempt_number);
  if (violation) {
    action = await runAuditTurn(concept, turn.stage as AuditStage, turn.attempt_number, session.bloom_tier as BloomTier, history, answerText, advisoryNote, violation);
    violation = validateAuditAction(action, turn.stage as AuditStage, turn.attempt_number);
    if (violation) action = { type: "mark_incomplete", supportiveText: "This audit is worth revisiting — the reasoning here has more layers worth uncovering." };
  }

  const verdict = action.type === "complete_session" ? "advance" : action.type === "mark_incomplete" ? "incomplete" : action.stage === turn.stage ? "narrow" : "advance";
  db.prepare("UPDATE audit_turns SET verdict = ? WHERE id = ?").run(verdict, turnId);

  if (action.type === "mark_incomplete") {
    db.prepare("UPDATE audit_sessions SET status = 'incomplete', ended_at = datetime('now') WHERE id = ?").run(sessionId);
    return { action: "incomplete" as const, supportiveText: action.supportiveText };
  }

  if (action.type === "complete_session") {
    db.prepare("UPDATE audit_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?").run(sessionId);
    const currentTier = session.bloom_tier as BloomTier;
    const newTier = advancedTier(currentTier, "audit");
    db.prepare(`INSERT INTO topic_progress (user_id, topic_id, bloom_tier, status, interval_days, streak)
      VALUES (?, ?, ?, 'mastered', 1, 0)
      ON CONFLICT(user_id, topic_id) DO UPDATE SET bloom_tier = excluded.bloom_tier`
    ).run(userId, session.topic_id, newTier);
    return { action: "complete" as const, summaryText: action.summaryText };
  }

  const nextTurnInfo = db.prepare("INSERT INTO audit_turns (session_id, stage, attempt_number, question_text) VALUES (?, ?, ?, ?)").run(
    sessionId, action.stage, action.attemptNumber, action.questionText
  );
  return { action: "continue" as const, turnId: nextTurnInfo.lastInsertRowid as number, stage: action.stage as AuditStage, questionText: action.questionText, introText: action.introText ?? null };
}
