import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { EPUB_CHAPTER_MARKER } from "./upload";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// ── Chunked upload processing ──
// The old pipeline sent the first 80k characters of a book in ONE call and
// silently threw the rest away. This one splits the full text into chunks on
// natural boundaries, processes them sequentially in a background job, and
// persists chapters/flashcards incrementally - so a 400-page book is fully
// processed, the Library can show real progress ("chunk 4 of 12"), and a
// server restart mid-job resumes instead of losing the upload.

const CHUNK_TARGET = 28_000; // chars per AI call - well under the old 80k ceiling, keeps each call fast
const CHUNK_MAX = 34_000;    // hard cap if no clean boundary is found near the target

const STRUCTURE_PROMPT = `You read raw text extracted from a book (or a section of one) and produce a structured breakdown of its chapters and key concepts as study flashcards. This is NOT a summary — it's a study-deck extraction, like Quizlet.

Rules:
1. Identify chapter or section boundaries from the text. Use explicit headings if present; infer logical breaks if not. Lines reading "=== CHAPTER BREAK ===" are authoritative chapter boundaries from the source file — always split there. For a short article or essay with no chapters, treat the whole thing as one chapter.
2. For each chapter, extract the key concepts worth studying — the actual ideas, arguments, and claims the author makes, not trivial details. Each concept needs:
   - A short, specific label naming the idea (not vague like "introduction" — specific like "Force as a last resort behind subtler controls")
   - A study question that tests understanding of this concept (not "what is X" — something that requires thinking, like "Why does the author argue that force alone is insufficient for social control?"). ONE sentence only.
   - The passage from the text that answers this question — verbatim from the source, not paraphrased, and the SHORTEST excerpt that fully answers it: one to three sentences, roughly 50 words. Never paste a whole paragraph; trim to the sentences that carry the answer.
   - A page reference if detectable from the text, otherwise "location not specified"
3. Extract AT LEAST 5 concepts per chapter — if a chapter seems to have fewer, look harder: supporting arguments, key distinctions, and implications all count as concepts. Only a truly minimal fragment of text may yield 4. There is NO upper limit: a dense chapter should yield every concept it genuinely contains (10 or more is common in rich chapters). Never pad with trivia just to hit a count — the depth of the text decides.
4. Order concepts within each chapter to match the reading progression, not alphabetically.
5. Never invent content not present in the provided text.
6. You may be given one SECTION of a longer book, along with the titles of chapters already extracted from earlier sections. If the beginning of this section clearly continues a chapter already in progress (it starts mid-argument or mid-paragraph, with no new heading), title your first chapter EXACTLY the single word CONTINUATION — its concepts will be appended to the preceding chapter automatically. Never re-extract concepts already covered by earlier chapter titles; only extract from the text in front of you.`;

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

interface ChunkResult {
  title: string;
  author: string | null;
  chapters: Array<{ title: string; concepts: Array<{ label: string; question: string; sourcePassage: string; sourceLocator: string }> }>;
}

// The model is TOLD the schema, but at ~55 calls per long book it will
// occasionally return chapters as an object map, a nested wrapper, or with
// missing fields. Never trust the shape - coerce what's coercible, reject
// the rest, and let the caller retry with a correction.
function normalizeChunkResult(input: any): ChunkResult | null {
  if (!input || typeof input !== "object") return null;
  let chapters: any = input.chapters;
  if (chapters && !Array.isArray(chapters) && typeof chapters === "object") {
    chapters = Object.values(chapters);
  }
  if (!Array.isArray(chapters)) return null;
  const cleaned = chapters
    .filter((ch: any) => ch && typeof ch === "object" && typeof ch.title === "string" && ch.title.trim())
    .map((ch: any) => ({
      title: ch.title.trim(),
      concepts: Array.isArray(ch.concepts)
        ? ch.concepts
            .filter((c: any) => c && typeof c === "object" && typeof c.label === "string" && c.label.trim())
            .map((c: any) => ({
              label: String(c.label),
              question: typeof c.question === "string" ? c.question : "",
              sourcePassage: typeof c.sourcePassage === "string" ? c.sourcePassage : "",
              sourceLocator: typeof c.sourceLocator === "string" ? c.sourceLocator : "location not specified",
            }))
        : [],
    }))
    .filter((ch: any) => ch.concepts.length > 0);
  if (cleaned.length === 0) return null;
  return {
    title: typeof input.title === "string" ? input.title : "",
    author: typeof input.author === "string" && input.author.trim() ? input.author : null,
    chapters: cleaned,
  };
}

