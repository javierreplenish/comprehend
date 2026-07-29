import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { isParroting } from "./textOverlap";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.DIALOGUE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// ── Connections: cross-topic transfer challenges ──
// Mastering ideas one at a time is comprehension. Relating them - seeing
// where one idea constrains, contradicts, or completes another - is the
// deeper skill this product exists for. Once a learner has mastered topics
// in two different chapters of a book, they can take a Connection: one
// question that forces them to articulate the specific relationship between
// two of their mastered ideas. Three attempts, same supportive ladder as
// the main engine, no scheduling impact - this is pure stretch.

const BRIDGE_SYSTEM = `You run a "Connection" challenge: the learner has separately mastered two ideas from the same book, and your job is to make them think the two ideas TOGETHER. There are two tasks you may be asked to do:

TASK: generate_question — Produce ONE question that can only be answered well by relating the two ideas. Aim it at the most intellectually productive relationship between them: a genuine tension (where taking idea A seriously complicates idea B), a dependency (where B only works if A holds), or a shared mechanism seen from two angles. Never ask for two summaries side by side, and never ask a question answerable from one idea alone. The question should be concrete and pointed, not "how do these relate?"

TASK: judge_answer — Decide whether the learner's answer genuinely articulates the relationship. Strong means: they name the SPECIFIC relationship (not "they're connected" or "both are about power"), and they reason through it - the answer shows why the relationship holds, with the *because* visible. An answer that describes each idea accurately but never actually relates them is weak. An answer that asserts a relationship without reasoning is weak.
- If strong: verdict "advance", with a short specific summary of the relationship they articulated (name what they saw, not generic praise).
- If weak and attempts remain: verdict "narrow", with a follow-up question that points at the specific gap - what did they leave unrelated, or what claim needs a reason? Never say "wrong"; never answer for them.
- If weak on the third attempt: verdict "incomplete", with warm supportive text that names one thread worth pulling on next time (without giving the answer away). Never use words like "wrong" or "failed".

Ground every question and judgment ONLY in the two ideas' provided material. Never invent claims from the book.`;

const BRIDGE_TOOL: Anthropic.Tool = {
  name: "submit_bridge_action",
  description: "Submit the connection question or the judgment of the learner's answer.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["ask_question", "advance", "narrow", "incomplete"] },
          questionText: { type: "string", description: "Required for ask_question and narrow." },
          summaryText: { type: "string", description: "Required for advance." },
          supportiveText: { type: "string", description: "Required for incomplete." },
        },
      },
    },
  },
};

interface BridgeTopic { id: number; label: string; thesis: string; chapterTitle: string; }

function topicWithChapter(topicId: number): BridgeTopic {
  const row = db.prepare(
    `SELECT t.id, t.label, t.thesis, c.title as chapterTitle FROM topics t JOIN chapters c ON c.id = t.chapter_id WHERE t.id = ?`
  ).get(topicId) as BridgeTopic | undefined;
  if (!row) throw new Error("Topic not found.");
  return row;
}

function formatPair(a: BridgeTopic, b: BridgeTopic): string {
  return `IDEA A — "${a.label}" (from chapter "${a.chapterTitle}")
Thesis: """${a.thesis}"""

IDEA B — "${b.label}" (from chapter "${b.chapterTitle}")
Thesis: """${b.thesis}"""`;
}

async function callBridge(content: string): Promise<any> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: BRIDGE_SYSTEM,
    tools: [BRIDGE_TOOL],
    tool_choice: { type: "tool", name: "submit_bridge_action" },
    messages: [{ role: "user", content }],
  });
  const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new Error("The connection engine did not return a structured action.");
  return (toolUse.input as any).action;
}

/**
 * A learner is eligible when they've mastered topics in at least two
 * different chapters of this book. Pairs that already produced a completed
 * bridge are excluded, so each Connection is fresh.
 */
export function findEligiblePair(userId: number, bookId: number): { a: number; b: number } | null {
  const mastered = db.prepare(
    `SELECT t.id, t.chapter_id FROM topics t
     JOIN chapters c ON c.id = t.chapter_id
     JOIN topic_progress tp ON tp.topic_id = t.id AND tp.user_id = ?
     WHERE c.book_id = ? AND tp.status = 'mastered'
     ORDER BY RANDOM()`
  ).all(userId, bookId) as Array<{ id: number; chapter_id: number }>;
  if (mastered.length < 2) return null;

  const used = new Set(
    (db.prepare(
      `SELECT topic_a_id, topic_b_id FROM bridge_sessions WHERE user_id = ? AND book_id = ? AND status = 'completed'`
    ).all(userId, bookId) as Array<{ topic_a_id: number; topic_b_id: number }>).map((r) => [Math.min(r.topic_a_id, r.topic_b_id), Math.max(r.topic_a_id, r.topic_b_id)].join(":"))
  );

  // Prefer cross-chapter pairs; fall back to same-chapter only if that's all there is.
  for (const crossChapterOnly of [true, false]) {
    for (let i = 0; i < mastered.length; i++) {
      for (let j = i + 1; j < mastered.length; j++) {
        if (crossChapterOnly && mastered[i].chapter_id === mastered[j].chapter_id) continue;
        const key = [Math.min(mastered[i].id, mastered[j].id), Math.max(mastered[i].id, mastered[j].id)].join(":");
        if (!used.has(key)) return { a: mastered[i].id, b: mastered[j].id };
      }
    }
  }
  return null;
}

export function bridgeEligibility(userId: number, bookId: number): { eligible: boolean } {
  return { eligible: findEligiblePair(userId, bookId) !== null };
}

