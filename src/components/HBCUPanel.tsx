import { useState } from "react";

interface HBCUPanelProps {
  onLogin: (email: string, password: string) => Promise<unknown>;
  onSignup: (email: string, password: string, displayName?: string) => Promise<unknown>;
}

// Dr. Amos Wilson's major works — the complete critical thinking library.
// Each book is processed and ready to study the moment you sign up.
const CANON = [
  { title: "Blueprint for Black Power", author: "Dr. Amos Wilson" },
  { title: "The Falsification of Afrikan Consciousness", author: "Dr. Amos Wilson" },
  { title: "Black-on-Black Violence", author: "Dr. Amos Wilson" },
  { title: "Afrikan-Centered Consciousness Versus the New World Order", author: "Dr. Amos Wilson" },
  { title: "The Developmental Psychology of the Black Child", author: "Dr. Amos Wilson" },
  { title: "Awakening the Natural Genius of Black Children", author: "Dr. Amos Wilson" },
];

export default function HBCUPanel({ onLogin, onSignup }: HBCUPanelProps) {
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

  return (
    <div className="landing-wrap">
      {/* Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 0 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#0d0d0d" }} />
          <span style={{ fontWeight: 600, fontSize: "1rem", letterSpacing: "-0.02em" }}>Comprehend</span>
        </div>
        <button type="button" className="btn--ghost" onClick={() => { setMode("login"); document.getElementById("hbcu-auth")?.scrollIntoView({ behavior: "smooth" }); }}>
          Sign in
        </button>
      </div>

      {/* Hero */}
      <div style={{ textAlign: "center", padding: "2rem 0 2.5rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>The Dr. Amos Wilson Critical Thinking Library</p>
        <h1 className="landing-hero-title">
          Dr. Amos Wilson didn't write<br />for you to summarize and forget.
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", margin: "0 auto 28px", maxWidth: 480, lineHeight: 1.7 }}>
          His work demands that you think — about power, consciousness, and how ideas become action. Comprehend turns every concept in his books into a structured critical thinking workout, until you can explain it, challenge it, and use it.
        </p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => document.getElementById("hbcu-auth")?.scrollIntoView({ behavior: "smooth" })}>
          Study Dr. Amos Wilson — free
        </button>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "12px 0 0" }}>No credit card required</p>
      </div>

      {/* The canon */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 16px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>The complete Dr. Amos Wilson library — free</p>
        <div style={{ display: "grid", gap: "0.6rem", marginBottom: "1.5rem" }}>
          {CANON.map((book) => (
            <div key={book.title} style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0 0 2px" }}>{book.title}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0 }}>{book.author}</p>
              </div>
              <span style={{ fontSize: "0.68rem", color: "var(--success)", fontWeight: 600, background: "var(--success-soft)", padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>Ready</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", textAlign: "center", lineHeight: 1.6 }}>
          Upload your own reading too — any PDF, EPUB, or screenshots of pages. The Wilson library is always free.
        </p>
      </div>

      {/* Why → What → How */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        {[
          { label: "WHY", title: "Dr. Wilson wrote to develop minds, not just inform them", desc: "His work isn't meant to be absorbed — it's meant to be used. Understanding Black psychology, power, and consciousness at the level he demands requires the ability to explain ideas, stress-test them, and apply them to real conditions. That's exactly what Comprehend trains." },
          { label: "WHAT", title: "A structured dialogue on every concept in your reading", desc: "Comprehend finds the ideas that actually matter in your assigned texts. Then it walks you through each one: explain it in your own words, probe what's underneath it, steelman the counterargument, apply it to something real, synthesize what you learned." },
          { label: "HOW", title: "You write. The AI reads what you actually said.", desc: "No multiple choice. No highlighting. You write real answers and the engine judges whether you're thinking or just reciting. If you quote the text back at it, it catches the overlap and asks you to think. If your reasoning holds, you advance." },
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

      {/* Auth form */}
      <div id="hbcu-auth" style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1rem", margin: "0 0 6px" }}>
          {mode === "signup" ? "Start studying" : "Welcome back"}
        </p>
        <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 20px" }}>
          {mode === "signup" ? "Your first book is free." : "Sign in to continue."}
        </p>
        <div style={{ width: "100%", maxWidth: 380, margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {mode === "signup" && (
            <input className="field-input" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoComplete="name" />
          )}
          <input className="field-input" type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          <input className="field-input" type="password" placeholder={mode === "signup" ? "Create a password" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn--primary btn--block btn--large" disabled={busy || !email || !password} onClick={submit}>
            {busy ? "…" : mode === "signup" ? "Create account" : "Sign in"}
          </button>
          <div style={{ textAlign: "center", marginTop: "0.25rem" }}>
            <button type="button" className="btn--link" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Create a free account" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--border)", padding: "1.5rem 0", textAlign: "center" }}>
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>Built by BYVL LLC · <a href="/" style={{ color: "var(--muted)" }}>Main site</a></p>
      </div>
    </div>
  );
}
