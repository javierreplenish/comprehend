import { useState } from "react";

interface AuthPanelProps {
  onLogin: (email: string, password: string) => Promise<unknown>;
  onSignup: (email: string, password: string) => Promise<unknown>;
}

export default function AuthPanel({ onLogin, onSignup }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await onLogin(email, password);
      else await onSignup(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const authForm = (
    <div style={{ width: "100%", maxWidth: 380, margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <input className="field-input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="field-input" type="password" placeholder={mode === "signup" ? "Create a password" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn--primary btn--block btn--large" disabled={busy || !email || !password} onClick={submit}>
        {busy ? "…" : mode === "signup" ? "Start comprehending" : "Sign in"}
      </button>
      <div style={{ textAlign: "center" }}>
        <button type="button" className="btn--link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Create a free account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );

  const phaseDemo = (
    <div className="landing-demo" style={{ background: "var(--bg-secondary)", borderRadius: 16, padding: "20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Session — How incentives shape behavior</span>
        <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>Ch. 4</span>
      </div>

      {/* Phase 1 — Completed */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
          <span style={{ background: "#10a37f", color: "#fff", fontSize: "0.6rem", fontWeight: 600, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          <span style={{ flex: 1, width: 1, background: "rgba(0,0,0,0.12)", marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, border: "1px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "10px 12px" }}>
          <span style={{ fontSize: "0.62rem", background: "var(--bg-secondary)", border: "1px solid rgba(0,0,0,0.08)", padding: "2px 6px", borderRadius: 4, color: "var(--text-secondary)" }}>Phase 1</span>
          <p style={{ fontWeight: 600, fontSize: "0.82rem", margin: "4px 0 4px" }}>Clarify</p>
          <div style={{ background: "rgba(16,163,127,0.08)", borderRadius: 6, padding: "6px 8px" }}>
            <p style={{ fontSize: "0.72rem", margin: 0, color: "#065f46", lineHeight: 1.5 }}>Incentives are external motivators — rewards or penalties that push people toward specific choices by changing what's at stake for them.</p>
          </div>
        </div>
      </div>

      {/* Phase 2 — Completed */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
          <span style={{ background: "#10a37f", color: "#fff", fontSize: "0.6rem", fontWeight: 600, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          <span style={{ flex: 1, width: 1, background: "rgba(0,0,0,0.12)", marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, border: "1px dashed rgba(0,0,0,0.12)", borderRadius: 10, padding: "10px 12px" }}>
          <span style={{ fontSize: "0.62rem", background: "var(--bg-secondary)", border: "1px solid rgba(0,0,0,0.08)", padding: "2px 6px", borderRadius: 4, color: "var(--text-secondary)" }}>Phase 2</span>
          <p style={{ fontWeight: 600, fontSize: "0.82rem", margin: "4px 0 4px" }}>Probe</p>
          <div style={{ background: "rgba(16,163,127,0.08)", borderRadius: 6, padding: "6px 8px" }}>
            <p style={{ fontSize: "0.72rem", margin: 0, color: "#065f46", lineHeight: 1.5 }}>The mechanism is cost-benefit reweighting — incentives don't create new desires, they shift the relative cost of options people already face.</p>
          </div>
        </div>
      </div>

      {/* Phase 3 — Active */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
          <span style={{ background: "#0d0d0d", color: "#fff", fontSize: "0.6rem", fontWeight: 600, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>3</span>
          <span style={{ flex: 1, width: 1, background: "rgba(0,0,0,0.12)", marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, border: "1px solid rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 12px" }}>
          <span style={{ fontSize: "0.62rem", background: "var(--bg-secondary)", border: "1px solid rgba(0,0,0,0.08)", padding: "2px 6px", borderRadius: 4, color: "var(--text-secondary)" }}>Phase 3</span>
          <p style={{ fontWeight: 600, fontSize: "0.82rem", margin: "4px 0 4px" }}>Counter</p>
          <p style={{ fontSize: "0.75rem", margin: "0 0 8px", color: "var(--text-secondary)", lineHeight: 1.5 }}>A critic might say financial incentives crowd out intrinsic motivation — people stop wanting to do things for their own sake once you pay them. What's the strongest response?</p>
          <div style={{ height: 44, border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6, background: "#fff", display: "flex", alignItems: "center", padding: "0 10px" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Write your answer…</span>
          </div>
        </div>
      </div>

      {/* Phase 4 — Locked */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10, opacity: 0.35 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
          <span style={{ background: "var(--bg-secondary)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--muted)", fontSize: "0.6rem", fontWeight: 600, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>4</span>
          <span style={{ flex: 1, width: 1, background: "rgba(0,0,0,0.08)", marginTop: 4 }} />
        </div>
        <div style={{ flex: 1, border: "1px dashed rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px" }}>
          <p style={{ fontWeight: 600, fontSize: "0.82rem", margin: "0 0 2px" }}>Apply</p>
          <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: 0 }}>Apply it to a novel case</p>
        </div>
      </div>

      {/* Phase 5 — Locked */}
      <div style={{ display: "flex", gap: 10, opacity: 0.35 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20, flexShrink: 0 }}>
          <span style={{ background: "var(--bg-secondary)", border: "1px solid rgba(0,0,0,0.08)", color: "var(--muted)", fontSize: "0.6rem", fontWeight: 600, width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center" }}>5</span>
        </div>
        <div style={{ flex: 1, border: "1px dashed rgba(0,0,0,0.08)", borderRadius: 10, padding: "10px 12px" }}>
          <p style={{ fontWeight: 600, fontSize: "0.82rem", margin: "0 0 2px" }}>Synthesize</p>
          <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: 0 }}>Restate incorporating everything</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="landing-wrap">
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#0d0d0d" }} />
          <span style={{ fontWeight: 600, fontSize: "1rem", letterSpacing: "-0.02em" }}>Comprehend</span>
        </div>
        <button type="button" className="btn--ghost" onClick={() => { setMode("login"); document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" }); }}>
          Sign in
        </button>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "2rem 0 2.5rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Study tool for critical thinkers</p>
        <h1 className="landing-hero-title">
          Read books.<br />Actually understand them.
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", margin: "0 auto 28px", maxWidth: 440, lineHeight: 1.7 }}>
          Upload any book. AI surfaces the real ideas. Then five stages of Socratic dialogue push your understanding until you've genuinely earned each concept.
        </p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" })}>
          Start comprehending
        </button>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "12px 0 0" }}>Free for your first 2 books</p>
      </div>

      {/* Product visual */}
      <div style={{ padding: "0 0 2.5rem" }}>
        {phaseDemo}
      </div>

      {/* How it works */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 20px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>How it works</p>

        {[
          { num: "1", title: "Upload your book", desc: "PDF or text. The AI reads it and identifies chapters and the key ideas the author argues — not trivia, real concepts." },
          { num: "2", title: "Write, don't click", desc: "No multiple choice, no flashcard flips. You write your understanding in your own words. The AI reads what you actually wrote and responds to it." },
          { num: "3", title: "Five phases of pushback", desc: "Clarify, probe, counterargument, application, synthesis. Each phase tests a different angle. You can't shortcut it — understanding is earned, not assumed." },
        ].map((step, i) => (
          <div key={step.num} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
              <span style={{ background: "#0d0d0d", color: "#fff", fontSize: "0.68rem", fontWeight: 600, width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>{step.num}</span>
              {i < 2 && <span style={{ flex: 1, width: 1, background: "rgba(0,0,0,0.15)", minHeight: 20, marginTop: 6 }} />}
            </div>
            <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 20px" }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{step.title}</p>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{step.desc}</p>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24, flexShrink: 0 }}>
            <span style={{ background: "#10a37f", color: "#fff", fontSize: "0.68rem", fontWeight: 600, width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
          </div>
          <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 20px" }}>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Retain what you learned</p>
            <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>Spaced repetition brings concepts back at the right time. Struggling? It comes back sooner. Mastered it? It fades until you need a refresh.</p>
          </div>
        </div>
      </div>

      {/* Comparison */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 20px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>Not another flashcard app</p>
        <div className="landing-comparison-grid">
          <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 4px" }}>Flashcards test</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>Recall</p>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "6px 0 0" }}>Can you recognize the answer?</p>
          </div>
          <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 18px", border: "2px solid #0d0d0d" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 4px" }}>Comprehend tests</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>Understanding</p>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "6px 0 0" }}>Can you explain, defend, and apply it?</p>
          </div>
        </div>
      </div>

      {/* CTA + Auth */}
      <div id="auth-section" style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0", textAlign: "center" }}>
        <h2 className="landing-cta-title">Stop memorizing. Start understanding.</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 28px" }}>Your first two books are free. No credit card required.</p>
        {authForm}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "1.25rem 0 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, background: "#0d0d0d" }} />
          <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Comprehend</span>
        </div>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Built by BYVL LLC</span>
      </div>
    </div>
  );
}
