import { useEffect, useRef, useState } from "react";
import { fetchNote, saveNote } from "../lib/api";

interface NotesPanelProps {
  topicId: number;
}

// Freeform per-topic notes. Autosaves 800ms after the user stops typing;
// the "Saved" indicator confirms the write landed. Collapsed by default so
// it never competes with the dialogue for attention.
export default function NotesPanel({ topicId }: NotesPanelProps) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef("");

  useEffect(() => {
    setLoaded(false);
    setContent("");
    setSaveState("idle");
    fetchNote(topicId)
      .then(({ content }) => {
        setContent(content);
        latestRef.current = content;
        if (content.trim()) setOpen(true); // surface existing notes automatically
      })
      .catch(() => { /* fresh topic, no note yet */ })
      .finally(() => setLoaded(true));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [topicId]);

  const handleChange = (value: string) => {
    setContent(value);
    latestRef.current = value;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await saveNote(topicId, latestRef.current);
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 800);
  };

  return (
    <div className="card" style={{ marginTop: "0.75rem", padding: "0.9rem 1rem" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit" }}
      >
        <span style={{ fontWeight: 600, fontSize: "0.88rem" }}>My notes</span>
        <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {saveState === "saving" && <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Saving…</span>}
          {saveState === "saved" && <span style={{ fontSize: "0.72rem", color: "var(--success)" }}>Saved</span>}
          {saveState === "error" && <span className="error-text" style={{ fontSize: "0.72rem" }}>Couldn't save</span>}
          <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && (
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={loaded ? "Jot down connections, questions, or your own framing of this idea…" : "Loading…"}
          disabled={!loaded}
          rows={5}
          style={{
            width: "100%",
            marginTop: "0.6rem",
            padding: "0.6rem 0.7rem",
            fontSize: "0.85rem",
            fontFamily: "inherit",
            lineHeight: 1.5,
            border: "1px solid var(--border, #e0e0e0)",
            borderRadius: 8,
            resize: "vertical",
            background: "var(--bg-secondary)",
            color: "inherit",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}
