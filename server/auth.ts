import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  profile_pic: string;
  plan: string;
  stripe_customer_id: string;
}

// The admin account always has pro entitlements - no self-checkout needed,
// and it can't regress if the database row is ever reset.
export function effectivePlan(user: Pick<UserRow, "email" | "plan">): string {
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (adminEmail && user.email.trim().toLowerCase() === adminEmail) return "pro";
  return user.plan;
}

export function publicUser(user: UserRow) {
  return { id: user.id, email: user.email, displayName: user.display_name, profilePic: user.profile_pic, plan: effectivePlan(user) };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

export async function signup(req: Request, res: Response) {
  const { email, password, displayName } = req.body as { email?: string; password?: string; displayName?: string };
  if (!email || !EMAIL_RE.test(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters." });
    return;
  }
  const name = (displayName ?? "").trim().slice(0, 60);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const info = db.prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)").run(email, passwordHash, name);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid) as UserRow;
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email?: string; password?: string };
  const user = email ? (db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined) : undefined;
  if (!user || !password || !(await bcrypt.compare(password, user.password_hash))) {
    res.status(401).json({ error: "Incorrect email or password." });
    return;
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
}

export function logout(req: Request, res: Response) {
  req.session.destroy(() => res.json({ success: true }));
}

export function me(req: Request, res: Response) {
  if (!req.session.userId) {
    res.json({ user: null });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.userId) as UserRow | undefined;
  res.json({ user: user ? publicUser(user) : null });
}
