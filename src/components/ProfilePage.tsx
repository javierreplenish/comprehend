import { useRef, useState } from "react";
import type { AuthUser } from "../lib/auth";
import { createCheckoutSession } from "../lib/api";

interface ProfilePageProps {
  user: AuthUser;
  onBack: () => void;
  onLogout: () => void;
  onUserUpdated: (user: AuthUser) => void;
}

export default function ProfilePage({ user, onBack, onLogout, onUserUpdated }: ProfilePageProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [email, setEmail] = useState(user.email);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = (displayName || email).slice(0, 2).toUpperCase();

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save.");
      onUserUpdated(body.user);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handlePicSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPic(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("profilePic", file);
      const res = await fetch("/api/auth/profile-pic", { method: "POST", credentials: "include", body: formData });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      onUserUpdated({ ...user, profilePic: body.profilePic });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload picture.");
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/delete-account", { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not delete account.");
      }
      onLogout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="app-body">
      <button type="button" className="btn--ghost" style={{ marginBottom: "0.75rem", padding: 0 }} onClick={onBack}>
        ← Back
      </button>

      <h1 style={{ fontSize: "1.05rem", margin: "0 0 1.25rem" }}>Account</h1>

      {/* Profile picture */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1.5rem" }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            background: user.profilePic ? `url(${user.profilePic}) center/cover` : "var(--accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "1.4rem",
            fontWeight: 600,
            marginBottom: "0.6rem",
            cursor: "pointer",
            border: "2px solid var(--border)",
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {!user.profilePic && initials}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePicSelected} style={{ display: "none" }} />
        <button type="button" className="btn--ghost" style={{ fontSize: "0.75rem" }} onClick={() => fileInputRef.current?.click()} disabled={uploadingPic}>
          {uploadingPic ? "Uploading…" : "Change photo"}
        </button>
      </div>

      {/* Profile fields */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginBottom: "0.75rem" }}>
        <div>
          <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Display name</label>
          <input className="field-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        </div>
        <div>
          <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Email</label>
          <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        {message && <p style={{ fontSize: "0.78rem", color: "var(--success)", margin: 0 }}>{message}</p>}
        {error && <p className="error-text">{error}</p>}

        <button type="button" className="btn btn--primary btn--block" onClick={handleSaveProfile} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      {/* Subscription / Payment */}
      <div className="card" style={{ marginBottom: "0.75rem" }}>
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Plan</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontWeight: 600, margin: "0 0 2px" }}>{user.plan === "pro" ? "Pro" : "Free"}</p>
            <p style={{ fontSize: "0.78rem", color: "var(--muted)", margin: 0 }}>{user.plan === "pro" ? "Unlimited books" : "2 books included"}</p>
          </div>
          {user.plan !== "pro" && (
            <button type="button" className="btn btn--primary" style={{ fontSize: "0.78rem" }} onClick={async () => {
              try {
                const { url } = await createCheckoutSession();
                if (url) window.location.href = url;
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not start checkout.");
              }
            }}>Upgrade — $9.99/mo</button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "0.75rem" }}>
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 4px" }}>Payment method</p>
        <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0 }}>No payment method on file</p>
        <button type="button" className="btn" style={{ marginTop: "0.5rem", fontSize: "0.78rem" }}>Add payment method</button>
      </div>

      {/* Sign out */}
      <button type="button" className="btn btn--block" onClick={onLogout} style={{ marginBottom: "1.25rem" }}>
        Sign out
      </button>

      {/* Danger zone */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
        <p style={{ fontSize: "0.78rem", fontWeight: 600, margin: "0 0 0.5rem", color: "var(--danger)" }}>Danger zone</p>
        {!confirmingDelete ? (
          <button type="button" className="btn" style={{ borderColor: "var(--danger)", color: "var(--danger)", fontSize: "0.78rem" }} onClick={() => setConfirmingDelete(true)}>
            Delete my account
          </button>
        ) : (
          <div>
            <p style={{ fontSize: "0.82rem", margin: "0 0 0.5rem" }}>This permanently deletes your account and all your study progress. This cannot be undone.</p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>Cancel</button>
              <button type="button" className="btn" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
