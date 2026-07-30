import { useState } from "react";

interface AuthPanelProps {
  onLogin: (email: string, password: string) => Promise<unknown>;
  onSignup: (email: string, password: string, displayName?: string) => Promise<unknown>;
}

export default function AuthPanel({ onLogin, onSignup }: AuthPanelProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await onLogin(email, password);
      else await onSignup(email, password, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const authForm = (
    <div style={{ width: "100%", maxWidth: 380, margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      {mode === "signup" && (
        <input className="field-input" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="name" style={{ marginBottom: "0.6rem" }} />
      )}
      <input className="field-input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <input className="field-input" type="password" placeholder={mode === "signup" ? "Create a password" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn--primary btn--block btn--large" disabled={busy || !email || !password} onClick={submit}>
        {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.75rem 0 0.25rem" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>
        <a href="/api/auth/google" className="btn" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", width: "100%", textDecoration: "none", fontSize: "0.88rem", marginBottom: "0.5rem" }}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </a>
        <button type="button" className="btn--link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "Create a free account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );

  const phaseDemo = (
    <div className="landing-demo" style={{ background: "var(--bg-secondary)", borderRadius: 16, padding: "20px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>Mastery · How incentives shape behavior</span>
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

      {/* Hero — WHY first */}
      <div style={{ textAlign: "center", padding: "2rem 0 2.5rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>Built for students who want to actually think</p>
        <h1 className="landing-hero-title">
          Most students read.<br />Few actually understand.
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", margin: "0 auto 28px", maxWidth: 480, lineHeight: 1.7 }}>
          We believe understanding is earned, not downloaded. Comprehend exists for students who want to grasp ideas deeply enough to explain them, defend them, and use them — not just remember them long enough for the exam.
        </p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => document.getElementById("auth-section")?.scrollIntoView({ behavior: "smooth" })}>
          Start with your first book — free
        </button>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "12px 0 0" }}>No credit card required</p>
      </div>

      {/* Product visual */}
      <div style={{ padding: "0 0 2.5rem" }}>
        {phaseDemo}
      </div>

      {/* THE PROOF — parroting caught */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 20px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>What makes it different</p>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 14, padding: "20px", marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 12px", fontWeight: 600 }}>Here's what happens when you try to fake it:</p>
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Comprehend</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>In your own words, what is the author's core claim about how power sustains itself?</p>
          </div>
          <div style={{ background: "var(--panel)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Student</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>"The rulers of any social order must eventually secure the consent of the governed through institutions, ideology, and the shaping of what people believe to be natural."</p>
          </div>
          <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Comprehend</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>That's very close to the book's own wording. How would you explain this idea to someone who's never read it — in your words, from your angle?</p>
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "12px 0 0", textAlign: "center" }}>That's not a bug. That's the point.</p>
        </div>

        {/* Why → What → How */}
        {[
          { label: "WHY", title: "Reading isn't understanding", desc: "Highlighting, summarizing, and ChatGPT won't tell you whether you actually grasped the idea. Comprehend exists because we believe understanding has to be demonstrated — in your own words, under pressure." },
          { label: "WHAT", title: "A structured critical thinking workout on every concept", desc: "Upload your book. The AI finds the real arguments. Then five Socratic stages: Clarify the idea, Probe the mechanism, Counter the strongest objection, Apply it somewhere new, Synthesize everything. You don't advance until you've earned it." },
          { label: "HOW", title: "Write, don't click", desc: "No multiple choice. No flashcard flips. You write real answers and the AI reads what you actually said — checking for genuine reasoning, not keyword matches. If you quote the book, it catches you. If your argument is weak, it narrows the question. If your reasoning is strong, it advances you." },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
            <div style={{ width: 36, flexShrink: 0, paddingTop: 2 }}>
              <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--muted)", background: "var(--bg-secondary)", padding: "2px 6px", borderRadius: 4 }}>{item.label}</span>
            </div>
            <div style={{ flex: 1, background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 20px" }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{item.title}</p>
              <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 20px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>Built for depth, not speed</p>
        <div className="landing-comparison-grid">
          <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 18px" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 4px" }}>Other tools optimize for</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>Coverage</p>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "6px 0 0" }}>How many cards can you get through?</p>
          </div>
          <div style={{ background: "var(--bg-secondary)", borderRadius: 12, padding: "16px 18px", border: "2px solid #0d0d0d" }}>
            <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: "0 0 4px" }}>Comprehend optimizes for</p>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>Depth</p>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "6px 0 0" }}>Can you explain, challenge, and use the idea?</p>
          </div>
        </div>
      </div>

      {/* CTA + Auth */}
      <div id="auth-section" style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0", textAlign: "center" }}>
        <h2 className="landing-cta-title">Ideas are only useful if you can think with them.</h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: "0 0 28px" }}>Your first book is free. No credit card required.</p>
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
