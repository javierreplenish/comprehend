import { useState } from "react";
import { type ProtocolRespond, type ProtocolSession } from "../lib/api";

// ── STAGE METADATA ──
// Human-readable labels and what each stage is actually testing,
// shown to the learner as context for each phase.

const ARGUMENT_STAGE_META: Record<string, { label: string; description: string }> = {
  claim: { label: "The Claim", description: "What is the author actually asserting — the conclusion being advanced?" },
  grounds: { label: "The Grounds", description: "What evidence or data does the author use to support the claim?" },
  warrant: { label: "The Warrant", description: "What hidden assumption bridges the evidence to the claim? This is the key move — the unstated premise that makes the evidence 'count.'" },
  backing: { label: "The Backing", description: "What supports the warrant itself? Why should we accept that bridging assumption?" },
  qualifier: { label: "The Qualifier", description: "How broadly or confidently does the author make this claim? Does it admit exceptions?" },
  rebuttal: { label: "The Rebuttal", description: "What limitation, exception, or countercase does the argument acknowledge — or fail to?" },
};

const AUDIT_STAGE_META: Record<string, { label: string; description: string }> = {
  purpose: { label: "Purpose", description: "What is the author or thinker actually trying to achieve? What deeper aim shapes this reasoning?" },
  question: { label: "The Question", description: "What is the precise question being addressed? Is it the right question, or does it beg a prior one?" },
  assumptions: { label: "Assumptions", description: "What is being taken for granted but never stated? Which assumption is most questionable?" },
  viewpoint: { label: "Viewpoint", description: "Whose perspective anchors this reasoning? What perspective is absent — and what would it see differently?" },
  evidence: { label: "Evidence", description: "What specific information is the reasoning relying on? What does it actually show versus what the reasoner claims?" },
  inference: { label: "Inference", description: "How does the author move from evidence to conclusion? Does the conclusion actually follow, or does it overreach?" },
  consequences: { label: "Consequences", description: "If this reasoning is accepted and acted on, what follows — both acknowledged and unacknowledged?" },
};

const BLOOM_LABEL: Record<number, string> = {
  1: "Understand",
  2: "Analyze",
  3: "Evaluate",
};

interface ProtocolSessionUIProps {
  protocol: "argument" | "audit";
  topicLabel: string;
  initial: ProtocolSession;
  onRespond: (sessionId: number, turnId: number, answerText: string) => Promise<ProtocolRespond>;
  onDone: () => void;
}

export default function ProtocolSessionUI({ protocol, topicLabel, initial, onRespond, onDone }: ProtocolSessionUIProps) {
  const [sessionId] = useState(initial.sessionId);
  const [turnId, setTurnId] = useState(initial.turnId);
  const [stage, setStage] = useState(initial.stage);
  const [questionText, setQuestionText] = useState(initial.questionText);
  const [introText, setIntroText] = useState<string | null>(initial.introText);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: "complete" | "incomplete"; text: string } | null>(null);
  const [completedStages, setCompletedStages] = useState<string[]>([]);

  const stageMeta = protocol === "argument" ? ARGUMENT_STAGE_META : AUDIT_STAGE_META;
  const meta = stageMeta[stage] ?? { label: stage, description: "" };
  const bloomTier = initial.bloomTier;

  const submit = async () => {
    if (!answer.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onRespond(sessionId, turnId, answer);
      if (result.action === "complete") {
        setCompletedStages((prev) => [...prev, stage]);
        setOutcome({ kind: "complete", text: result.summaryText });
      } else if (result.action === "incomplete") {
        setOutcome({ kind: "incomplete", text: result.supportiveText });
      } else {
        if (result.stage !== stage) setCompletedStages((prev) => [...prev, stage]);
        setTurnId(result.turnId);
        setStage(result.stage);
        setQuestionText(result.questionText);
        setIntroText(result.introText);
        setAnswer("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the answer.");
    } finally {
      setBusy(false);
    }
  };

  const protocolName = protocol === "argument" ? "Argument" : "Audit";
  const stageKeys = Object.keys(stageMeta);

  if (outcome) {
    return (
      <div className="card" style={{ marginTop: "1rem" }}>
        <span className="path-row__card-tag">{protocolName}</span>
        <div className={`banner ${outcome.kind === "complete" ? "banner--success" : "banner--muted"}`} style={{ marginBottom: "0.75rem" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{outcome.kind === "complete" ? `✓ ${protocolName} complete` : "Come back to this one"}</p>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>{outcome.text}</p>
        </div>
        <button type="button" className="btn btn--primary btn--block" onClick={onDone}>Back to your path</button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* Stage progress strip */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1rem", flexWrap: "wrap" }}>
        {stageKeys.map((s) => {
          const done = completedStages.includes(s);
          const active = s === stage;
          return (
            <span key={s} style={{
              fontSize: "0.68rem", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
              background: done ? "var(--accent)" : active ? "var(--bg-secondary)" : "transparent",
              color: done ? "#fff" : active ? "var(--text)" : "var(--muted)",
              border: `1px solid ${done ? "var(--accent)" : active ? "var(--border-strong)" : "var(--border)"}`,
              letterSpacing: "0.01em",
            }}>
              {stageMeta[s]?.label ?? s}
            </span>
          );
        })}
        <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--muted)", padding: "2px 6px", alignSelf: "center" }}>
          Bloom {bloomTier} · {BLOOM_LABEL[bloomTier]}
        </span>
      </div>

      <div className="card">
        <span className="path-row__card-tag">{protocolName} · {meta.label}</span>

        {introText && (
          <div className="banner banner--muted" style={{ marginBottom: "0.75rem" }}>
            <p style={{ margin: 0, fontSize: "0.82rem" }}>{introText}</p>
          </div>
        )}

        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 6px", lineHeight: 1.5 }}>{meta.description}</p>
        <p style={{ fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.55, margin: "0 0 12px" }}>{questionText}</p>

        <textarea
          className="field-textarea"
          rows={4}
          placeholder={`Your answer to the ${meta.label.toLowerCase()} question…`}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={busy}
        />
        {error && <p className="error-text" style={{ marginTop: "0.5rem" }}>{error}</p>}
        <button
          type="button"
          className="btn btn--primary btn--block"
          style={{ marginTop: "0.75rem" }}
          onClick={submit}
          disabled={busy || !answer.trim()}
        >
          {busy ? "…" : "Submit"}
        </button>
      </div>

      <p style={{ fontSize: "0.7rem", color: "var(--muted)", textAlign: "center", margin: "0.6rem 0 0" }}>
        {protocolName === "Argument" ? "Toulmin model · Claim → Warrant → Rebuttal" : "Paul-Elder · Purpose → Inference → Consequences"}
      </p>
    </div>
  );
}
