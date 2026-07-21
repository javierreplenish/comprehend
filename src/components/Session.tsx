import { useEffect, useState } from "react";
import { abandonSession, checkActiveSession, fetchTopicSourceCards, respondToTurn, startSession, type ActiveSessionTurn, type Flashcard } from "../lib/api";
import { DIMENSION_ORDER, type Dimension } from "../types";
import NotesPanel from "./NotesPanel";

interface SessionProps {
  topicId: number;
  onDone: () => void;
  onHome: () => void;
}

interface PassageInfo { leadInText: string; sourcePassage: string; }
interface CompletionState { type: "complete" | "incomplete"; text: string; nextDueInDays: number; }
interface CompletedPhase { dimension: Dimension; question: string; answer: string; }

const DIMENSION_LABELS: Record<Dimension, string> = { clarify: "Clarify", probe: "Probe", counterargument: "Counter", application: "Apply", synthesis: "Synthesize" };
const PHASE_DESCRIPTIONS: Record<Dimension, string> = {
  clarify: "State the concept in your own words",
  probe: "Explain the mechanism underneath",
  counterargument: "Name and address the strongest objection",
  application: "Apply it to a case the book never gave you",
  synthesis: "Restate incorporating everything above",
};

export default function Session({ topicId, onDone, onHome }: SessionProps) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [turnId, setTurnId] = useState<number | null>(null);
  const [dimension, setDimension] = useState<Dimension | null>(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [questionText, setQuestionText] = useState("");
  const [introText, setIntroText] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [hintText, setHintText] = useState<string | null>(null);
  const [passage, setPassage] = useState<PassageInfo | null>(null);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [sourceCards, setSourceCards] = useState<Flashcard[]>([]);
  const [completedPhases, setCompletedPhases] = useState<CompletedPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resume state
  const [resumePrompt, setResumePrompt] = useState<{ sessionId: number; turns: ActiveSessionTurn[] } | null>(null);

  useEffect(() => {
    setLoading(true);
    checkActiveSession(topicId)
      .then(({ activeSession }) => {
        if (activeSession && activeSession.turns.length > 0) {
          setResumePrompt(activeSession);
          setLoading(false);
        } else {
          beginNewSession();
        }
      })
      .catch(() => beginNewSession());
  }, [topicId]);

  const beginNewSession = () => {
    setLoading(true);
    setResumePrompt(null);
    startSession(topicId)
      .then((result) => {
        setSessionId(result.sessionId);
        setTurnId(result.turnId);
        setDimension(result.dimension);
        setAttemptNumber(result.attemptNumber);
        setQuestionText(result.questionText);
        setIntroText(result.introText);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not start this session."))
      .finally(() => setLoading(false));
  };

  const resumeExistingSession = (active: { sessionId: number; turns: ActiveSessionTurn[] }) => {
    setResumePrompt(null);
    setSessionId(active.sessionId);

    // Reconstruct completed phases from the turn history
    const completed: CompletedPhase[] = [];
    const advancedDimensions = new Set<string>();

    for (const turn of active.turns) {
      if (turn.verdict === "advance" && turn.answer_text) {
        if (!advancedDimensions.has(turn.dimension)) {
          completed.push({ dimension: turn.dimension as Dimension, question: turn.question_text, answer: turn.answer_text });
          advancedDimensions.add(turn.dimension);
        }
      }
    }
    setCompletedPhases(completed);

    // Find the last unanswered turn (the current question)
    const lastTurn = active.turns[active.turns.length - 1];
    if (lastTurn) {
      setTurnId(lastTurn.id);
      setDimension(lastTurn.dimension as Dimension);
      setAttemptNumber(lastTurn.attempt_number);
      setQuestionText(lastTurn.question_text);
      if (lastTurn.passage_shown) {
        setPassage({ leadInText: lastTurn.question_text, sourcePassage: "" });
      }
    }
    setLoading(false);
  };

  const handleAbandonAndRestart = async (oldSessionId: number) => {
    setLoading(true);
    try {
      await abandonSession(oldSessionId);
      beginNewSession();
    } catch {
      beginNewSession();
    }
  };

  const resetForNextTurn = () => { setAnswerText(""); setHintText(null); setPassage(null); };

  const submitAnswer = async () => {
    if (!sessionId || !turnId || !answerText.trim()) return;
    setSubmitting(true); setError(null);
    try {
      const result = await respondToTurn(sessionId, turnId, { answerText });
      if (result.action === "ask_question") {
        const advanced = result.dimension !== dimension;
        if (advanced && dimension) setCompletedPhases((prev) => [...prev, { dimension, question: questionText, answer: answerText.trim() }]);
        setTurnId(result.turnId); setDimension(result.dimension); setAttemptNumber(result.attemptNumber);
        setQuestionText(result.questionText); setIntroText(result.introText); resetForNextTurn();
      } else if (result.action === "offer_passage") {
        setTurnId(result.turnId); setPassage({ leadInText: result.leadInText, sourcePassage: result.sourcePassage });
        setQuestionText(result.questionText); setAttemptNumber(1); setAnswerText(""); setHintText(null);
      } else if (result.action === "complete_session") {
        if (dimension) setCompletedPhases((prev) => [...prev, { dimension, question: questionText, answer: answerText.trim() }]);
        setCompletion({ type: "complete", text: result.summaryText, nextDueInDays: result.nextDueInDays });
      } else if (result.action === "mark_incomplete") {
        setCompletion({ type: "incomplete", text: result.supportiveText, nextDueInDays: result.nextDueInDays });
        fetchTopicSourceCards(topicId).then(setSourceCards).catch(() => {});
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not process your answer."); }
    finally { setSubmitting(false); }
  };

  const requestHint = async () => {
    if (!sessionId || !turnId) return;
    setSubmitting(true); setError(null);
    try {
      const result = await respondToTurn(sessionId, turnId, { hintRequested: true });
      if (result.action === "give_hint") setHintText(result.hintText);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not get a hint."); }
    finally { setSubmitting(false); }
  };

  const currentDimensionIndex = dimension ? DIMENSION_ORDER.indexOf(dimension) : -1;

  const renderPhaseCard = (dim: Dimension, phaseIndex: number, status: "completed" | "active" | "locked", question?: string, answer?: string) => {
    const isLast = phaseIndex === DIMENSION_ORDER.length - 1;
    return (
      <div key={dim + "-" + status} className="path-row">
        <div className="path-row__rail" style={{ paddingTop: phaseIndex === 0 ? "12px" : "0" }}>
          {phaseIndex > 0 && <span className="path-row__line" style={{ minHeight: "16px", marginBottom: "6px" }} />}
          <span className={status === "completed" ? "path-row__tag path-row__tag--complete" : status === "active" ? "path-row__tag" : "path-row__tag path-row__tag--muted"}>
            {status === "completed" ? "✓" : phaseIndex + 1}
          </span>
          {!isLast && status !== "locked" && <span className="path-row__line" />}
        </div>
        <div className="path-row__card card" style={{ opacity: status === "locked" ? 0.4 : 1, marginBottom: isLast && status === "locked" ? 0 : "14px" }}>
          <span className="path-row__card-tag">Phase {phaseIndex + 1}</span>
          <p style={{ fontWeight: 700, fontSize: "1rem", margin: "0 0 2px" }}>{DIMENSION_LABELS[dim]}</p>
          <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 8px" }}>{PHASE_DESCRIPTIONS[dim]}</p>
          {status === "completed" && (
            <>
              <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 4px", fontStyle: "italic" }}>"{question}"</p>
              <div style={{ background: "var(--success-soft)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginTop: "6px" }}>
                <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5, color: "#065f46" }}>{answer}</p>
              </div>
            </>
          )}
          {status === "active" && (
            <>
              {introText && <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 10px", lineHeight: 1.5 }}>{introText}</p>}
              {passage && (
                <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: "10px 12px", marginBottom: "10px" }}>
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 4px" }}>{passage.leadInText}</p>
                  <p style={{ fontSize: "0.82rem", fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>"{passage.sourcePassage}"</p>
                </div>
              )}
              <p style={{ fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.5, margin: "0 0 10px" }}>{questionText}</p>
              <textarea className="field-textarea" rows={4} placeholder="Write your answer…" value={answerText} onChange={(e) => setAnswerText(e.target.value)} disabled={submitting} />
              {hintText && <div className="banner banner--warning" style={{ marginTop: "0.6rem" }}><strong style={{ display: "block", marginBottom: "4px", fontSize: "0.82rem" }}>Hint</strong>{hintText}</div>}
              {error && <p className="error-text" style={{ marginTop: "0.5rem" }}>{error}</p>}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                <button type="button" className="btn" onClick={requestHint} disabled={submitting || Boolean(hintText)}>Hint</button>
                <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={submitAnswer} disabled={submitting || !answerText.trim()}>{submitting ? "…" : "Submit"}</button>
              </div>
              <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "8px 0 0", textAlign: "center" }}>Attempt {attemptNumber} of 3</p>
            </>
          )}
        </div>
      </div>
    );
  };

  // Resume prompt
  if (resumePrompt) {
    const advancedCount = new Set(resumePrompt.turns.filter((t) => t.verdict === "advance").map((t) => t.dimension)).size;
    return (
      <div className="app-body" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 8px" }}>Pick up where you left off?</h2>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: "0 0 24px", maxWidth: 360 }}>
          You have a session in progress — {advancedCount} of 5 phases completed.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", width: "100%", maxWidth: 280 }}>
          <button type="button" className="btn btn--primary btn--block btn--large" onClick={() => resumeExistingSession(resumePrompt)}>
            Continue where I left off
          </button>
          <button type="button" className="btn btn--block" onClick={() => handleAbandonAndRestart(resumePrompt.sessionId)}>
            Start fresh
          </button>
          <button type="button" className="btn--ghost" style={{ marginTop: "0.5rem" }} onClick={onDone}>
            Back to path
          </button>
        </div>
      </div>
    );
  }

  if (loading) return <div className="app-body"><p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Starting session…</p></div>;

  if (error && !dimension && !completion) {
    return <div className="app-body"><p className="error-text">{error}</p><button type="button" className="btn" onClick={onDone}>← Back</button></div>;
  }

  if (completion) {
    return (
      <div className="app-body">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Session complete</h2>
          <button type="button" className="btn--ghost" onClick={onDone}>Back to path</button>
        </div>
        {completedPhases.map((phase) => renderPhaseCard(phase.dimension, DIMENSION_ORDER.indexOf(phase.dimension), "completed", phase.question, phase.answer))}
        <div className={`banner ${completion.type === "complete" ? "banner--success" : "banner--muted"}`} style={{ marginTop: "0.5rem", marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{completion.type === "complete" ? "✓ Topic retained" : "Let's come back to this one"}</p>
          <p style={{ margin: "6px 0 0" }}>{completion.text}</p>
          <p style={{ margin: "8px 0 0", fontSize: "0.75rem", opacity: 0.8 }}>Suggested again in {completion.nextDueInDays} day{completion.nextDueInDays === 1 ? "" : "s"} — or study it again anytime.</p>
        </div>
        {completion.type === "incomplete" && sourceCards.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, margin: "0 0 8px" }}>Review the source material</p>
            {sourceCards.map((card) => (
              <div key={card.id} className="card" style={{ marginBottom: "0.5rem" }}>
                <p style={{ fontWeight: 600, fontSize: "0.85rem", margin: "0 0 4px" }}>{card.label}</p>
                <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "0 0 4px" }}>{card.source_locator}</p>
                <p style={{ fontSize: "0.82rem", margin: 0, lineHeight: 1.5 }}>{card.source_passage}</p>
              </div>
            ))}
          </div>
        )}
        <NotesPanel topicId={topicId} />
        <button type="button" className="btn btn--primary btn--block" style={{ marginTop: "0.75rem" }} onClick={onDone}>Back to your path</button>
      </div>
    );
  }

  return (
    <div className="app-body">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h2 style={{ fontSize: "1rem", margin: 0 }}>Session</h2>
        <button type="button" className="btn--ghost" onClick={onDone}>Exit</button>
      </div>
      {completedPhases.map((phase) => renderPhaseCard(phase.dimension, DIMENSION_ORDER.indexOf(phase.dimension), "completed", phase.question, phase.answer))}
      {dimension && renderPhaseCard(dimension, currentDimensionIndex, "active")}
      {DIMENSION_ORDER.slice(currentDimensionIndex + 1).map((dim) => renderPhaseCard(dim, DIMENSION_ORDER.indexOf(dim), "locked"))}
      <NotesPanel topicId={topicId} />
    </div>
  );
}
