import cors from "cors";
import "dotenv/config";
import express from "express";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import { effectivePlan, login, logout, me, publicUser, requireAuth, signup } from "./auth";
import { db } from "./db";
import { getDueTopics, respondToTurn, startSession } from "./sessions";
import { seedTestContent } from "./seed";
import { synthesizeTopicsForChapter } from "./topics";
import { extractUploadedFile, parseFlashcardSpreadsheet } from "./upload";
import { configureGoogleAuth } from "./googleAuth";
import { appendJobToBook, findMatchingBook, getBookProcessingStatus, resumeInterruptedJobs, startImageProcessingJob, startProcessingJob } from "./processing";
import { protocolUnlocked, advancedTier, type BloomTier } from "./bloom";
import { startArgumentSession, respondToArgumentTurn } from "./argument";
import { startAuditSession, respondToAuditTurn } from "./audit";
import { bridgeEligibility, respondToBridge, startBridge } from "./bridges";
import multer from "multer";
import Stripe from "stripe";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production" ? true : (process.env.CLIENT_ORIGIN ?? "http://localhost:5173"),
  credentials: true,
}));
// Stripe webhook — MUST be registered before express.json(), which would
// otherwise consume and parse the body first. stripe.webhooks.constructEvent
// needs the raw bytes or signature verification fails on every event.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) { res.sendStatus(400); return; }
  try {
    let event: Stripe.Event;
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else if (process.env.NODE_ENV === "production") {
      // Never accept unverified webhook payloads in production - anyone who
      // finds the URL could otherwise grant themselves a pro plan.
      console.error("Webhook received but STRIPE_WEBHOOK_SECRET is not set. Rejecting.");
      res.sendStatus(400);
      return;
    } else {
      event = JSON.parse(req.body.toString("utf-8")) as Stripe.Event;
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.customer) {
        db.prepare("UPDATE users SET plan = 'pro' WHERE stripe_customer_id = ?").run(String(session.customer));
      }
    }
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.customer) {
        db.prepare("UPDATE users SET plan = 'free' WHERE stripe_customer_id = ?").run(String(subscription.customer));
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook error:", error);
    res.sendStatus(400);
  }
});

app.use(express.json({ limit: "1mb" }));

if (!process.env.SESSION_SECRET) {
  console.warn("SESSION_SECRET is not set — using an insecure default. Set one in .env before deploying.");
}

// Sessions live in SQLite (the same database connection the rest of the app
// already uses), not memory - a server restart (which happens constantly in
// local dev) no longer signs everyone out. The cookie's own 30-day maxAge
// can now actually mean something.
const SqliteStore = SqliteStoreFactory(session);

app.use(
  session({
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 1000 * 60 * 60 * 24 } }),
    secret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      // "none" + secure required for mobile Safari and cross-origin contexts.
      // "lax" drops cookies on mobile in certain navigation patterns.
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 60, // 60 days, rolling
    },
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

// Quick check so the client can show a friendly message if Google OAuth isn't configured
app.get("/api/auth/google/check", (_req, res) => {
  res.json({ configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

app.post("/api/auth/signup", signup);
app.post("/api/auth/login", login);
app.post("/api/auth/logout", logout);
app.get("/api/auth/me", me);

// Permanently deletes the user and all their data (CASCADE handles books,
// chapters, concepts, progress, sessions, turns, reflections).
app.delete("/api/auth/delete-account", requireAuth, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.session.userId);
  req.session.destroy(() => res.json({ deleted: true }));
});

// Update profile fields (name, email)
app.patch("/api/auth/profile", requireAuth, express.json(), (req, res) => {
  const { displayName, email } = req.body as { displayName?: string; email?: string };
  if (displayName !== undefined) {
    db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, req.session.userId);
  }
  if (email) {
    const existing = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, req.session.userId);
    if (existing) {
      res.status(409).json({ error: "That email is already in use." });
      return;
    }
    db.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, req.session.userId);
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as any;
  res.json({ user: publicUser(user) });
});

