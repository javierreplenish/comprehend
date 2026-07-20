import { useState } from "react";
import { respondToBridgeChallenge, startBridgeChallenge, type BridgeStart } from "../lib/api";

interface BridgeChallengeProps {
  bookId: number;
}

// "Connections" — the cross-topic transfer challenge. Appears on Study Path
// once the learner has mastered topics in two different chapters. One
// pointed question relating two mastered ideas; three attempts; supportive
// ladder throughout.
export default function BridgeChallenge({ bookId }: BridgeChallengeProps) {
  const [bridge, setBridge] = useState<BridgeStart | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [answer, setAnswer] = useState("");
  const [outcome, setOutcome] = useState<{ kind: "complete" | "incomplete"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = async () => {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const b = await startBridgeChallenge(bookId);
      setBridge(b);
      setQuestionText(b.questionText);
      setAttemptNumber(b.attemptNumber);
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connection.");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!bridge) return;
    setBusy(true);
    setError(null);
    try {
      const result = await respondToBridgeChallenge(bridge.bridgeId, answer);
      if (result.action === "complete") {
        setOutcome({ kind: "complete", text: result.summaryText });
        setBridge(null);
      } else if (result.action === "incomplete") {
        setOutcome({ kind: "incomplete", text: result.supportiveText });
        setBridge(null);
      } else {
        setQuestionText(result.questionText);
        setAttemptNumber(result.attemptNumber);
        setAnswer("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not judge the answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <span className="path-row__card-tag">Connections</span>

      {!bridge && !outcome && (
        <>
          <p style={{ fontWeight: 600, fontSize: "0.95rem", margin: "0 0 4px" }}>Connect two ideas you've mastered</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Understanding ideas one at a time is the start. Seeing how they constrain, contradict, or complete each other is the skill. One question, two of your mastered ideas.
          </p>
          {error && <p className="error-text" style={{ margin: "0 0 8px" }}>{error}</p>}
          <button type="button" className="btn btn--primary" style={{ fontSize: "0.8rem" }} onClick={begin} disabled={busy}>
            {busy ? "Choosing a pair…" : "Take a connection"}
          </button>
        </>
      )}

      {bridge && (
        <>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 8px" }}>
            "{bridge.topicA}" × "{bridge.topicB}"
          </p>
          <p style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, margin: "0 0 10px" }}>{questionText}</p>
          <textarea
            className="field-textarea"
            rows={4}
            placeholder="How do these two ideas actually bear on each other?"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={busy}
          />
          {error && <p className="error-text" style={{ marginTop: "0.5rem" }}>{error}</p>}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.75rem" }}>
            <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={submit} disabled={busy || !answer.trim()}>
              {busy ? "…" : "Submit"}
            </button>
          </div>
          <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "8px 0 0", textAlign: "center" }}>Attempt {attemptNumber} of 3</p>
        </>
      )}

      {outcome && (
        <>
          <div className={`banner ${outcome.kind === "complete" ? "banner--success" : "banner--muted"}`} style={{ marginBottom: "0.75rem" }}>
            <p style={{ margin: 0, fontWeight: 600 }}>{outcome.kind === "complete" ? "✓ Connection made" : "Let's come back to this pair"}</p>
            <p style={{ margin: "6px 0 0" }}>{outcome.text}</p>
          </div>
          <button type="button" className="btn" style={{ fontSize: "0.8rem" }} onClick={begin} disabled={busy}>
            {busy ? "Choosing a pair…" : "Another connection"}
          </button>
        </>
      )}
    </div>
  );
}
