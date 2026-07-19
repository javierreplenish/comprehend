import { useEffect, useRef, useState } from "react";
import { fetchBooks, uploadBook, createCheckoutSession, type BookSummary } from "../lib/api";

interface LibraryProps {
  onOpenBook: (bookId: number) => void;
  userPlan: string;
}

export default function Library({ onOpenBook, userPlan }: LibraryProps) {
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    fetchBooks()
      .then(setBooks)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load your library."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadStatus("Extracting text and identifying chapters — this can take 15-30 seconds for a full book…");
    try {
      await uploadBook(file);
      setUploadStatus(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploadStatus(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="app-body">
      <h1 style={{ fontSize: "1.05rem", margin: "0 0 0.75rem" }}>Your library</h1>

      <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", padding: "1.25rem", marginBottom: "1rem" }}>
        {books.length >= 2 && userPlan !== "pro" ? (
          <>
            <p style={{ margin: 0, fontSize: "0.88rem", textAlign: "center", fontWeight: 600 }}>You've reached the free limit</p>
            <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-secondary)", textAlign: "center" }}>Free accounts can study up to 2 books. Upgrade to add unlimited books.</p>
            <button type="button" className="btn btn--primary btn--large" onClick={async () => {
              try {
                const { url } = await createCheckoutSession();
                if (url) window.location.href = url;
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not start checkout.");
              }
            }}>Upgrade — $9.99/mo</button>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: "0.88rem", textAlign: "center" }}>Upload a book, article, or textbook to start studying</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--muted)", textAlign: "center" }}>PDF or plain text — typed documents only, no scans</p>
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" onChange={handleFileSelected} style={{ display: "none" }} />
            <button type="button" className="btn btn--primary btn--large" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "Processing…" : "Upload a file"}
            </button>
          </>
        )}
      </div>

      {uploadStatus && (
        <div className="banner banner--muted" style={{ marginBottom: "0.75rem" }}>
          {uploadStatus}
        </div>
      )}

      {error && <p className="error-text" style={{ marginBottom: "0.75rem" }}>{error}</p>}
      {loading && <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Loading…</p>}

      {!loading && books.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem 0", color: "var(--muted)" }}>
          <p style={{ fontSize: "0.9rem", margin: "0 0 0.25rem" }}>No books yet</p>
          <p style={{ fontSize: "0.78rem", margin: 0 }}>Upload your first book to start studying.</p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {books.map((book) => {
          const pct = book.totalTopics ? Math.round((book.masteredTopics / book.totalTopics) * 100) : 0;
          return (
            <button
              key={book.id}
              type="button"
              className="card"
              style={{ textAlign: "left", cursor: "pointer", width: "100%", display: "block" }}
              onClick={() => onOpenBook(book.id)}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.95rem", margin: "0 0 2px" }}>{book.title}</p>
                  {book.author && <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: 0 }}>{book.author}</p>}
                </div>
                {book.totalTopics > 0 && (
                  <span style={{ fontSize: "0.82rem", fontWeight: 600, color: pct === 100 ? "var(--success)" : "var(--text-secondary)", flexShrink: 0 }}>
                    {pct}%
                  </span>
                )}
              </div>
              {book.totalTopics > 0 && (
                <div style={{ height: 3, background: "var(--bg-secondary)", borderRadius: 2, marginTop: 10, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "var(--success)" : "var(--accent)", borderRadius: 2, transition: "width 300ms ease" }} />
                </div>
              )}
              {book.totalTopics === 0 && book.status === "ready" && (
                <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "6px 0 0" }}>No topics synthesized yet</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
