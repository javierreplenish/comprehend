import { useEffect, useState } from "react";
import { fetchChapters, fetchTopics, synthesizeTopics, type ChapterSummary, type TopicSummary } from "../lib/api";

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
