import cors from "cors";
import "dotenv/config";
import express from "express";
import session from "express-session";
import SqliteStoreFactory from "better-sqlite3-session-store";
import { login, logout, me, requireAuth, signup } from "./auth";
import { db } from "./db";
import { getDueTopics, respondToTurn, startSession } from "./sessions";
import { seedTestContent } from "./seed";
import { synthesizeTopicsForChapter } from "./topics";
import { extractTextFromPdf, processUploadedText } from "./upload";
import multer from "multer";
import Stripe from "stripe";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const app = express();

app.use(cors({
  origin: process.env.NODE_ENV === "production" ? true : (process.env.CLIENT_ORIGIN ?? "http://localhost:5173"),
  credentials: true,
}));
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
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 30 },
  }),
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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
  res.json({ user: { id: user.id, email: user.email, displayName: user.display_name, profilePic: user.profile_pic } });
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
  const books = db.prepare("SELECT * FROM books WHERE uploaded_by_user_id = ? ORDER BY created_at DESC").all(req.session.userId) as Array<{ id: number; title: string; author: string; status: string }>;
  const enriched = books.map((book) => {
    const stats = db.prepare(
      `SELECT COUNT(t.id) as total,
              SUM(CASE WHEN tp.status = 'mastered' THEN 1 ELSE 0 END) as mastered
       FROM topics t
       JOIN chapters c ON c.id = t.chapter_id
       LEFT JOIN topic_progress tp ON tp.topic_id = t.id AND tp.user_id = ?
       WHERE c.book_id = ?`
    ).get(req.session.userId, book.id) as { total: number; mastered: number } | undefined;
    return { ...book, totalTopics: stats?.total ?? 0, masteredTopics: stats?.mastered ?? 0 };
  });
  res.json({ books: enriched });
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

app.post("/api/books/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file was uploaded." });
      return;
    }

    let rawText: string;
    const mime = req.file.mimetype;
    const name = req.file.originalname;

    if (mime === "application/pdf") {
      rawText = await extractTextFromPdf(req.file.buffer);
      if (!rawText.trim()) {
        res.status(400).json({ error: "Could not extract text from this PDF. It may be a scanned document — only typed PDFs are supported for now." });
        return;
      }
    } else if (mime === "text/plain" || name.endsWith(".txt") || name.endsWith(".md")) {
      rawText = req.file.buffer.toString("utf-8");
    } else {
      res.status(400).json({ error: `Unsupported file type (${mime}). Upload a PDF or plain text file.` });
      return;
    }

    const result = await processUploadedText(req.session.userId!, rawText, name);
    res.status(201).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Could not process the uploaded file." });
  }
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

// Stripe webhook — confirms payment and upgrades the user's plan.
// In production, verify the webhook signature with STRIPE_WEBHOOK_SECRET.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) { res.sendStatus(400); return; }
  try {
    let event: Stripe.Event;
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers["stripe-signature"] as string;
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      event = req.body as Stripe.Event;
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

  res.json({
    stats: { userCount, proCount, bookCount, chapterCount, topicCount, conceptCount, sessionCount, completedSessions, masteredTopics },
    recentUsers,
    recentBooks,
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

app.listen(port, () => {
  console.log(`Comprehend server listening on http://localhost:${port}`);
});
