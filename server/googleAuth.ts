import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db } from "./db";
import { publicUser } from "./auth";

// ── Google OAuth ──
// Students sign in with their university/school Google account in one click.
// On first login, we create an account using their Google name and email.
// On return, we find the existing account by email.
// No password stored — the Google token is the credential.
//
// Required env vars (set in Render):
//   GOOGLE_CLIENT_ID     — from Google Cloud Console → OAuth 2.0 Client
//   GOOGLE_CLIENT_SECRET — same
//   APP_URL              — e.g. https://comprehend.onrender.com (no trailing slash)
//
// Authorized redirect URI to add in Google Cloud Console:
//   https://comprehend.onrender.com/api/auth/google/callback

export function configureGoogleAuth(app: any) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    // Google OAuth not configured — button will redirect to /api/auth/google
    // which returns a 501. The button is still shown; the error is clear.
    app.get("/api/auth/google", (_req: any, res: any) => {
      res.status(501).json({ error: "Google sign-in is not configured on this server." });
    });
    return;
  }

  const baseUrl = (process.env.APP_URL ?? "http://localhost:8787").replace(/\/$/, "");

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${baseUrl}/api/auth/google/callback`,
    scope: ["profile", "email"],
  }, (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error("No email returned from Google."));

      const displayName = profile.displayName ?? email.split("@")[0];
      const existing = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
      if (existing) {
        // Update display_name from Google if not yet set
        if (!existing.display_name && displayName) {
          db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, existing.id);
          existing.display_name = displayName;
        }
        return done(null, existing);
      }
      // New user — create account without a password
      const info = db.prepare(
        "INSERT INTO users (email, password_hash, display_name) VALUES (?, '', ?)"
      ).run(email, displayName);
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
      // Count as a lifetime upload (0 used, free slot available)
      return done(null, user as any);
    } catch (err) {
      return done(err as Error);
    }
  }));

  (passport.serializeUser as any)((user: any, done: any) => done(null, user.id));
  (passport.deserializeUser as any)((id: any, done: any) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user ?? false);
  });

  app.use(passport.initialize());

  app.get("/api/auth/google", passport.authenticate("google"));

  app.get("/api/auth/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: "/?error=google_auth_failed" }),
    (req: any, res: any) => {
      if (!req.user) { res.redirect("/?error=google_auth_failed"); return; }
      // Wire into express-session (not passport session) for consistency
      req.session.userId = (req.user as any).id;
      res.redirect("/");
    }
  );
}
