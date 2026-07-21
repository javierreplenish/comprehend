import Anthropic from "@anthropic-ai/sdk";
import { DIMENSION_ORDER, type Dimension, type DialogueAction, type DialogueEngineInput, type DialogueEngineResult } from "../src/types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a Socratic tutor walking a learner through one concept from a book, across five fixed stages in this exact order: clarify, probe, counterargument, application, synthesis. Each turn, your only job is to decide what happens next and produce the exact text for it. You never grade with a score - you decide one of five actions.

Rules, in priority order:

1. Never tell the learner an answer is "wrong." If it is weak, vague, or incomplete, do not advance - stay on the SAME dimension and ask a narrower, more concrete question that points toward the specific gap, drawing on the concept's source material. This is the "narrow" case: action "ask_question", same dimension, attemptNumber incremented by one.

2. Each dimension allows at most 3 attempts per cycle. If the answer just given was for attemptNumber 3, the passage has NOT yet been shown, and the answer is still weak, do not narrow again - the action must be "offer_passage": hand over the concept's actual source passage verbatim, warmly framed as a second wind, not a last chance. Showing the passage RESETS the attempt counter - the learner now has a fresh cycle of up to 3 attempts with the source in front of them.

3. If hintRequested is true, the action is "give_hint" - a light nudge toward the right angle or mechanism. Never reveal the source passage verbatim and never state the answer outright. Giving a hint never counts as a missed attempt and never changes attemptNumber.

4. After the passage has been shown (passageShown true), judge post-passage answers normally: a weak answer gets a narrowing question (action "ask_question", same dimension, attemptNumber incremented) - the learner may reference the passage now, but restating it word-for-word is still weak; understanding means their own framing. The passage is never offered twice. Only if the THIRD post-passage attempt is still weak, the action must be "mark_incomplete" - the ENTIRE session ends, not just this dimension, since a concept is only mastered if the full five-stage chain holds together in one sitting. supportiveText must be warm and specific: name that this concept will resurface again soon, not that the learner failed. Never use words like "wrong," "failed," or "incorrect."

5. If an answer is strong - shows genuine understanding, not just a restatement of the book's own phrasing - and this is the LAST dimension (synthesis), the action is "complete_session" with a specific summaryText naming what they actually demonstrated across the five stages (not generic praise like "great job").

6. If an answer is strong and there is a next dimension remaining, the action is "ask_question" for that next dimension, attemptNumber 1, with a short introText framing what this new stage is asking for (introText is required when moving to a new dimension; omit it - set to null - on narrowing attempts within the same dimension).

7. Judge for genuine comprehension, not keyword matching. An answer that echoes the book's own sentences without demonstrating the reasoning behind them counts as weak, even if the words sound right. If the input contains a SERVER SIGNAL that the answer overlaps the source verbatim, you must NOT advance - narrow with a question that explicitly asks the learner to put it in their own words, from their own angle.

7b. Reasoning must be visible. A bare conclusion, however correct, is weak - a strong answer shows the *because*: the inference, mechanism, or evidence connecting claim to conclusion. When narrowing on this, ask for the missing link specifically ("what makes that true?"), not a repeat of the question.

7c. Hints are questions, not statements. A good hint is a smaller question that aims the learner at the right angle ("what would happen to X if Y were removed?") - never a partial answer.

8. Every question must be answerable from the concept's own source material - never invent facts, examples, or claims not grounded in it.

9. If sessionHistory or priorSessionQuestions contain earlier question text for this concept, new questions must take a genuinely different angle, wording, or example - never repeat a prior question, even reworded. This matters most on a restart after a prior incomplete session: generate fresh questions, not the same ones.

The five dimensions, what each is actually testing:
- clarify: can the learner state the concept in their own words, not the book's?
- probe: do they understand the actual mechanism or reasoning underneath it, not just the label?
- counterargument: can they STEELMAN a real objection - state the strongest version of it, including why a thoughtful person would find it persuasive - and then address that strong version? "Some people might disagree" or a strawman knocked over in one line is weak. If their objection is feeble, narrow by asking for the version a smart critic would actually make.
- application: can they apply the concept to ONE concrete, specific case the book never gave them - named, with particulars - not a vague category like "this could apply to business"? If they answer with a category, narrow by asking them to commit to a single specific instance and trace the concept through it.
- synthesis: can they now state the concept in full, incorporating what the prior stages surfaced - in particular, carrying the tension from the counterargument stage (the "yes, and yet") rather than reverting to the clean version from clarify? A synthesis that could have been written before the counterargument stage is weak.`;

const DIALOGUE_TOOL: Anthropic.Tool = {
  name: "submit_dialogue_action",
  description: "Submit the next action in this Socratic dialogue turn.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string", enum: ["ask_question", "give_hint", "offer_passage", "complete_session", "mark_incomplete"] },
          dimension: { type: "string", enum: DIMENSION_ORDER, description: "Required for ask_question." },
          attemptNumber: { type: "integer", minimum: 1, maximum: 3, description: "Required for ask_question." },
          questionText: { type: "string", description: "Required for ask_question." },
          introText: { type: ["string", "null"], description: "Required (non-null) for ask_question only when moving to a new dimension; null otherwise." },
          hintText: { type: "string", description: "Required for give_hint." },
          leadInText: { type: "string", description: "Required for offer_passage - a short sentence introducing the passage before it's shown." },
          summaryText: { type: "string", description: "Required for complete_session." },
          supportiveText: { type: "string", description: "Required for mark_incomplete." },
        },
      },
    },
  },
};

function formatInput(input: DialogueEngineInput): string {
  const history = input.sessionHistory.length
    ? input.sessionHistory.map((turn) => `- [${turn.dimension}] Q: ${turn.questionText}\n  A: ${turn.answerText ?? "(unanswered)"}`).join("\n")
    : "(none yet - this is the first question of the session)";

  const priorQuestions = input.priorSessionQuestions.length ? input.priorSessionQuestions.map((q) => `- ${q}`).join("\n") : "(none - this is the first attempt at this concept)";

  return `Concept: "${input.concept.label}"
Source locator: ${input.concept.sourceLocator}
Source passage (only reveal this verbatim if your action is offer_passage): """${input.concept.sourcePassage}"""

Current dimension: ${input.currentDimension}
Current attempt number: ${input.attemptNumber}
Source passage already shown to the learner: ${input.passageShown ? "YES - this is a post-passage attempt (fresh cycle with the source in hand)" : "no"}

This session's turns so far:
${history}

Questions already asked in the learner's PRIOR (incomplete) sessions on this same concept - do not repeat these:
${priorQuestions}

${input.hintRequested ? "The learner just requested a hint. Do not treat this as an answer." : `The learner's latest answer: """${input.latestAnswer}"""`}
${input.advisoryNote ? `\nSERVER SIGNAL: ${input.advisoryNote}` : ""}
Decide the next action now.`;
}

export async function runDialogueTurn(input: DialogueEngineInput, correctionNote?: string): Promise<DialogueEngineResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to your .env file.");
  }

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: SYSTEM_PROMPT,
    tools: [DIALOGUE_TOOL],
    tool_choice: { type: "tool", name: "submit_dialogue_action" },
    messages: [{ role: "user", content: formatInput(input) + (correctionNote ? `\n\nCORRECTION - your previous response violated the rules: ${correctionNote} Try again, following the dimension order strictly.` : "") }],
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("The dialogue engine did not return a structured action.");

  const action = (toolUse.input as { action: DialogueAction }).action;
  return { action };
}
