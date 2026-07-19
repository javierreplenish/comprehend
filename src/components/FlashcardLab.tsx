import { useEffect, useState } from "react";
import { fetchFlashcards, type Flashcard } from "../lib/api";

interface FlashcardLabProps {
  chapterId: number;
  chapterTitle: string;
  onBack: () => void;
}

export default function FlashcardLab({ chapterId, chapterTitle, onBack }: FlashcardLabProps) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchFlashcards(chapterId)
      .then(setCards)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load flashcards."))
      .finally(() => setLoading(false));
  }, [chapterId]);

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(cards.length - 1, next)));
    setFlipped(false);
  };

  const card = cards[index];

  return (
    <div className="app-body">
      <button type="button" className="btn--ghost" style={{ marginBottom: "0.75rem", padding: 0 }} onClick={onBack}>
        ← Study path
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <h1 style={{ fontSize: "1rem", margin: 0 }}>{chapterTitle}</h1>
      </div>

      <div className="banner banner--muted" style={{ marginBottom: "1rem", fontSize: "0.78rem" }}>
        Quick recall only — flipping through these doesn't count toward retention. That only comes from a real study session.
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Loading…</p>}

      {!loading && cards.length === 0 && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No flashcards in this chapter yet.</p>}

      {!loading && card && (
        <>
          <div
            className="card"
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(event) => event.key === "Enter" && setFlipped((f) => !f)}
            style={{ minHeight: 220, display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer", textAlign: "center", padding: "1.5rem 1.25rem" }}
          >
            {!flipped ? (
              <>
                <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Question</p>
                <p style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                  {card.question || card.label}
                </p>
                <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "16px 0 0" }}>Tap to reveal answer</p>
              </>
            ) : (
              <>
                <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Answer</p>
                <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", margin: "0 0 8px" }}>{card.source_locator}</p>
                <p style={{ fontSize: "0.9rem", lineHeight: 1.6, margin: 0 }}>{card.source_passage}</p>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.9rem" }}>
            <button type="button" className="btn" onClick={() => goTo(index - 1)} disabled={index === 0}>
              ← Previous
            </button>
            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              {index + 1} / {cards.length}
            </span>
            <button type="button" className="btn" onClick={() => goTo(index + 1)} disabled={index === cards.length - 1}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