// Upload profile picture (stored as base64 data URL in the DB for simplicity)
const profilePicUpload = upload.single("profilePic");
app.post("/api/auth/profile-pic", requireAuth, profilePicUpload, (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No image uploaded." });
    return;
  }
  const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
  db.prepare("UPDATE users SET profile_pic = ? WHERE id = ?").run(base64, req.session.userId);
  res.json({ profilePic: base64 });
});

app.get("/api/books", requireAuth, (req, res) => {
  const ownBooks = db.prepare("SELECT * FROM books WHERE uploaded_by_user_id = ? ORDER BY created_at DESC").all(req.session.userId) as any[];
  const ownIds = new Set(ownBooks.map((b: any) => b.id));
  const libraryBooks = (db.prepare("SELECT * FROM books WHERE is_library_book = 1 AND status = 'ready' ORDER BY created_at ASC").all() as any[]).filter((b: any) => !ownIds.has(b.id));
  const allBooks = [...ownBooks, ...libraryBooks];
  const enriched = allBooks.map((book: any) => {
    const stats = db.prepare(
      `SELECT COUNT(t.id) as total,
              SUM(CASE WHEN tp.status = 'mastered' THEN 1 ELSE 0 END) as mastered
       FROM topics t
       JOIN chapters c ON c.id = t.chapter_id
       LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.user_id = ?
       WHERE c.book_id = ?`
    ).get(req.session.userId, book.id) as { total: number; mastered: number } | undefined;
    return { ...book, totalTopics: stats?.total ?? 0, masteredTopics: stats?.mastered ?? 0, isLibraryBook: Boolean(book.is_library_book), libraryCollection: book.library_collection ?? null };
  });
  const me = db.prepare("SELECT lifetime_uploads FROM users WHERE id = ?").get(req.session.userId) as { lifetime_uploads: number };
  res.json({ books: enriched, uploadsUsed: me.lifetime_uploads });
});

// Delete a book and everything under it (chapters, concepts, topics, progress,
// sessions - foreign keys cascade). Deliberately does NOT decrement
// lifetime_uploads: the free allowance is spent on upload, not on possession.
app.delete("/api/books/:bookId", requireAuth, (req, res) => {
  const book = db.prepare("SELECT id, uploaded_by_user_id FROM books WHERE id = ?").get(Number(req.params.bookId)) as { id: number; uploaded_by_user_id: number } | undefined;
  if (!book || book.uploaded_by_user_id !== req.session.userId) {
    res.status(404).json({ error: "Book not found." });
    return;
  }
  db.prepare("DELETE FROM books WHERE id = ?").run(book.id);
  res.json({ ok: true });
});

// Dev-only: populates the real 31-chapter, 1,480-flashcard deck so the
// engine can be exercised locally before the real upload pipeline exists.
app.post("/api/dev/seed", requireAuth, (req, res) => {
  const bookId = seedTestContent(req.session.userId!);
  res.json({ bookId });
});

// Real upload: accepts a PDF or plain text file, extracts text, uses AI to
// identify chapters and key concepts, stores everything for the existing
// study flow. The AI call can take 10-30 seconds depending on document size.

// Pre-flight: check if an extracted title looks like an existing book.
// Client calls this after text extraction, before kicking off the job.
app.post("/api/books/check-title", requireAuth, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.json({ match: null }); return; }
  const match = findMatchingBook(req.session.userId!, title);
  res.json({ match });
});

