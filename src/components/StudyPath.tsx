import { useEffect, useState } from "react";
import { fetchBookStatus, fetchBridgeEligibility, fetchChapters, fetchTopics, synthesizeTopics, type BookProcessingStatus, type ChapterSummary, type TopicSummary } from "../lib/api";
import BridgeChallenge from "./BridgeChallenge";

interface StudyPathProps {
  bookId: number;
  onBack: () => void;
  onReviewTopic: (topicId: number) => void;
  onOpenFlashcards: (chapterId: number, chapterTitle: string) => void;
}

export default function StudyPath({ bookId, onBack, onReviewTopic, onOpenFlashcards }: StudyPathProps) {
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [topicsByChapter, setTopicsByChapter] = useState<Record<number, TopicSummary[]>>({});
  const [expandedChapterId, setExpandedChapterId] = useState<number | null>(null);
  const [synthesizingChapterId, setSynthesizingChapterId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookStatus, setBookStatus] = useState<BookProcessingStatus | null>(null);
  const [bridgeEligible, setBridgeEligible] = useState(false);

  const load = () => {
    setLoading(true);
    fetchChapters(bookId)
      .then(async (chs) => {
        setChapters(chs);
        const entries = await Promise.all(chs.map(async (ch) => [ch.id, await fetchTopics(ch.id)] as const));
        setTopicsByChapter(Object.fromEntries(entries));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load this book."))
      .finally(() => setLoading(false));
  };

  useEffect(load, [bookId]);

  useEffect(() => {
    fetchBridgeEligibility(bookId).then(({ eligible }) => setBridgeEligible(eligible)).catch(() => {});
  }, [bookId, topicsByChapter]);

  // While the book is still processing, poll: refresh the chapter list as new
  // ones land, and drop the banner the moment the job finishes. Silent
  // reload (no spinner) so studying isn't interrupted by list refreshes.
  useEffect(() => {
    let stopped = false;
    let lastDone = -1;
    const tick = async () => {
      try {
        const status = await fetchBookStatus(bookId);
        if (stopped) return;
        setBookStatus(status);
        if (status.chunksDone !== lastDone) {
          lastDone = status.chunksDone;
          const chs = await fetchChapters(bookId);
          if (stopped) return;
          setChapters(chs);
          const entries = await Promise.all(chs.map(async (ch) => [ch.id, await fetchTopics(ch.id)] as const));
          if (!stopped) setTopicsByChapter(Object.fromEntries(entries));
        }
        return status.status === "processing";
      } catch {
        return false;
      }
    };
    const run = async () => {
      if (!(await tick())) return;
      const interval = setInterval(async () => {
        if (!(await tick())) clearInterval(interval);
      }, 4000);
      return () => clearInterval(interval);
    };
    const cleanup = run();
    return () => { stopped = true; void cleanup; };
  }, [bookId]);

  const handleSynthesize = async (chapterId: number) => {
    setSynthesizingChapterId(chapterId);
    setError(null);
    try {
      await synthesizeTopics(chapterId);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not synthesize topics for this chapter.");
    } finally {
      setSynthesizingChapterId(null);
    }
  };

  const allTopics = Object.values(topicsByChapter).flat();
  const totalTopics = allTopics.length;
  const masteredCount = allTopics.filter((t) => t.status === "mastered").length;
  const retainedPct = totalTopics ? Math.round((masteredCount / totalTopics) * 100) : 0;
  const now = new Date().toISOString();
  const suggestedCount = allTopics.filter((t) => t.status !== "mastered" || (t.next_due_at && t.next_due_at <= now)).length;

  return (
    <div className="app-body">
      <button type="button" className="btn--ghost" style={{ marginBottom: "0.75rem", padding: 0 }} onClick={onBack}>
        ← Library
      </button>

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Loading…</p>}

      {bookStatus?.status === "processing" && (
        <div className="banner banner--muted" style={{ marginBottom: "0.85rem" }}>
          <p style={{ margin: 0, fontWeight: 600, fontSize: "0.82rem" }}>Still processing the rest of this book</p>
          <p style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>You can start studying the chapters below — new ones appear automatically. {bookStatus.percent}% done.</p>
          <div style={{ height: 3, background: "rgba(0,0,0,0.06)", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${bookStatus.percent}%`, background: "var(--accent)", borderRadius: 2, transition: "width 600ms ease" }} />
          </div>
        </div>
      )}

      {bridgeEligible && <BridgeChallenge bookId={bookId} />}

      {!loading && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <p className="stat-card__value">{retainedPct}%</p>
              <p className="stat-card__label">Retained overall</p>
            </div>
            <div className="stat-card">
              <p className="stat-card__value" style={{ color: suggestedCount > 0 ? "var(--accent)" : "var(--success)" }}>
                {suggestedCount > 0 ? suggestedCount : "✓"}
              </p>
              <p className="stat-card__label">{suggestedCount > 0 ? "Suggested to review" : "All caught up"}</p>
            </div>
          </div>

          <p style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.02em", margin: "0 0 10px" }}>Your path</p>

          {chapters.map((chapter, index) => {
            const topics = topicsByChapter[chapter.id] ?? [];
            const chapterMastered = topics.filter((t) => t.status === "mastered").length;
            const isExpanded = expandedChapterId === chapter.id;
            const isSynthesizing = synthesizingChapterId === chapter.id;
            const allRetained = topics.length > 0 && chapterMastered === topics.length;
            return (
              <div key={chapter.id} className="path-row">
                <div className="path-row__rail">
                  <span className={allRetained ? "path-row__tag path-row__tag--complete" : "path-row__tag"}>
                    {allRetained ? "✓" : `Ch ${chapter.number}`}
                  </span>
                  {index < chapters.length - 1 && <span className="path-row__line" />}
                </div>
                <div className="path-row__card card">
                  <button
                    type="button"
                    onClick={() => setExpandedChapterId(isExpanded ? null : chapter.id)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                  >
                    <div>
                      <span className="path-row__card-tag">Ch {chapter.number}</span>
                      <p style={{ fontWeight: 700, fontSize: "1rem", margin: "0 0 2px" }}>{chapter.title}</p>
                      <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>
                        {!chapter.topics_synthesized
                          ? "Not synthesized yet"
                          : topics.length
                            ? `${chapterMastered} of ${topics.length} retained`
                            : "No topics"}
                        {allRetained ? " ✓" : ""}
                      </p>
                    </div>
                    <span style={{ fontSize: "1.2rem", color: "var(--muted)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}>▾</span>
                  </button>

                  {isExpanded && (
                    <div style={{ marginTop: "0.75rem" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
                        <button type="button" className="btn--ghost" style={{ fontSize: "0.72rem" }} onClick={() => onOpenFlashcards(chapter.id, chapter.title)}>
                          Flashcards
                        </button>
                      </div>

                      {!chapter.topics_synthesized ? (
                        <div>
                          <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 8px" }}>
                            Synthesize the actual ideas the author argues from this chapter's flashcards.
                          </p>
                          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            <button type="button" className="btn" style={{ fontSize: "0.78rem" }} onClick={() => onOpenFlashcards(chapter.id, chapter.title)}>
                              Review flashcards first
                            </button>
                            <button type="button" className="btn btn--primary" style={{ fontSize: "0.78rem" }} onClick={() => handleSynthesize(chapter.id)} disabled={isSynthesizing}>
                              {isSynthesizing ? "Synthesizing…" : "Synthesize topics"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        topics.map((topic) => {
                          const isDue = topic.status !== "mastered" || (topic.next_due_at && topic.next_due_at <= now);
                          return (
                            <div key={topic.id} className="path-row__concept-row">
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                                {topic.status === "mastered" && !isDue && (
                                  <span style={{ color: "var(--success)", fontSize: "0.85rem", flexShrink: 0 }}>✓</span>
                                )}
                                <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                                  <span style={{ fontSize: "0.85rem" }}>{topic.label}</span>
                                  {topic.status === "needs_revisit" && <span style={{ fontSize: "0.68rem", color: "var(--danger)" }}>Needs revisit</span>}
                                  {topic.status === "mastered" && isDue && <span style={{ fontSize: "0.68rem", color: "var(--warning)" }}>Due for review</span>}
                                </div>
                              </div>
                              <button
                                type="button"
                                className={isDue || topic.status !== "mastered" ? "btn btn--primary" : "btn"}
                                style={{ fontSize: "0.75rem", padding: "0.35rem 0.75rem", flexShrink: 0 }}
                                onClick={() => onReviewTopic(topic.id)}
                              >
                                {topic.status === "needs_revisit" ? "Revisit" : topic.status === "mastered" ? "Practice" : "Study"}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
