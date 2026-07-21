import type { Dimension } from "../types";

export interface BookSummary {
  id: number;
  title: string;
  author: string | null;
  status: "processing" | "ready" | "failed";
  totalTopics: number;
  masteredTopics: number;
}

export interface ChapterSummary {
  id: number;
  book_id: number;
  number: number;
  title: string;
  summary: string;
  order_index: number;
  topics_synthesized: number;
}

export interface TopicSummary {
  id: number;
  label: string;
  status: "not_started" | "mastered" | "needs_revisit" | null;
  next_due_at: string | null;
}

export interface Flashcard {
  id: number;
  label: string;
  question: string;
  source_locator: string;
  source_passage: string;
}

export interface UploadResult {
  bookId: number;
  jobId: number;
  chunksTotal: number;
}

export interface BookProcessingStatus {
  bookId: number;
  status: "processing" | "ready" | "failed";
  phase: "transcribing" | "structuring" | null;
  imagesTotal: number;
  chunksTotal: number;
  chunksDone: number;
  percent: number;
  etaSeconds: number | null;
  error: string | null;
}

export async function fetchBookStatus(bookId: number): Promise<BookProcessingStatus> {
  const res = await fetch(`/api/books/${bookId}/status`, { credentials: "include" });
  return parseOrThrow(res);
}

export async function fetchNote(topicId: number): Promise<{ content: string; updatedAt: string | null }> {
  const res = await fetch(`/api/topics/${topicId}/note`, { credentials: "include" });
  return parseOrThrow(res);
}

export async function saveNote(topicId: number, content: string): Promise<void> {
  const res = await fetch(`/api/topics/${topicId}/note`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  await parseOrThrow(res);
}

export interface StartSessionResult {
  sessionId: number;
  turnId: number;
  dimension: Dimension;
  attemptNumber: number;
  questionText: string;
  introText: string | null;
}

export type RespondResult =
  | { action: "give_hint"; hintText: string }
  | { action: "ask_question"; turnId: number; dimension: Dimension; attemptNumber: number; questionText: string; introText: string | null }
  | { action: "offer_passage"; leadInText: string; questionText: string; sourcePassage: string; turnId: number }
  | { action: "complete_session"; summaryText: string; nextDueInDays: number }
  | { action: "mark_incomplete"; supportiveText: string; nextDueInDays: number };

async function parseOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export async function fetchBooks(): Promise<{ books: BookSummary[]; uploadsUsed: number }> {
  const res = await fetch("/api/books", { credentials: "include" });
  const body = await parseOrThrow(res);
  return { books: body.books, uploadsUsed: body.uploadsUsed ?? body.books.length };
}

export async function deleteBook(bookId: number): Promise<void> {
  const res = await fetch(`/api/books/${bookId}`, { method: "DELETE", credentials: "include" });
  await parseOrThrow(res);
}

export async function seedSampleBook(): Promise<{ bookId: number }> {
  const res = await fetch("/api/dev/seed", { method: "POST", credentials: "include" });
  return parseOrThrow(res);
}

export async function uploadBook(files: File[]): Promise<UploadResult> {
  const formData = new FormData();
  for (const file of files) formData.append("file", file);
  const res = await fetch("/api/books/upload", { method: "POST", credentials: "include", body: formData });
  return parseOrThrow(res);
}

export async function fetchChapters(bookId: number): Promise<ChapterSummary[]> {
  const res = await fetch(`/api/books/${bookId}/chapters`, { credentials: "include" });
  const body = await parseOrThrow(res);
  return body.chapters;
}

export async function fetchTopics(chapterId: number): Promise<TopicSummary[]> {
  const res = await fetch(`/api/chapters/${chapterId}/topics`, { credentials: "include" });
  const body = await parseOrThrow(res);
  return body.topics;
}

export async function synthesizeTopics(chapterId: number, force = false): Promise<{ topicCount: number; skipped: boolean }> {
  const res = await fetch(`/api/chapters/${chapterId}/synthesize-topics`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
  return parseOrThrow(res);
}

export async function fetchFlashcards(chapterId: number): Promise<Flashcard[]> {
  const res = await fetch(`/api/chapters/${chapterId}/flashcards`, { credentials: "include" });
  const body = await parseOrThrow(res);
  return body.flashcards;
}

export async function fetchTopicSourceCards(topicId: number): Promise<Flashcard[]> {
  const res = await fetch(`/api/topics/${topicId}/source-cards`, { credentials: "include" });
  const body = await parseOrThrow(res);
  return body.flashcards;
}

export async function startSession(topicId: number): Promise<StartSessionResult> {
  const res = await fetch(`/api/topics/${topicId}/sessions`, { method: "POST", credentials: "include" });
  return parseOrThrow(res);
}

export interface ActiveSessionTurn {
  id: number;
  dimension: string;
  attempt_number: number;
  question_text: string;
  answer_text: string | null;
  verdict: string | null;
  hint_requested: number;
  passage_shown: number;
}

export async function checkActiveSession(topicId: number): Promise<{ activeSession: { sessionId: number; turns: ActiveSessionTurn[] } | null }> {
  const res = await fetch(`/api/topics/${topicId}/active-session`, { credentials: "include" });
  return parseOrThrow(res);
}

export async function abandonSession(sessionId: number): Promise<void> {
  const res = await fetch(`/api/sessions/${sessionId}/abandon`, { method: "POST", credentials: "include" });
  await parseOrThrow(res);
}

export async function respondToTurn(sessionId: number, turnId: number, input: { answerText?: string; hintRequested?: boolean }): Promise<RespondResult> {
  const res = await fetch(`/api/sessions/${sessionId}/turns/${turnId}/respond`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow(res);
}

export async function createCheckoutSession(): Promise<{ url: string }> {
  const res = await fetch("/api/billing/checkout", { method: "POST", credentials: "include" });
  return parseOrThrow(res);
}

export interface AdminStats {
  stats: {
    userCount: number;
    proCount: number;
    bookCount: number;
    chapterCount: number;
    topicCount: number;
    conceptCount: number;
    sessionCount: number;
    completedSessions: number;
    masteredTopics: number;
  };
  recentUsers: Array<{ id: number; email: string; display_name: string; plan: string; created_at: string }>;
  recentBooks: Array<{ id: number; title: string; author: string; created_at: string; uploaded_by: string }>;
}

export interface BridgeStart { bridgeId: number; turnId: number; attemptNumber: number; questionText: string; topicA: string; topicB: string; }
export type BridgeRespond =
  | { action: "complete"; summaryText: string }
  | { action: "narrow"; turnId: number; attemptNumber: number; questionText: string }
  | { action: "incomplete"; supportiveText: string };

export async function fetchBridgeEligibility(bookId: number): Promise<{ eligible: boolean }> {
  const res = await fetch(`/api/books/${bookId}/bridge/eligibility`, { credentials: "include" });
  return parseOrThrow(res);
}

export async function startBridgeChallenge(bookId: number): Promise<BridgeStart> {
  const res = await fetch(`/api/books/${bookId}/bridge`, { method: "POST", credentials: "include" });
  return parseOrThrow(res);
}

export async function respondToBridgeChallenge(bridgeId: number, answerText: string): Promise<BridgeRespond> {
  const res = await fetch(`/api/bridges/${bridgeId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ answerText }),
  });
  return parseOrThrow(res);
}

export async function createBillingPortalSession(): Promise<{ url: string }> {
  const res = await fetch("/api/billing/portal", { method: "POST", credentials: "include" });
  return parseOrThrow(res);
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const res = await fetch("/api/admin/stats", { credentials: "include" });
  return parseOrThrow(res);
}