// After user confirms "add to existing book", patch the job's book_id.
app.post("/api/jobs/:jobId/append-to/:bookId", requireAuth, (req, res) => {
  const jobId = Number(req.params.jobId);
  const bookId = Number(req.params.bookId);
  const job = db.prepare("SELECT * FROM processing_jobs WHERE id = ? AND user_id = ?").get(jobId, req.session.userId) as any;
  const book = db.prepare("SELECT id FROM books WHERE id = ? AND uploaded_by_user_id = ?").get(bookId, req.session.userId) as any;
  if (!job || !book) { res.status(404).json({ error: "Job or book not found." }); return; }
  appendJobToBook(jobId, bookId);
  // Delete the placeholder book that was created for this job
  db.prepare("DELETE FROM books WHERE id = ? AND id != ?").run(job.book_id, bookId);
  res.json({ ok: true, bookId });
});

app.post("/api/books/upload", requireAuth, upload.array("file", 20), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    // Enforce the free-tier book limit server-side - the Library UI hides the
    // upload button, but the API must be the real gate.
    // The wall counts LIFETIME uploads, not current library size - deleting a
    // book tidies the library but never refunds the free upload.
    const uploader = db.prepare("SELECT email, plan, lifetime_uploads FROM users WHERE id = ?").get(req.session.userId) as { email: string; plan: string; lifetime_uploads: number };
    if (effectivePlan(uploader) !== "pro" && uploader.lifetime_uploads >= 1) {
      res.status(403).json({ error: "Your free upload has been used. Upgrade to Pro for unlimited books." });
      return;
    }

    // Flashcard spreadsheets import directly - no AI, no job, instant book.
    const first = files[0];
    const isSpreadsheet = files.length === 1 && (/\.(xlsx|xls|csv)$/i.test(first.originalname) || first.mimetype.includes("spreadsheet") || first.mimetype === "text/csv");
    if (isSpreadsheet) {
      const parsed = parseFlashcardSpreadsheet(first.buffer, first.originalname);
      const insertBook = db.prepare("INSERT INTO books (title, author, status, uploaded_by_user_id) VALUES (?, NULL, 'ready', ?)");
      const insertChapter = db.prepare("INSERT INTO chapters (book_id, number, title, summary, order_index) VALUES (?, ?, ?, ?, ?)");
      const insertConcept = db.prepare("INSERT INTO concepts (chapter_id, label, question, source_locator, source_passage, order_index) VALUES (?, ?, ?, ?, ?, ?)");
      const bookId = db.transaction(() => {
        const id = insertBook.run(parsed.title, req.session.userId).lastInsertRowid as number;
        parsed.chapters.forEach((ch, ci) => {
          const chapterId = insertChapter.run(id, ci + 1, ch.title, `${ch.cards.length} concept${ch.cards.length === 1 ? "" : "s"}`, ci).lastInsertRowid as number;
          ch.cards.forEach((card, i) => {
            const label = card.question.length > 80 ? card.question.slice(0, 77) + "..." : card.question;
            insertConcept.run(chapterId, label, card.question, "imported flashcard", card.answer, i);
          });
        });
        return id;
      })();
      db.prepare("UPDATE users SET lifetime_uploads = lifetime_uploads + 1 WHERE id = ?").run(req.session.userId);
      res.status(201).json({ bookId, jobId: 0, chunksTotal: 0 });
      return;
    }

    const isImage = (f: Express.Multer.File) => f.mimetype.startsWith("image/");
    const images = files.filter(isImage);
    const docs = files.filter((f) => !isImage(f));

    // Screenshots: transcription happens inside the background job (each
    // image is its own vision call), so this returns just as fast.
    if (images.length > 0 && docs.length === 0) {
      const label = images.length === 1 ? images[0].originalname.replace(/\.[^.]+$/, "") : `Screenshots (${images.length} pages)`;
      const job = startImageProcessingJob(req.session.userId!, images.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })), label);
      db.prepare("UPDATE users SET lifetime_uploads = lifetime_uploads + 1 WHERE id = ?").run(req.session.userId);
      res.status(202).json(job);
      return;
    }
    if (images.length > 0 && docs.length > 0) {
      res.status(400).json({ error: "Upload screenshots and documents separately — images become one book per batch." });
      return;
    }
    if (docs.length > 1) {
      res.status(400).json({ error: "Upload one document at a time (multiple files are only supported for screenshots)." });
      return;
    }

    const file = docs[0];
    const { text } = await extractUploadedFile(file.buffer, file.mimetype, file.originalname);
    // Free tier is capped at roughly 300 pages (~550k extracted characters) so a
    // single free upload can't be an 800-page monster - big books are a Pro thing.
    const FREE_MAX_CHARS = 550_000;
    if (effectivePlan(uploader) !== "pro" && text.length > FREE_MAX_CHARS) {
      res.status(403).json({ error: "This book is longer than the free tier supports (about 300 pages). Upgrade to Pro for full-length books." });
      return;
    }
    if (!text.trim()) {
      res.status(400).json({ error: "Could not extract any text from this file. If it's a PDF, it may be a scanned document — try uploading screenshots of the pages instead." });
      return;
    }

    // Extraction is fast; the AI structuring is not. Kick off a background
    // job and return immediately - the client polls /api/books/:id/status
    // and the Library shows a live progress bar.
    const job = startProcessingJob(req.session.userId!, text, file.originalname);
    db.prepare("UPDATE users SET lifetime_uploads = lifetime_uploads + 1 WHERE id = ?").run(req.session.userId);
    res.status(202).json(job);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not process the uploaded file." });
  }
});

