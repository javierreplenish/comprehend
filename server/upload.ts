import Anthropic from "@anthropic-ai/sdk";
import { PDFParse } from "pdf-parse";
import { db } from "./db";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

const STRUCTURE_PROMPT = `You read the raw text extracted from a book (or a section of one) and produce a structured breakdown of its chapters and key concepts as study flashcards. This is NOT a summary — it's a study-deck extraction, like Quizlet.

Rules:
1. Identify chapter or section boundaries from the text. Use explicit headings if present; infer logical breaks if not. For a short article or essay with no chapters, treat the whole thing as one chapter.
2. For each chapter, extract the key concepts worth studying — the actual ideas, arguments, and claims the author makes, not trivial details. Each concept needs:
   - A short, specific label naming the idea (not vague like "introduction" — specific like "Force as a last resort behind subtler controls")
   - A study question that tests understanding of this concept (not "what is X" — something that requires thinking, like "Why does the author argue that force alone is insufficient for social control?")
   - The actual passage from the text that answers this question (verbatim from the source, not paraphrased — the learner needs to see the real words)
   - A page reference if detectable from the text, otherwise "location not specified"
3. Aim for roughly 3-8 concepts per chapter depending on density. A short chapter might have 3; a dense one might have 8. Never fewer than 2 if the text has any substance at all.
4. Order concepts within each chapter to match the reading progression, not alphabetically.
5. Never invent content not present in the provided text.`;

const STRUCTURE_TOOL: Anthropic.Tool = {
  name: "submit_book_structure",
  description: "Submit the extracted chapter and concept structure with Q&A flashcards.",
  input_schema: {
    type: "object",
    required: ["title", "author", "chapters"],
    properties: {
      title: { type: "string" },
      author: { type: ["string", "null"] },
      chapters: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "concepts"],
          properties: {
            title: { type: "string" },
            concepts: {
              type: "array",
              items: {
                type: "object",
                required: ["label", "question", "sourcePassage", "sourceLocator"],
                properties: {
                  label: { type: "string" },
                  question: { type: "string", description: "A study question that tests understanding of this concept." },
                  sourcePassage: { type: "string" },
                  sourceLocator: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}

export interface ProcessedBook {
  bookId: number;
  title: string;
  author: string | null;
  chapterCount: number;
  conceptCount: number;
}

export async function processUploadedText(userId: number, rawText: string, originalFilename: string): Promise<ProcessedBook> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");
  }

  const truncated = rawText.length > 80000 ? rawText.slice(0, 80000) + "\n\n[Text truncated for processing]" : rawText;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: STRUCTURE_PROMPT,
    tools: [STRUCTURE_TOOL],
    tool_choice: { type: "tool", name: "submit_book_structure" },
    messages: [{ role: "user", content: `Here is the full text extracted from "${originalFilename}". Read it and extract the chapter structure and key concepts:\n\n${truncated}` }],
  });

  const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
  if (!toolUse) throw new Error("The processing engine did not return a structured result.");

  const result = toolUse.input as {
    title: string;
    author: string | null;
    chapters: Array<{ title: string; concepts: Array<{ label: string; question: string; sourcePassage: string; sourceLocator: string }> }>;
  };

  const insertBook = db.prepare("INSERT INTO books (title, author, status, uploaded_by_user_id) VALUES (?, ?, 'ready', ?)");
  const insertChapter = db.prepare("INSERT INTO chapters (book_id, number, title, summary, order_index) VALUES (?, ?, ?, ?, ?)");
  const insertConcept = db.prepare("INSERT INTO concepts (chapter_id, label, question, source_locator, source_passage, order_index) VALUES (?, ?, ?, ?, ?, ?)");

  let totalConcepts = 0;

  const persist = db.transaction(() => {
    const bookInfo = insertBook.run(result.title || originalFilename, result.author, userId);
    const bookId = bookInfo.lastInsertRowid as number;

    result.chapters.forEach((chapter, chapterIndex) => {
      const conceptCount = chapter.concepts.length;
      const summary = `${conceptCount} concept${conceptCount === 1 ? "" : "s"}`;
      const chapterInfo = insertChapter.run(bookId, chapterIndex + 1, chapter.title, summary, chapterIndex);
      const chapterId = chapterInfo.lastInsertRowid as number;

      chapter.concepts.forEach((concept, conceptIndex) => {
        insertConcept.run(chapterId, concept.label, concept.question || "", concept.sourceLocator, concept.sourcePassage, conceptIndex);
        totalConcepts++;
      });
    });

    return bookId;
  });

  const bookId = persist();

  return { bookId, title: result.title || originalFilename, author: result.author, chapterCount: result.chapters.length, conceptCount: totalConcepts };
}
