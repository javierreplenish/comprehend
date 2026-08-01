export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  profilePic: string;
  plan: string;
}

const USER_KEY = "comprehend_user";
const TOKEN_KEY = "comprehend_token";

export function saveSession(user: AuthUser, token?: string) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

// Every fetch that needs auth should use this instead of bare fetch.
// Sends the session cookie (desktop) AND the Bearer token (mobile Safari fallback).
export function authFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return fetch(input, { ...init, credentials: "include", headers });
}

async function parseOrThrow(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await authFetch("/api/auth/me");
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      if (body.user) {
        saveSession(body.user, body.token);
        return body.user;
      }
    }
  } catch {}
  // Network/cookie failure — return cached user so UI stays stable
  try {
    const s = localStorage.getItem(USER_KEY);
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await parseOrThrow(res);
  saveSession(body.user, body.token);
  return body.user;
}

export async function signup(email: string, password: string, displayName?: string): Promise<AuthUser> {
  const res = await fetch("/api/auth/signup", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const body = await parseOrThrow(res);
  saveSession(body.user, body.token);
  return body.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  clearSession();
}
