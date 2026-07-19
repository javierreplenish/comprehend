import { useState } from "react";
import AdminDashboard from "./components/AdminDashboard";
import AuthPanel from "./components/AuthPanel";
import FlashcardLab from "./components/FlashcardLab";
import Library from "./components/Library";
import ProfilePage from "./components/ProfilePage";
import Session from "./components/Session";
import StudyPath from "./components/StudyPath";
import { useAuth } from "./hooks/useAuth";
import type { AuthUser } from "./lib/auth";

type View =
  | { name: "library" }
  | { name: "path"; bookId: number }
  | { name: "session"; topicId: number; bookId: number }
  | { name: "flashcards"; chapterId: number; chapterTitle: string; bookId: number }
  | { name: "profile" }
  | { name: "admin" };

const ADMIN_EMAIL = "smithjavier500@gmail.com";

export default function App() {
  const { user, loading, login, signup, logout, setUser } = useAuth();
  const [view, setView] = useState<View>({ name: "library" });

  const goHome = () => setView({ name: "library" });

  if (loading) {
    return (
      <div className="app-shell">
        <div className="app-body">
          <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPanel onLogin={login} onSignup={signup} />;
  }

  const isAdmin = user.email === ADMIN_EMAIL;
  const initials = (user.displayName || user.email).slice(0, 2).toUpperCase();

  return (
    <div className="app-shell">
      <header className="app-header">
        <button type="button" className="app-header__brand" onClick={goHome} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span className="app-header__logo" />
          Comprehend
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isAdmin && (
            <button type="button" className="btn--ghost" style={{ fontSize: "0.72rem" }} onClick={() => setView({ name: "admin" })}>
              Admin
            </button>
          )}
          <button
            type="button"
            onClick={() => setView({ name: "profile" })}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <span className="app-header__user-label" style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>{user.displayName || user.email}</span>
            <span
              style={{
                width: 30, height: 30, borderRadius: "50%",
                background: user.profilePic ? `url(${user.profilePic}) center/cover` : "var(--accent)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: "0.7rem", fontWeight: 600, flexShrink: 0,
              }}
            >
              {!user.profilePic && initials}
            </span>
          </button>
        </div>
      </header>

      {view.name === "library" && <Library onOpenBook={(bookId) => setView({ name: "path", bookId })} userPlan={user.plan} />}

      {view.name === "path" && (
        <StudyPath
          bookId={view.bookId}
          onBack={goHome}
          onReviewTopic={(topicId) => setView({ name: "session", topicId, bookId: view.bookId })}
          onOpenFlashcards={(chapterId, chapterTitle) => setView({ name: "flashcards", chapterId, chapterTitle, bookId: view.bookId })}
        />
      )}

      {view.name === "session" && (
        <Session topicId={view.topicId} onDone={() => setView({ name: "path", bookId: view.bookId })} onHome={goHome} />
      )}

      {view.name === "flashcards" && (
        <FlashcardLab chapterId={view.chapterId} chapterTitle={view.chapterTitle} onBack={() => setView({ name: "path", bookId: view.bookId })} />
      )}

      {view.name === "profile" && (
        <ProfilePage user={user} onBack={goHome} onLogout={logout} onUserUpdated={(updated) => setUser(updated)} />
      )}

      {view.name === "admin" && isAdmin && <AdminDashboard onBack={goHome} />}
    </div>
  );
}
