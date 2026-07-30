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

      {/* Hero — WHO first, then WHY */}
      <div style={{ textAlign: "center", padding: "2rem 0 2.5rem" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>For HBCU students who want to actually think</p>
        <h1 className="landing-hero-title">
          Most students read.<br />Few actually understand.
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-secondary)", margin: "0 auto 28px", maxWidth: 480, lineHeight: 1.7 }}>
          We believe understanding is earned, not downloaded. Comprehend exists for students who want to grasp ideas deeply enough to explain them, defend them, and use them — not just remember them long enough for the exam.
        </p>
        <button type="button" className="btn btn--primary btn--large" onClick={() => document.getElementById("hbcu-auth")?.scrollIntoView({ behavior: "smooth" })}>
          Start with your first book — free
        </button>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: "12px 0 0" }}>No credit card required</p>
      </div>

      {/* Parroting proof */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 20px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>What makes it different</p>
        <div style={{ background: "var(--bg-secondary)", borderRadius: 14, padding: "20px", marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 12px", fontWeight: 600 }}>Here's what happens when you try to fake it:</p>
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Comprehend</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>In your own words, what is Wilson's core argument about why Black people must control their own institutions?</p>
          </div>
          <div style={{ background: "var(--panel)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Student</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>"Those who control the socialization of a child control the child, and those who control the child control the future."</p>
          </div>
          <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 12px" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Comprehend</p>
            <p style={{ fontSize: "0.85rem", margin: 0, lineHeight: 1.5 }}>That's Wilson's exact wording. What does that argument actually mean — in your words, from your angle?</p>
          </div>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "12px 0 0", textAlign: "center" }}>That's not a bug. That's the point.</p>
        </div>

        {/* Why → What → How */}
        {[
          { label: "WHY", title: "Reading isn't understanding", desc: "Highlighting, summarizing, and AI won't tell you whether you actually grasped the idea. Comprehend exists because we believe understanding has to be demonstrated — in your own words, under pressure." },
          { label: "WHAT", title: "A structured critical thinking workout on every concept", desc: "Upload your assigned reading — or start immediately with the Dr. Amos Wilson library, free. The AI finds the real arguments. Then five Socratic stages: Clarify the idea, Probe the mechanism, Counter the strongest objection, Apply it somewhere new, Synthesize everything. You don't advance until you've earned it." },
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

      {/* Wilson library */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 6px", textAlign: "center", letterSpacing: "0.06em", textTransform: "uppercase" }}>Start immediately</p>
        <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", textAlign: "center", margin: "0 0 16px", lineHeight: 1.5 }}>The Dr. Amos Wilson library is free and ready — no upload needed.</p>
        <div style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
          {CANON.map((book) => (
            <div key={book.title} style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: "0.88rem", margin: "0 0 2px" }}>{book.title}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0 }}>{book.author}</p>
              </div>
              <span style={{ fontSize: "0.68rem", color: "var(--success)", fontWeight: 600, background: "var(--success-soft)", padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>Free</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", textAlign: "center" }}>Or upload any book from your syllabus — PDF, EPUB, or screenshots.</p>
      </div>

      {/* Auth form */}
      <div id="hbcu-auth" style={{ borderTop: "1px solid var(--border)", padding: "2.5rem 0" }}>
        <p style={{ textAlign: "center", fontWeight: 600, fontSize: "1.1rem", margin: "0 0 6px" }}>
          {mode === "signup" ? "Create your account" : "Welcome back"}
        </p>
        <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0 0 20px" }}>
          {mode === "signup" ? "Your first book is free. No credit card." : "Sign in to continue."}
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
