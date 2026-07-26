import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.DIALOGUE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-fable-5";

const SYSTEM_PROMPT = `You read a chapter's worth of flashcards - individual question-and-answer fragments a study deck was built from - and surface the actual ideas the author is arguing across them. Flashcards are fragments; your job is synthesis, not summarization of each one.

Rules:
1. Identify the real, distinct arguments or ideas running through this chapter - not one topic per flashcard, and not so broad that the whole chapter becomes one topic. A chapter with 40-60 flashcards usually yields somewhere around 6-10 genuine topics; use your judgment on the actual content, not a fixed count.
2. Every topic must be grounded in at least two of the provided flashcards. Never invent a topic that isn't actually built from the given material, and never state a fact, example, or claim that isn't present in the flashcards you were given.
3. For each topic, write:
   - A short, specific label naming the actual idea (not a vague category like "power" - something like "Force as a last resort behind subtler controls").
   - A thesis: 2-4 sentences in your own words synthesizing what the author argues about this, drawing across the flashcards that ground it - not just restating one flashcard's answer.
   - The list of source flashcard ids (by the numbers given to you) that this topic is built from.
4. Order the topics in a sensible reading progression matching how the chapter likely builds its argument, not alphabetically or randomly.
5. Do not create a topic that only restates a single flashcard verbatim - if you can't find at least two related flashcards supporting an idea, it's not substantial enough to be its own topic; fold it into a related one or leave it out.`;

const SYNTHESIS_TOOL: Anthropic.Tool = {
  name: "submit_topics",
  description: "Submit the synthesized list of topics for this chapter.",
  input_schema: {
    type: "object",
    required: ["topics"],
    properties: {
      topics: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "thesis", "sourceCardIds"],
          properties: {
            label: { type: "string" },
            thesis: { type: "string" },
            sourceCardIds: { type: "array", items: { type: "integer" }, minItems: 2 },
          },
        },
      },
    },
  },
};

export interface SynthesisInputCard {
  id: number;
  topic: string;
  question: string;
  answer: string;
  sourcePages: string;
}

export interface SynthesizedTopic {
  label: string;
  thesis: string;
  sourceCardIds: number[];
}

export async function synthesizeChapterTopics(chapterTitle: string, cards: SynthesisInputCard[]): Promise<SynthesizedTopic[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server. Add it to your .env file.");
  }
  if (cards.length === 0) return [];

  const cardList = cards.map((card) => `[${card.id}] (pp. ${card.sourcePages}) ${card.topic}\nQ: ${card.question}\nA: ${card.answer}`).join("\n\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    tools: [SYNTHESIS_TOOL],
    tool_choice: { type: "tool", name: "submit_topics" },
    messages: [{ role: "user", content: `Chapter: "${chapterTitle}"\n\nFlashcards (${cards.length} total):\n\n${cardList}\n\nSynthesize this chapter's actual topics now.` }],
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("The synthesis engine did not return structured topics.");

  const result = (toolUse.input as { topics: SynthesizedTopic[] }).topics;

  // Defensive: drop any topic the model grounded in fewer than 2 real cards,
  // or in card ids that don't actually exist in what we gave it - never
  // trust the model's citations without checking them against the real input.
  const validIds = new Set(cards.map((c) => c.id));
  return result.filter((topic) => {
    const realIds = topic.sourceCardIds.filter((id) => validIds.has(id));
    return realIds.length >= 2;
  });
}