// Split on natural boundaries: prefer EPUB chapter markers, then blank lines,
// then single newlines, then a hard cut. Deterministic - resuming a job
// recomputes identical chunks from the stored raw text.
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= CHUNK_MAX) {
      chunks.push(remaining);
      break;
    }
    const window = remaining.slice(0, CHUNK_MAX);
    let cut = -1;
    const marker = window.lastIndexOf(EPUB_CHAPTER_MARKER);
    if (marker > CHUNK_TARGET * 0.5) cut = marker; // split BEFORE the marker so the next chunk starts at the chapter head
    if (cut === -1) {
      const para = window.lastIndexOf("\n\n", CHUNK_TARGET + 3000);
      if (para > CHUNK_TARGET * 0.5) cut = para;
    }
    if (cut === -1) {
      const line = window.lastIndexOf("\n", CHUNK_TARGET + 3000);
      if (line > CHUNK_TARGET * 0.5) cut = line;
    }
    if (cut === -1) cut = CHUNK_TARGET;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\s+/, "");
  }
  return chunks.filter((c) => c.trim().length > 0);
}

async function structureChunk(chunkText: string, chunkIndex: number, chunksTotal: number, filename: string, priorChapterTitles: string[]): Promise<ChunkResult> {
  const contextNote = chunksTotal === 1
    ? `Here is the full text extracted from "${filename}".`
    : `Here is SECTION ${chunkIndex + 1} of ${chunksTotal} of the text extracted from "${filename}".` +
      (priorChapterTitles.length > 0
        ? ` Chapters already extracted from earlier sections, in order: ${priorChapterTitles.map((t) => `"${t}"`).join(", ")}. The most recent is "${priorChapterTitles[priorChapterTitles.length - 1]}".`
        : "");

  const ask = async (correction?: string): Promise<ChunkResult | null> => {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: STRUCTURE_PROMPT,
      tools: [STRUCTURE_TOOL],
      tool_choice: { type: "tool", name: "submit_book_structure" },
      messages: [{ role: "user", content: `${contextNote} Read it and extract the chapter structure and key concepts:\n\n${chunkText}${correction ? `\n\nCORRECTION - your previous response was malformed: ${correction} Return chapters as a JSON ARRAY of objects, each with a title string and a concepts array.` : ""}` }],
    });
    const toolUse = message.content.find((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    if (!toolUse) return null;
    return normalizeChunkResult(toolUse.input);
  };

  let result = await ask();
  if (!result) {
    console.warn(`Chunk ${chunkIndex + 1}/${chunksTotal}: malformed structure returned, retrying once with correction.`);
    result = await ask("chapters was not a usable array of chapter objects.");
  }
  if (!result) throw new Error(`The processing engine returned a malformed structure for section ${chunkIndex + 1} of ${chunksTotal}, twice. Try uploading again.`);
  return result;
}

// Persist one chunk's chapters/concepts. If the chunk's first chapter shares
// a title with the book's most recent chapter, its concepts are appended to
// that chapter (a chapter split across a chunk boundary) instead of creating
// a duplicate.
function persistChunk(bookId: number, result: ChunkResult): void {
  const insertChapter = db.prepare("INSERT INTO chapters (book_id, number, title, summary, order_index) VALUES (?, ?, ?, ?, ?)");
  const insertConcept = db.prepare("INSERT INTO concepts (chapter_id, label, question, source_locator, source_passage, order_index) VALUES (?, ?, ?, ?, ?, ?)");
  const updateSummary = db.prepare("UPDATE chapters SET summary = ? WHERE id = ?");

  db.transaction(() => {
    for (const [i, chapter] of result.chapters.entries()) {
      const last = db.prepare(
        "SELECT id, title, order_index FROM chapters WHERE book_id = ? ORDER BY order_index DESC LIMIT 1"
      ).get(bookId) as { id: number; title: string; order_index: number } | undefined;

      let chapterId: number;
      let baseOrder = 0;
      const isContinuation = normalizeTitle(chapter.title) === "continuation" || (i === 0 && last && normalizeTitle(last.title) === normalizeTitle(chapter.title));
      if (isContinuation && last) {
        chapterId = last.id;
        baseOrder = (db.prepare("SELECT COUNT(*) as n FROM concepts WHERE chapter_id = ?").get(chapterId) as { n: number }).n;
      } else {
        const nextOrder = last ? last.order_index + 1 : 0;
        const info = insertChapter.run(bookId, nextOrder + 1, chapter.title, "", nextOrder);
        chapterId = info.lastInsertRowid as number;
      }

      chapter.concepts.forEach((concept, ci) => {
        insertConcept.run(chapterId, concept.label, concept.question || "", concept.sourceLocator, concept.sourcePassage, baseOrder + ci);
      });

      const total = (db.prepare("SELECT COUNT(*) as n FROM concepts WHERE chapter_id = ?").get(chapterId) as { n: number }).n;
      updateSummary.run(`${total} concept${total === 1 ? "" : "s"}`, chapterId);
    }
  })();
}

