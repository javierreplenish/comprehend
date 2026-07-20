import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "data.db");
import fs from "node:fs";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT '',
    profile_pic TEXT NOT NULL DEFAULT '',
    plan TEXT NOT NULL DEFAULT 'free',
    stripe_customer_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per upload that needs chunked background processing. The raw
  -- extracted text is stored here so an interrupted job (server restart,
  -- deploy) can resume from the last completed chunk instead of losing the
  -- upload. Cleared (raw_text = '') once the job finishes to keep the DB slim.
  CREATE TABLE IF NOT EXISTS processing_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued', -- queued | running | done | failed
    raw_text TEXT NOT NULL DEFAULT '',
    original_filename TEXT NOT NULL DEFAULT '',
    chunks_total INTEGER NOT NULL DEFAULT 0,
    chunks_done INTEGER NOT NULL DEFAULT 0,
    chunk_ms_total INTEGER NOT NULL DEFAULT 0, -- summed per-chunk duration, drives the ETA
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_processing_jobs_book ON processing_jobs(book_id);

  -- Screenshot/image uploads: one row per image, in reading order. The blob
  -- is kept only until its transcription lands (data is blanked after), so
  -- an interrupted job can resume transcribing where it stopped without the
  -- DB permanently carrying image data.
  CREATE TABLE IF NOT EXISTS job_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL,
    mimetype TEXT NOT NULL,
    data BLOB,
    transcription TEXT, -- null until transcribed
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_job_images_job ON job_images(job_id);

  -- Per-user, per-topic freeform notes. One row per (user, topic), replaced
  -- on save - no history, deliberately simple.
  -- Cross-topic transfer challenges ("Connections"): one question that
  -- forces the learner to relate two topics they've already mastered -
  -- tension, dependency, or shared mechanism. The deepest critical-thinking
  -- move the product tests.
  CREATE TABLE IF NOT EXISTS bridge_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    topic_a_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    topic_b_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | incomplete
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_bridge_sessions_user ON bridge_sessions(user_id, book_id);

  CREATE TABLE IF NOT EXISTS bridge_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bridge_id INTEGER NOT NULL REFERENCES bridge_sessions(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    verdict TEXT, -- advance | narrow | incomplete | null while unanswered
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_bridge_turns_bridge ON bridge_turns(bridge_id);

  CREATE TABLE IF NOT EXISTS notes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, topic_id)
  );

  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT,
    status TEXT NOT NULL DEFAULT 'processing', -- processing | ready | failed
    uploaded_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL,
    topics_synthesized INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id);

  -- Raw flashcards: the full 1,480-card deck, unchanged, pure reference
  -- material. Used ONLY by Flashcard Lab from here on - never the target of
  -- progress tracking or the dialogue engine.
  CREATE TABLE IF NOT EXISTS concepts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    question TEXT NOT NULL DEFAULT '',
    source_locator TEXT NOT NULL DEFAULT '',
    source_passage TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_concepts_chapter ON concepts(chapter_id);

  -- Topics: AI-synthesized from a chapter's flashcards - the actual ideas
  -- the author is arguing, not individual facts. This is what Study Path
  -- and the dialogue engine actually work through.
  CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    thesis TEXT NOT NULL,
    source_locator TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_topics_chapter ON topics(chapter_id);

  -- Traceability: which specific raw flashcards grounded each synthesized
  -- topic, so a learner can always see the real source excerpts behind an
  -- AI summary, not just trust the paraphrase.
  CREATE TABLE IF NOT EXISTS topic_source_cards (
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    PRIMARY KEY (topic_id, concept_id)
  );

  -- One row per (user, topic). Pure scheduling state - no AI involved in
  -- reading/writing this.
  CREATE TABLE IF NOT EXISTS topic_progress (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'not_started', -- not_started | mastered | needs_revisit
    interval_days INTEGER NOT NULL DEFAULT 1,
    streak INTEGER NOT NULL DEFAULT 0,
    last_completed_at TEXT,
    next_due_at TEXT,
    PRIMARY KEY (user_id, topic_id)
  );
  CREATE INDEX IF NOT EXISTS idx_topic_progress_due ON topic_progress(user_id, next_due_at);

  CREATE TABLE IF NOT EXISTS dialogue_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | incomplete
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    used_passage INTEGER NOT NULL DEFAULT 0,
    used_hint INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user_topic ON dialogue_sessions(user_id, topic_id);

  CREATE TABLE IF NOT EXISTS dialogue_turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    verdict TEXT, -- advance | narrow | needs_passage | incomplete | null while unanswered
    hint_requested INTEGER NOT NULL DEFAULT 0,
    passage_shown INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_turns_session ON dialogue_turns(session_id);

  -- Reflections are event-triggered (fire after a revision), not scheduled,
  -- and are explicitly skippable - see reflection design from earlier.
  CREATE TABLE IF NOT EXISTS reflections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES dialogue_sessions(id) ON DELETE CASCADE,
    reflection_text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── Migrations for databases created before these columns existed ──
// CREATE TABLE IF NOT EXISTS never alters existing tables, so additive
// changes go here. Safe to run on every boot.
const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
if (!userColumns.some((c) => c.name === "lifetime_uploads")) {
  db.exec("ALTER TABLE users ADD COLUMN lifetime_uploads INTEGER NOT NULL DEFAULT 0");
  // Existing users start with their current book count - deleting never refunds.
  db.exec("UPDATE users SET lifetime_uploads = (SELECT COUNT(*) FROM books WHERE books.uploaded_by_user_id = users.id)");
}