app.get("/api/books/:bookId/status", requireAuth, (req, res) => {
  const status = getBookProcessingStatus(Number(req.params.bookId), req.session.userId!);
  if (!status) { res.status(404).json({ error: "Book not found." }); return; }
  res.json(status);
});

// ── Connections: cross-topic transfer challenges ──
app.get("/api/books/:bookId/bridge/eligibility", requireAuth, (req, res) => {
  res.json(bridgeEligibility(req.session.userId!, Number(req.params.bookId)));
});

app.post("/api/books/:bookId/bridge", requireAuth, async (req, res) => {
  try {
    res.json(await startBridge(req.session.userId!, Number(req.params.bookId)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not start the connection." });
  }
});

app.post("/api/bridges/:bridgeId/respond", requireAuth, async (req, res) => {
  try {
    const answer = typeof req.body?.answerText === "string" ? req.body.answerText : "";
    if (!answer.trim()) { res.status(400).json({ error: "Write an answer first." }); return; }
    res.json(await respondToBridge(req.session.userId!, Number(req.params.bridgeId), answer));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not judge the answer." });
  }
});

// ── Argument protocol ──
app.post("/api/topics/:topicId/argument/start", requireAuth, async (req, res) => {
  try {
    res.json(await startArgumentSession(req.session.userId!, Number(req.params.topicId)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not start the Argument session." });
  }
});

app.post("/api/argument/:sessionId/turns/:turnId/respond", requireAuth, async (req, res) => {
  try {
    const answer = typeof req.body?.answerText === "string" ? req.body.answerText : "";
    if (!answer.trim()) { res.status(400).json({ error: "Write an answer first." }); return; }
    res.json(await respondToArgumentTurn(req.session.userId!, Number(req.params.sessionId), Number(req.params.turnId), answer));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not process the answer." });
  }
});

// ── Audit protocol ──
app.post("/api/topics/:topicId/audit/start", requireAuth, async (req, res) => {
  try {
    res.json(await startAuditSession(req.session.userId!, Number(req.params.topicId)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not start the Audit session." });
  }
});

app.post("/api/audit/:sessionId/turns/:turnId/respond", requireAuth, async (req, res) => {
  try {
    const answer = typeof req.body?.answerText === "string" ? req.body.answerText : "";
    if (!answer.trim()) { res.status(400).json({ error: "Write an answer first." }); return; }
    res.json(await respondToAuditTurn(req.session.userId!, Number(req.params.sessionId), Number(req.params.turnId), answer));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Could not process the answer." });
  }
});

// ── Topic-level progression status ──
// Returns the learner's Bloom tier and which protocols are available for this topic.
// The client uses this to show/hide Argument and Audit cards in the Session view.
app.get("/api/topics/:topicId/progression", requireAuth, (req, res) => {
  const topicId = Number(req.params.topicId);
  const progress = db.prepare("SELECT bloom_tier, status FROM topic_progress WHERE user_id = ? AND topic_id = ?").get(req.session.userId, topicId) as any;
  const bloomTier: BloomTier = (progress?.bloom_tier ?? 1) as BloomTier;
  const mastered = progress?.status === "mastered";

  const argumentCompleted = (db.prepare(
    "SELECT COUNT(*) as n FROM argument_sessions WHERE user_id = ? AND topic_id = ? AND status = 'completed'"
  ).get(req.session.userId, topicId) as any).n > 0;
  const auditCompleted = (db.prepare(
    "SELECT COUNT(*) as n FROM audit_sessions WHERE user_id = ? AND topic_id = ? AND status = 'completed'"
  ).get(req.session.userId, topicId) as any).n > 0;

  res.json({
    bloomTier,
    mastered,
    argumentUnlocked: protocolUnlocked(bloomTier, "argument"),
    auditUnlocked: protocolUnlocked(bloomTier, "audit"),
    argumentCompleted,
    auditCompleted,
  });
});

// ── Admin: Liberation Library management ──
app.post("/api/admin/books/:bookId/library", requireAuth, (req, res) => {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const me = db.prepare("SELECT email FROM users WHERE id = ?").get(req.session.userId) as any;
  if (!me || me.email.trim().toLowerCase() !== adminEmail) { res.status(403).json({ error: "Admin only." }); return; }
  const col = ((req.body as any)?.collection ?? "black-liberation").toString().trim();
  db.prepare("UPDATE books SET is_library_book = 1, library_collection = ? WHERE id = ?").run(col, Number(req.params.bookId));
  res.json({ ok: true });
});

app.delete("/api/admin/books/:bookId/library", requireAuth, (req, res) => {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const me = db.prepare("SELECT email FROM users WHERE id = ?").get(req.session.userId) as any;
  if (!me || me.email.trim().toLowerCase() !== adminEmail) { res.status(403).json({ error: "Admin only." }); return; }
  db.prepare("UPDATE books SET is_library_book = 0, library_collection = NULL WHERE id = ?").run(Number(req.params.bookId));
  res.json({ ok: true });
});

// ── Per-topic notes ──
app.get("/api/topics/:topicId/note", requireAuth, (req, res) => {
  const row = db.prepare("SELECT content, updated_at FROM notes WHERE user_id = ? AND topic_id = ?").get(req.session.userId, Number(req.params.topicId)) as { content: string; updated_at: string } | undefined;
  res.json({ content: row?.content ?? "", updatedAt: row?.updated_at ?? null });
});

app.put("/api/topics/:topicId/note", requireAuth, (req, res) => {
  const content = typeof req.body?.content === "string" ? req.body.content : "";
  if (content.length > 50_000) { res.status(400).json({ error: "Note is too long." }); return; }
  const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(Number(req.params.topicId));
  if (!topic) { res.status(404).json({ error: "Topic not found." }); return; }
  db.prepare(
    `INSERT INTO notes (user_id, topic_id, content, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, topic_id) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`
  ).run(req.session.userId, Number(req.params.topicId), content);
  res.json({ ok: true });
});

app.get("/api/books/:bookId/chapters", requireAuth, (req, res) => {
  const chapters = db.prepare("SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index ASC").all(req.params.bookId);
  res.json({ chapters });
});

// The synthesized topics for a chapter - what Study Path and Session
// actually work through. Empty until synthesize-topics has been run once.
app.get("/api/chapters/:chapterId/topics", requireAuth, (req, res) => {
  const topics = getDueTopics(req.session.userId!, Number(req.params.chapterId));
  res.json({ topics });
});

// Triggers the AI synthesis call for a chapter - reads its raw flashcards,
// surfaces the actual ideas the author is arguing. Idempotent unless force=true.
app.post("/api/chapters/:chapterId/synthesize-topics", requireAuth, async (req, res) => {
  try {
    const force = Boolean((req.body as { force?: boolean } | undefined)?.force);
    const result = await synthesizeTopicsForChapter(Number(req.params.chapterId), force);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not synthesize topics for this chapter." });
  }
});

// The source flashcards that grounded a specific synthesized topic - so
// a learner can review the raw material after struggling with a topic.
app.get("/api/topics/:topicId/source-cards", requireAuth, (req, res) => {
  const cards = db
    .prepare(
      `SELECT c.id, c.label, c.source_locator, c.source_passage FROM concepts c
       JOIN topic_source_cards tsc ON tsc.concept_id = c.id
       WHERE tsc.topic_id = ?
       ORDER BY c.order_index ASC`,
    )
    .all(req.params.topicId);
  res.json({ flashcards: cards });
});

// Flashcard Lab: pure browsing, no progress tracking, no AI. Deliberately
// disconnected from topic_progress so it can never be used to "cheat"
// mastery - the scheduler only updates from a real dialogue session.
app.get("/api/chapters/:chapterId/flashcards", requireAuth, (req, res) => {
  const flashcards = db
    .prepare("SELECT id, label, question, source_locator, source_passage FROM concepts WHERE chapter_id = ? ORDER BY order_index ASC")
    .all(req.params.chapterId);
  res.json({ flashcards });
});

app.post("/api/topics/:topicId/sessions", requireAuth, async (req, res) => {
  try {
    const result = await startSession(req.session.userId!, Number(req.params.topicId));
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not start the session." });
  }
});

// Check for an existing in-progress session on a topic and return its full state
app.get("/api/topics/:topicId/active-session", requireAuth, (req, res) => {
  const session = db.prepare(
    "SELECT * FROM dialogue_sessions WHERE user_id = ? AND topic_id = ? AND status = 'in_progress' ORDER BY started_at DESC LIMIT 1"
  ).get(req.session.userId, req.params.topicId) as { id: number; topic_id: number } | undefined;

  if (!session) {
    res.json({ activeSession: null });
    return;
  }

  const turns = db.prepare(
    "SELECT id, dimension, attempt_number, question_text, answer_text, verdict, hint_requested, passage_shown FROM dialogue_turns WHERE session_id = ? ORDER BY id ASC"
  ).all(session.id);

  res.json({ activeSession: { sessionId: session.id, turns } });
});

// Abandon an in-progress session so the user can start fresh
app.post("/api/sessions/:sessionId/abandon", requireAuth, (req, res) => {
  db.prepare("UPDATE dialogue_sessions SET status = 'incomplete', ended_at = datetime('now') WHERE id = ? AND user_id = ? AND status = 'in_progress'")
    .run(req.params.sessionId, req.session.userId);
  res.json({ abandoned: true });
});

app.post("/api/sessions/:sessionId/turns/:turnId/respond", requireAuth, async (req, res) => {
  try {
    const { answerText, hintRequested } = req.body as { answerText?: string; hintRequested?: boolean };
    const result = await respondToTurn(req.session.userId!, Number(req.params.sessionId), Number(req.params.turnId), { answerText, hintRequested });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not process the response." });
  }
});

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Stripe Checkout ──
app.post("/api/billing/checkout", requireAuth, async (req, res) => {
  if (!stripe || !process.env.STRIPE_PRICE_ID) {
    res.status(503).json({ error: "Payment processing is not configured yet. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to your .env file." });
    return;
  }
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as any;
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } });
      customerId = customer.id;
      db.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").run(customerId, user.id);
    }
    const appUrl = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? `https://${req.headers.host}` : "http://localhost:5173");
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl}?upgraded=true`,
      cancel_url: `${appUrl}`,
    });
    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not create checkout session." });
  }
});

// Stripe Billing Portal — where a paying user manages their card, sees
// invoices, or cancels. Requires the portal configuration to be saved once
// in the Stripe dashboard (Settings → Billing → Customer portal).
app.post("/api/billing/portal", requireAuth, async (req, res) => {
  if (!stripe) {
    res.status(503).json({ error: "Payment processing is not configured yet." });
    return;
  }
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as any;
    if (!user.stripe_customer_id) {
      res.status(400).json({ error: "No billing profile yet — upgrade to Pro first and your payment method will be added during checkout." });
      return;
    }
    const appUrl = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? `https://${req.headers.host}` : "http://localhost:5173");
    const portal = await stripe.billingPortal.sessions.create({ customer: user.stripe_customer_id, return_url: appUrl });
    res.json({ url: portal.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not open the billing portal." });
  }
});

// ── Admin Dashboard ──
function requireAdmin(req: any, res: any, next: any) {
  if (!req.session.userId) { res.status(401).json({ error: "Sign in required." }); return; }
  const user = db.prepare("SELECT email FROM users WHERE id = ?").get(req.session.userId) as { email: string } | undefined;
  if (!user || user.email !== ADMIN_EMAIL) { res.status(403).json({ error: "Not authorized." }); return; }
  next();
}

app.get("/api/admin/stats", requireAdmin, (_req, res) => {
  const userCount = (db.prepare("SELECT COUNT(*) as n FROM users").get() as any).n;
  const proCount = (db.prepare("SELECT COUNT(*) as n FROM users WHERE plan = 'pro'").get() as any).n;
  const bookCount = (db.prepare("SELECT COUNT(*) as n FROM books").get() as any).n;
  const chapterCount = (db.prepare("SELECT COUNT(*) as n FROM chapters").get() as any).n;
  const topicCount = (db.prepare("SELECT COUNT(*) as n FROM topics").get() as any).n;
  const conceptCount = (db.prepare("SELECT COUNT(*) as n FROM concepts").get() as any).n;
  const sessionCount = (db.prepare("SELECT COUNT(*) as n FROM dialogue_sessions").get() as any).n;
  const completedSessions = (db.prepare("SELECT COUNT(*) as n FROM dialogue_sessions WHERE status = 'completed'").get() as any).n;
  const masteredTopics = (db.prepare("SELECT COUNT(*) as n FROM topic_progress WHERE status = 'mastered'").get() as any).n;

  const recentUsers = db.prepare("SELECT id, email, display_name, plan, created_at FROM users ORDER BY created_at DESC LIMIT 20").all();
  const recentBooks = db.prepare("SELECT b.id, b.title, b.author, b.created_at, u.email as uploaded_by FROM books b JOIN users u ON u.id = b.uploaded_by_user_id ORDER BY b.created_at DESC LIMIT 20").all();
  const allBooks = db.prepare("SELECT id, title, author, status, is_library_book, library_collection FROM books WHERE status = 'ready' ORDER BY title ASC").all().map((b: any) => ({ ...b, isLibraryBook: Boolean(b.is_library_book), libraryCollection: b.library_collection ?? null }));

  res.json({
    stats: { userCount, proCount, bookCount, chapterCount, topicCount, conceptCount, sessionCount, completedSessions, masteredTopics },
    recentUsers,
    recentBooks,
    books: allBooks,
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 8787;

// In production, serve the built React frontend from the same process.
// In dev, Vite's proxy handles this instead.
if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "..", "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Any upload that was mid-processing when the last process died (deploy,
// crash, Render restart) picks up from its last completed chunk.
configureGoogleAuth(app);
resumeInterruptedJobs();

app.listen(port, () => {
  console.log(`Comprehend server listening on http://localhost:${port}`);
});