function normalizeTitle(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Job queue: strictly sequential, in-process ──
// One job at a time keeps API usage predictable on a single Render Starter
// instance. The queue holds job IDs; all durable state lives in SQLite, so
// this array being lost on restart costs nothing - resumeInterruptedJobs()
// rebuilds it from the processing_jobs table on boot.
const queue: number[] = [];
let running = false;

export function startProcessingJob(userId: number, rawText: string, originalFilename: string): { bookId: number; jobId: number; chunksTotal: number } {
  const chunks = chunkText(rawText);
  const provisionalTitle = originalFilename.replace(/\.(pdf|epub|docx|txt|md)$/i, "");

  const bookInfo = db.prepare("INSERT INTO books (title, author, status, uploaded_by_user_id) VALUES (?, NULL, 'processing', ?)").run(provisionalTitle, userId);
  const bookId = bookInfo.lastInsertRowid as number;

  const jobInfo = db.prepare(
    "INSERT INTO processing_jobs (book_id, user_id, status, raw_text, original_filename, chunks_total) VALUES (?, ?, 'queued', ?, ?, ?)"
  ).run(bookId, userId, rawText, originalFilename, chunks.length);
  const jobId = jobInfo.lastInsertRowid as number;

  enqueue(jobId);
  return { bookId, jobId, chunksTotal: chunks.length };
}

export const IMAGE_MIMETYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 4_500_000; // Claude API caps images at 5MB - leave headroom for base64

// Screenshots: create the book + job with each image stored as a blob. The
// background job transcribes them via Claude vision (no OCR library - vision
// handles book pages, columns, and footnotes far better), assembles the text,
// then flows into the same chunked structuring pipeline as every other upload.
export function startImageProcessingJob(userId: number, images: Array<{ buffer: Buffer; mimetype: string }>, uploadLabel: string): { bookId: number; jobId: number; chunksTotal: number } {
  if (images.length === 0) throw new Error("No images were uploaded.");
  if (images.length > MAX_IMAGES) throw new Error(`Too many images - upload up to ${MAX_IMAGES} screenshots at a time.`);
  for (const img of images) {
    if (!IMAGE_MIMETYPES.has(img.mimetype)) {
      throw new Error(
        img.mimetype === "image/heic" || img.mimetype === "image/heif"
          ? "HEIC images aren't supported - convert to JPG or PNG first (on iPhone: Settings → Camera → Formats → Most Compatible)."
          : `Unsupported image type (${img.mimetype}). Use JPG, PNG, GIF, or WebP.`
      );
    }
    if (img.buffer.length > MAX_IMAGE_BYTES) throw new Error("One of the images is over 4.5MB - screenshots that large usually mean a photo, not a screen capture. Try re-capturing or compressing it.");
  }

  const bookInfo = db.prepare("INSERT INTO books (title, author, status, uploaded_by_user_id) VALUES (?, NULL, 'processing', ?)").run(uploadLabel, userId);
  const bookId = bookInfo.lastInsertRowid as number;

  // chunks_total starts as the image count; once transcription finishes we
  // know the text size and add the structuring chunk count on top, so the
  // progress bar covers both phases without ever moving backwards.
  const jobInfo = db.prepare(
    "INSERT INTO processing_jobs (book_id, user_id, status, raw_text, original_filename, chunks_total) VALUES (?, ?, 'queued', '', ?, ?)"
  ).run(bookId, userId, uploadLabel, images.length);
  const jobId = jobInfo.lastInsertRowid as number;

  const insertImage = db.prepare("INSERT INTO job_images (job_id, order_index, mimetype, data) VALUES (?, ?, ?, ?)");
  const persistImages = db.transaction(() => {
    images.forEach((img, i) => insertImage.run(jobId, i, img.mimetype, img.buffer));
  });
  persistImages();

  enqueue(jobId);
  return { bookId, jobId, chunksTotal: images.length };
}

async function transcribeImage(mimetype: string, data: Buffer, pageNumber: number, totalPages: number): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: "You transcribe text from screenshots of book pages, articles, and documents. Output ONLY the transcribed text, verbatim and complete, in reading order. Preserve paragraph breaks and headings. Skip page numbers, running headers/footers, and UI chrome (status bars, browser frames). If the image contains no readable text, output exactly: [no readable text]",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimetype as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: data.toString("base64") } },
        { type: "text", text: `Transcribe this image (${pageNumber} of ${totalPages} in the upload).` },
      ],
    }],
  });
  const text = message.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
  return text.trim() === "[no readable text]" ? "" : text;
}

