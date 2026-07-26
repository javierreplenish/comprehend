import { useEffect, useState } from "react";
import {
  fetchTopicProgression,
  startArgumentSession,
  startAuditSession,
  respondToArgumentTurn,
  respondToAuditTurn,
  type ProtocolSession,
  type TopicProgression,
} from "../lib/api";
import ProtocolSessionUI from "./ProtocolSessionUI";

interface ProgressionPanelProps {
  topicId: number;
  topicLabel: string;
  masterySummary?: string; // the summaryText from the just-completed Mastery session
  onDone: () => void;
}

// ── ProgressionPanel ──
// Shown after a Mastery session completes. Displays the learner's Bloom tier
// and offers the next protocol (Argument or Audit) if they're ready for it.
// The learner can continue right away or return to Study Path — no pressure.

export default function ProgressionPanel({ topicId, topicLabel, masterySummary, onDone }: ProgressionPanelProps) {
  const [progression, setProgression] = useState<TopicProgression | null>(null);
  const [active, setActive] = useState<{ protocol: "argument" | "audit"; session: ProtocolSession } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTopicProgression(topicId).then(setProgression).catch(() => {});
  }, [topicId]);

  const launch = async (protocol: "argument" | "audit") => {
    setBusy(true);
    setError(null);
    try {
      const session = protocol === "argument"
        ? await startArgumentSession(topicId)
        : await startAuditSession(topicId);
      setActive({ protocol, session });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the session.");
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    const onRespond = active.protocol === "argument"
      ? (sid: number, tid: number, ans: string) => respondToArgumentTurn(sid, tid, ans)
      : (sid: number, tid: number, ans: string) => respondToAuditTurn(sid, tid, ans);
    return (
      <ProtocolSessionUI
        protocol={active.protocol}
        topicLabel={topicLabel}
        initial={active.session}
        onRespond={onRespond}
        onDone={onDone}
      />
    );
  }

  const bloomLabels: Record<number, { name: string; tagline: string }> = {
    1: { name: "Understand", tagline: "You can explain the idea." },
    2: { name: "Analyze", tagline: "You can evaluate how it's supported." },
    3: { name: "Evaluate", tagline: "You can inspect the reasoning itself." },
  };
  const tier = progression?.bloomTier ?? 1;
  const tierInfo = bloomLabels[tier];

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* Mastery completion banner */}
      <div className="banner banner--success" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>✓ Mastery complete</p>
        {masterySummary && <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>{masterySummary}</p>}
      </div>

      {/* Bloom tier badge */}
      {progression && (
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontWeight: 600, margin: "0 0 2px", fontSize: "0.9rem" }}>Depth level: {tierInfo.name}</p>
              <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)" }}>{tierInfo.tagline}</p>
            </div>
            <span style={{
              fontSize: "1.4rem", fontWeight: 700, color: "var(--accent)",
              fontVariantNumeric: "tabular-nums", lineHeight: 1,
            }}>{tier}/3</span>
          </div>
          {tier < 3 && (
            <div style={{ height: 2, background: "var(--bg-secondary)", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(tier / 3) * 100}%`, background: "var(--accent)", borderRadius: 2 }} />
            </div>
          )}
        </div>
      )}

      {/* Next protocol cards */}
      {error && <p className="error-text" style={{ marginBottom: "0.75rem" }}>{error}</p>}

      {progression?.argumentUnlocked && !progression.argumentCompleted && (
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <span className="path-row__card-tag">Argument — unlocked</span>
          <p style={{ fontWeight: 600, fontSize: "0.95rem", margin: "0 0 4px" }}>Evaluate how this idea is argued</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Walk through the Toulmin model: the claim, its evidence, the hidden assumption that bridges them (the warrant), how confident the claim should be, and what limits it.
          </p>
          <button type="button" className="btn btn--primary" style={{ fontSize: "0.8rem" }} onClick={() => launch("argument")} disabled={busy}>
            {busy ? "Opening…" : "Start Argument"}
          </button>
        </div>
      )}

      {progression?.argumentCompleted && !progression.auditUnlocked && (
        <div className="card" style={{ marginBottom: "0.75rem", opacity: 0.6 }}>
          <span className="path-row__card-tag">Audit — locked</span>
          <p style={{ fontWeight: 600, fontSize: "0.88rem", margin: 0 }}>Complete Argument to unlock reasoning inspection</p>
        </div>
      )}

      {progression?.auditUnlocked && !progression.auditCompleted && (
        <div className="card" style={{ marginBottom: "0.75rem" }}>
          <span className="path-row__card-tag">Audit — unlocked</span>
          <p style={{ fontWeight: 600, fontSize: "0.95rem", margin: "0 0 4px" }}>Inspect the reasoning itself</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "0 0 12px", lineHeight: 1.5 }}>
            Paul-Elder framework: examine the purpose, the question being asked, the hidden assumptions, whose viewpoint is missing, the evidence, the inference, and the consequences.
          </p>
          <button type="button" className="btn btn--primary" style={{ fontSize: "0.8rem" }} onClick={() => launch("audit")} disabled={busy}>
            {busy ? "Opening…" : "Start Audit"}
          </button>
        </div>
      )}

      {progression?.argumentCompleted && progression?.auditCompleted && (
        <div className="banner banner--success" style={{ marginBottom: "0.75rem" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>✓ Full depth reached on this concept</p>
          <p style={{ margin: "4px 0 0", fontSize: "0.8rem" }}>You've explained it, evaluated its argument, and inspected its reasoning. That's the complete critical thinking journey.</p>
        </div>
      )}

      <button type="button" className="btn btn--block" style={{ marginTop: "0.5rem" }} onClick={onDone}>
        Back to your path
      </button>
    </div>
  );
}
