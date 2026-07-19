import { useEffect, useState } from "react";
import { fetchAdminStats, type AdminStats } from "../lib/api";

interface AdminDashboardProps {
  onBack: () => void;
}

export default function AdminDashboard({ onBack }: AdminDashboardProps) {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminStats()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load admin data."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="app-body"><p style={{ color: "var(--muted)" }}>Loading admin data…</p></div>;
  if (error) return <div className="app-body"><p className="error-text">{error}</p><button className="btn" onClick={onBack}>Back</button></div>;
  if (!data) return null;

  const s = data.stats;

  return (
    <div className="app-body">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <h1 style={{ fontSize: "1.05rem", margin: 0 }}>Admin</h1>
        <button type="button" className="btn--ghost" onClick={onBack}>Back</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[
          { label: "Users", value: s.userCount },
          { label: "Pro users", value: s.proCount },
          { label: "Books uploaded", value: s.bookCount },
          { label: "Topics synthesized", value: s.topicCount },
          { label: "Sessions started", value: s.sessionCount },
          { label: "Sessions completed", value: s.completedSessions },
          { label: "Topics mastered", value: s.masteredTopics },
          { label: "Raw flashcards", value: s.conceptCount },
          { label: "Chapters", value: s.chapterCount },
        ].map((stat) => (
          <div key={stat.label} className="stat-card">
            <p className="stat-card__value" style={{ fontSize: "1.2rem" }}>{stat.value}</p>
            <p className="stat-card__label">{stat.label}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: "0.88rem", margin: "0 0 0.75rem", fontWeight: 600 }}>Recent users</h2>
      <div style={{ marginBottom: "1.5rem" }}>
        {data.recentUsers.map((user) => (
          <div key={user.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <p style={{ fontSize: "0.88rem", margin: "0 0 1px", fontWeight: 500 }}>{user.display_name || user.email}</p>
              {user.display_name && <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0 }}>{user.email}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 4,
                background: user.plan === "pro" ? "var(--success-soft)" : "var(--bg-secondary)",
                color: user.plan === "pro" ? "#065f46" : "var(--text-secondary)",
              }}>
                {user.plan}
              </span>
              <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "2px 0 0" }}>{new Date(user.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: "0.88rem", margin: "0 0 0.75rem", fontWeight: 600 }}>Recent books</h2>
      <div>
        {data.recentBooks.map((book) => (
          <div key={book.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <div>
              <p style={{ fontSize: "0.88rem", margin: "0 0 1px", fontWeight: 500 }}>{book.title}</p>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: 0 }}>{book.author ?? "Unknown author"}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", margin: 0 }}>{book.uploaded_by}</p>
              <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "2px 0 0" }}>{new Date(book.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
