import type { StoredUser, User } from "../types";

/**
 * Local, browser-only auth. Accounts, hashes and sessions live in
 * localStorage and never leave the device — demo-grade on purpose.
 * The admin account only signs in via the /adminn control room.
 */

export const USERS_KEY = "onlydeals:users:v1";
export const SESSION_KEY = "onlydeals:session:v1";
const SALT = "offradar::v0.3::";

export const DEMO_ADMIN = { username: "admin", password: "admin123" };

function cyrb53(str: string): string {
  let h1 = 0xdeadbeef ^ 0x9e3779b9;
  let h2 = 0x41c6ce57 ^ 0x9e3779b9;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, "0") +
    (h1 >>> 0).toString(16).padStart(8, "0")
  );
}

function hashPassword(username: string, password: string): string {
  return cyrb53(SALT + username.toLowerCase() + "::" + password);
}

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function writeUsers(users: StoredUser[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch {
    /* private mode etc. */
  }
}

function toPublic(u: StoredUser): User {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
  };
}

/** Seeds the admin account on first run so the control room is usable out of the box. */
export function ensureSeeded(): void {
  const users = readUsers();
  if (users.length > 0) return;
  users.push({
    id: "u-admin",
    username: DEMO_ADMIN.username,
    displayName: "Deals Admin",
    role: "admin",
    createdAt: Date.now(),
    hash: hashPassword(DEMO_ADMIN.username, DEMO_ADMIN.password),
  });
  writeUsers(users);
}

export function getSession(): User | null {
  ensureSeeded();
  try {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    const u = readUsers().find((x) => x.id === id);
    return u ? toPublic(u) : null;
  } catch {
    return null;
  }
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string };

interface LoginOpts {
  /** Public site: admin accounts are not allowed here. */
  publicOnly?: boolean;
  /** Control room: only admin accounts are allowed. */
  requireAdmin?: boolean;
}

export function login(username: string, password: string, opts: LoginOpts = {}): AuthResult {
  ensureSeeded();
  const name = username.trim().toLowerCase();
  if (!name || !password) return { ok: false, error: "Enter both username and password." };
  const u = readUsers().find((x) => x.username.toLowerCase() === name);
  if (!u) return { ok: false, error: "No account found for that username." };
  if (u.hash !== hashPassword(u.username, password))
    return { ok: false, error: "Wrong password — try again." };
  if (opts.publicOnly && u.role === "admin")
    return { ok: false, error: "That account doesn't sign in here — it belongs to the control room." };
  if (opts.requireAdmin && u.role !== "admin")
    return { ok: false, error: "This area needs an admin account." };
  try {
    localStorage.setItem(SESSION_KEY, u.id);
  } catch {
    /* ignore */
  }
  return { ok: true, user: toPublic(u) };
}

export function signup(
  username: string,
  password: string,
  displayName: string,
): AuthResult {
  ensureSeeded();
  const name = username.trim().toLowerCase();
  if (name.length < 3) return { ok: false, error: "Username needs at least 3 characters." };
  if (!/^[a-z0-9_.-]+$/.test(name))
    return { ok: false, error: "Letters, numbers, dots and dashes only." };
  if (password.length < 6) return { ok: false, error: "Password needs at least 6 characters." };
  const users = readUsers();
  if (users.some((x) => x.username.toLowerCase() === name))
    return { ok: false, error: "That username is already taken." };
  const u: StoredUser = {
    id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    username: name,
    displayName: displayName.trim() || name,
    role: "member",
    createdAt: Date.now(),
    hash: hashPassword(name, password),
  };
  writeUsers([...users, u]);
  try {
    localStorage.setItem(SESSION_KEY, u.id);
  } catch {
    /* ignore */
  }
  return { ok: true, user: toPublic(u) };
}

export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
