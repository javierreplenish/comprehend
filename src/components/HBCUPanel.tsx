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

      {/* WHO — speak directly to the right person first */}
      <div style={{ textAlign: "center", padding: "2rem 0 1.5rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>For HBCU students and scholars of Black political thought</p>
        <h1 className="landing-hero-title">
          This is built for you<br />if you study Dr. Amos Wilson.
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", margin: "0 auto 28px", maxWidth: 480, lineHeight: 1.7 }}>
          If you're at an HBCU, in a Pan-African studies program, or studying Black psychology and liberation — you already know Wilson's work demands more than reading. It demands thinking. This is the tool built for that.
        </p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => document.getElementById("hbcu-auth")?.scrollIntoView({ behavior: "smooth" })}>
          Study Dr. Amos Wilson — free
        </button>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "12px 0 0" }}>No credit card. No trial. Just the library.</p>
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
          { label: "WHO", title: "Built for students who take Wilson seriously", desc: "If you've ever sat with Blueprint for Black Power and felt the weight of what it demands — not just to know it, but to think with it — this is for you. HBCU students, Pan-African scholars, anyone who believes understanding Black power means being able to argue it, not just recite it." },
          { label: "WHY", title: "Wilson's work was never meant to be summarized", desc: "He wrote to develop a quality of mind capable of navigating power. That kind of development doesn't happen through reading or highlighting. It happens through the struggle of explaining an idea under pressure, steelmanning the opposition, and applying the concept to conditions Wilson never named. That's what Comprehend puts you through." },
          { label: "WHAT", title: "Six of his major works, free, structured for critical study", desc: "Blueprint for Black Power. The Falsification of Afrikan Consciousness. Black-on-Black Violence. The Developmental Psychology of the Black Child. Awakening the Natural Genius of Black Children. Afrikan-Centered Consciousness Versus the New World Order. Every key concept in each book broken down and ready to study — no upload required." },
          { label: "HOW", title: "You write. The AI reads what you actually said.", desc: "No multiple choice. No flashcard flips. You write real answers in your own words and the engine judges whether you're thinking or reciting. If you quote Wilson back at it, it catches the overlap and asks you to think. If your reasoning holds, you advance. Every concept. Every chapter." },
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