function enqueue(jobId: number): void {
  queue.push(jobId);
  if (!running) void drainQueue();
}

async function drainQueue(): Promise<void> {
  running = true;
  while (queue.length > 0) {
    const jobId = queue.shift()!;
    try {
      await runJob(jobId);
    } catch (error) {
      console.error(`Processing job ${jobId} failed:`, error);
      const message = error instanceof Error ? error.message : "Processing failed.";
      db.prepare("UPDATE processing_jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?").run(message, jobId);
      const job = db.prepare("SELECT book_id FROM processing_jobs WHERE id = ?").get(jobId) as { book_id: number } | undefined;
      if (job) db.prepare("UPDATE books SET status = 'failed' WHERE id = ?").run(job.book_id);
    }
  }
  running = false;
}

async function runJob(jobId: number): Promise<void> {
  let job = db.prepare("SELECT * FROM processing_jobs WHERE id = ?").get(jobId) as any;
  if (!job || job.status === "done" || job.status === "failed") return;
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Add it to your .env file.");

  db.prepare("UPDATE processing_jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?").run(jobId);

  // ── Phase A (image jobs only): transcribe untranscribed screenshots ──
  const imageCount = (db.prepare("SELECT COUNT(*) as n FROM job_images WHERE job_id = ?").get(jobId) as { n: number }).n;
  if (imageCount > 0 && !job.raw_text) {
    const pending = db.prepare("SELECT id, order_index, mimetype, data FROM job_images WHERE job_id = ? AND transcription IS NULL ORDER BY order_index").all(jobId) as Array<{ id: number; order_index: number; mimetype: string; data: Buffer }>;
    for (const img of pending) {
      const startedAt = Date.now();
      const text = await transcribeImage(img.mimetype, img.data, img.order_index + 1, imageCount);
      // Store the transcription and blank the blob in one step - resume-safe
      // and the DB stops carrying the image bytes the moment they're read.
      db.prepare("UPDATE job_images SET transcription = ?, data = NULL WHERE id = ?").run(text, img.id);
      const done = (db.prepare("SELECT COUNT(*) as n FROM job_images WHERE job_id = ? AND transcription IS NOT NULL").get(jobId) as { n: number }).n;
      db.prepare("UPDATE processing_jobs SET chunks_done = ?, chunk_ms_total = chunk_ms_total + ?, updated_at = datetime('now') WHERE id = ?").run(done, Date.now() - startedAt, jobId);
    }

    const transcriptions = (db.prepare("SELECT transcription FROM job_images WHERE job_id = ? ORDER BY order_index").all(jobId) as Array<{ transcription: string }>).map((r) => r.transcription).filter((t) => t && t.trim());
    if (transcriptions.length === 0) throw new Error("None of the uploaded images contained readable text.");
    const assembled = transcriptions.join("\n\n");
    const structureChunks = chunkText(assembled);
    // Progress now covers both phases: images transcribed + text chunks structured.
    db.prepare("UPDATE processing_jobs SET raw_text = ?, chunks_total = ?, chunks_done = ?, updated_at = datetime('now') WHERE id = ?").run(assembled, imageCount + structureChunks.length, imageCount, jobId);
    job = db.prepare("SELECT * FROM processing_jobs WHERE id = ?").get(jobId) as any;
  }

  // ── Phase B: chunked structuring (all jobs) ──
  // Chunks run in parallel batches of PARALLEL_CHUNKS, persisted strictly in
  // order after each batch completes - roughly a 3x wall-clock speedup on
  // long books. A chunk that starts mid-chapter titles its first chapter
  // CONTINUATION and persistChunk stitches it onto the preceding one, so
  // concurrency doesn't break chapter boundaries. Progress advances at batch
  // boundaries, which keeps resume exact: chunks_done only ever counts
  // chunks that are fully persisted.
  const PARALLEL_CHUNKS = 3;
  const chunkOffset = imageCount > 0 ? imageCount : 0;
  const chunks = chunkText(job.raw_text);
  for (let batchStart = job.chunks_done - chunkOffset; batchStart < chunks.length; batchStart += PARALLEL_CHUNKS) {
    const batchEnd = Math.min(batchStart + PARALLEL_CHUNKS, chunks.length);
    const priorTitles = (db.prepare("SELECT title FROM chapters WHERE book_id = ? ORDER BY order_index").all(job.book_id) as Array<{ title: string }>).map((c) => c.title);
    const startedAt = Date.now();

    const results = await Promise.all(
      Array.from({ length: batchEnd - batchStart }, (_, k) => structureChunk(chunks[batchStart + k], batchStart + k, chunks.length, job.original_filename, priorTitles))
    );
    for (const result of results) persistChunk(job.book_id, result);

    if (batchStart === 0) {
      // First chunk carries the best title/author signal (front matter lives there).
      db.prepare("UPDATE books SET title = ?, author = ? WHERE id = ?").run(results[0].title || job.original_filename, results[0].author, job.book_id);
    }

    const elapsed = Date.now() - startedAt;
    db.prepare("UPDATE processing_jobs SET chunks_done = ?, chunk_ms_total = chunk_ms_total + ?, updated_at = datetime('now') WHERE id = ?").run(chunkOffset + batchEnd, elapsed, jobId);
  }

  // Done: mark ready, drop the raw text so the DB doesn't carry whole books around.
  db.prepare("UPDATE processing_jobs SET status = 'done', raw_text = '', updated_at = datetime('now') WHERE id = ?").run(jobId);
  db.prepare("UPDATE books SET status = 'ready' WHERE id = ?").run(job.book_id);
}