export async function startBridge(userId: number, bookId: number) {
  // Resume an in-progress bridge instead of stacking new ones.
  const existing = db.prepare(
    `SELECT id FROM bridge_sessions WHERE user_id = ? AND book_id = ? AND status = 'in_progress' ORDER BY id DESC LIMIT 1`
  ).get(userId, bookId) as { id: number } | undefined;
  if (existing) {
    const turn = db.prepare("SELECT * FROM bridge_turns WHERE bridge_id = ? ORDER BY id DESC LIMIT 1").get(existing.id) as any;
    const s = db.prepare("SELECT topic_a_id, topic_b_id FROM bridge_sessions WHERE id = ?").get(existing.id) as any;
    const a = topicWithChapter(s.topic_a_id);
    const b = topicWithChapter(s.topic_b_id);
    return { bridgeId: existing.id, turnId: turn.id, attemptNumber: turn.attempt_number, questionText: turn.question_text, topicA: a.label, topicB: b.label };
  }

  const pair = findEligiblePair(userId, bookId);
  if (!pair) throw new Error("Master topics in two different chapters first, then come back to connect them.");
  const a = topicWithChapter(pair.a);
  const b = topicWithChapter(pair.b);

  const action = await callBridge(`TASK: generate_question\n\n${formatPair(a, b)}\n\nGenerate the connection question now.`);
  if (action.type !== "ask_question" || !action.questionText) throw new Error("The connection engine did not produce a question.");

  const bridgeInfo = db.prepare("INSERT INTO bridge_sessions (user_id, book_id, topic_a_id, topic_b_id) VALUES (?, ?, ?, ?)").run(userId, bookId, pair.a, pair.b);
  const bridgeId = bridgeInfo.lastInsertRowid as number;
  const turnInfo = db.prepare("INSERT INTO bridge_turns (bridge_id, attempt_number, question_text) VALUES (?, 1, ?)").run(bridgeId, action.questionText);

  return { bridgeId, turnId: turnInfo.lastInsertRowid as number, attemptNumber: 1, questionText: action.questionText, topicA: a.label, topicB: b.label };
}

export async function respondToBridge(userId: number, bridgeId: number, answerText: string) {
  const bridge = db.prepare("SELECT * FROM bridge_sessions WHERE id = ? AND user_id = ?").get(bridgeId, userId) as any;
  if (!bridge) throw new Error("Connection not found.");
  if (bridge.status !== "in_progress") throw new Error("This connection has already ended.");

  const turn = db.prepare("SELECT * FROM bridge_turns WHERE bridge_id = ? ORDER BY id DESC LIMIT 1").get(bridgeId) as any;
  db.prepare("UPDATE bridge_turns SET answer_text = ? WHERE id = ?").run(answerText, turn.id);

  const a = topicWithChapter(bridge.topic_a_id);
  const b = topicWithChapter(bridge.topic_b_id);
  const history = (db.prepare("SELECT * FROM bridge_turns WHERE bridge_id = ? ORDER BY id ASC").all(bridgeId) as any[])
    .map((t) => `- Attempt ${t.attempt_number} Q: ${t.question_text}\n  A: ${t.answer_text ?? "(unanswered)"}`).join("\n");

  // Anti-parroting applies here too: relating two ideas in the book's own
  // words is still not the learner's thinking.
  const parroting = isParroting(answerText, `${a.thesis}\n${b.thesis}`);

  let action = await callBridge(
    `TASK: judge_answer\n\n${formatPair(a, b)}\n\nThis is attempt ${turn.attempt_number} of 3.\n\nAll attempts so far:\n${history}\n\nThe learner's latest answer: """${answerText}"""${parroting ? `\n\nSERVER SIGNAL: the answer overlaps the source material verbatim to a substantial degree. Do not advance - narrow, asking for their own words.` : ""}\n\nJudge it now.`
  );
  // Structural guards, same philosophy as the main engine.
  if (action.type === "advance" && parroting) {
    action = { type: turn.attempt_number >= 3 ? "incomplete" : "narrow", questionText: "That's very close to the book's own wording. How would you explain the relationship between these two ideas to someone who hasn't read it — in your words?", supportiveText: "This pair is worth another look — try putting the relationship entirely in your own words next time." };
  }
  if (action.type === "narrow" && turn.attempt_number >= 3) {
    action = { type: "incomplete", supportiveText: action.questionText ? `Worth coming back to. A thread to pull on: ${action.questionText}` : "Worth coming back to — these two ideas have more between them than surfaced today." };
  }

  if (action.type === "advance") {
    db.prepare("UPDATE bridge_turns SET verdict = 'advance' WHERE id = ?").run(turn.id);
    db.prepare("UPDATE bridge_sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?").run(bridgeId);
    return { action: "complete" as const, summaryText: action.summaryText ?? "You articulated the relationship between these two ideas." };
  }
  if (action.type === "narrow") {
    db.prepare("UPDATE bridge_turns SET verdict = 'narrow' WHERE id = ?").run(turn.id);
    const info = db.prepare("INSERT INTO bridge_turns (bridge_id, attempt_number, question_text) VALUES (?, ?, ?)").run(bridgeId, turn.attempt_number + 1, action.questionText ?? "Say more — what specifically ties these together?");
    return { action: "narrow" as const, turnId: info.lastInsertRowid as number, attemptNumber: turn.attempt_number + 1, questionText: action.questionText ?? "Say more — what specifically ties these together?" };
  }
  // incomplete
  db.prepare("UPDATE bridge_turns SET verdict = 'incomplete' WHERE id = ?").run(turn.id);
  db.prepare("UPDATE bridge_sessions SET status = 'incomplete', ended_at = datetime('now') WHERE id = ?").run(bridgeId);
  return { action: "incomplete" as const, supportiveText: action.supportiveText ?? "Worth coming back to — these two ideas have more between them than surfaced today." };
}
