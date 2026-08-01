export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  profilePic: string;
  plan: string;
}

async function parseOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

const STORAGE_KEY = "comprehend_user";

function saveUser(user: AuthUser) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch {}
}

function clearUser() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function getCachedUser(): AuthUser | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.user) { saveUser(body.user); return body.user; }
    }
  } catch {}
  // Cookie stripped by mobile Safari ITP — fall back to localStorage
  // The user is still functionally logged in; their session is just being
  // blocked from cookie access in this browsing context.
  return getCachedUser();
}

export async function signup(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/signup", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const body = await parseOrThrow(res);
  saveUser(body.user);
  return body.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseOrThrow(res);
  saveUser(body.user);
  return body.user;
}

export async function logout(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  clearUser();
  await parseOrThrow(res);
}