// Called once on server boot: any job that was queued or mid-run when the
// process died still has its raw text in SQLite - re-enqueue it and it picks
// up from the last completed chunk.
export function resumeInterruptedJobs(): void {
  const interrupted = db.prepare("SELECT id FROM processing_jobs WHERE status IN ('queued', 'running')").all() as Array<{ id: number }>;
  if (interrupted.length === 0) return;
  console.log(`Resuming ${interrupted.length} interrupted processing job(s)…`);
  for (const job of interrupted) enqueue(job.id);
}

export interface BookProcessingStatus {
  bookId: number;
  status: string; // book status: processing | ready | failed
  phase: "transcribing" | "structuring" | null;
  imagesTotal: number;
  chunksTotal: number;
  chunksDone: number;
  percent: number;
  etaSeconds: number | null;
  error: string | null;
}

export function getBookProcessingStatus(bookId: number, userId: number): BookProcessingStatus | null {
  const book = db.prepare("SELECT id, status, uploaded_by_user_id FROM books WHERE id = ?").get(bookId) as any;
  if (!book || book.uploaded_by_user_id !== userId) return null;
  const job = db.prepare("SELECT * FROM processing_jobs WHERE book_id = ? ORDER BY id DESC LIMIT 1").get(bookId) as any;
  if (!job) return { bookId, status: book.status, phase: null, imagesTotal: 0, chunksTotal: 0, chunksDone: 0, percent: book.status === "ready" ? 100 : 0, etaSeconds: null, error: null };

  const imagesTotal = (db.prepare("SELECT COUNT(*) as n FROM job_images WHERE job_id = ?").get(job.id) as { n: number }).n;
  const imagesPending = imagesTotal > 0 ? (db.prepare("SELECT COUNT(*) as n FROM job_images WHERE job_id = ? AND transcription IS NULL").get(job.id) as { n: number }).n : 0;
  const phase: BookProcessingStatus["phase"] = book.status !== "processing" ? null : imagesPending > 0 ? "transcribing" : "structuring";

  const percent = job.chunks_total > 0 ? Math.round((job.chunks_done / job.chunks_total) * 100) : 0;
  let etaSeconds: number | null = null;
  if (job.status === "running" || job.status === "queued") {
    const avgMs = job.chunks_done > 0 ? job.chunk_ms_total / job.chunks_done : imagesTotal > 0 ? 12_000 : 45_000; // screenshots transcribe much faster than structure chunks
    etaSeconds = Math.round(((job.chunks_total - job.chunks_done) * avgMs) / 1000);
  }
  return { bookId, status: book.status, phase, imagesTotal, chunksTotal: job.chunks_total, chunksDone: job.chunks_done, percent, etaSeconds, error: job.error };
}
