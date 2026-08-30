import type { User } from "../types";

/**
 * Client for the feed service (deploy/feed-service.mjs).
 * Auth rides on a signed httpOnly cookie — no tokens in JS.
 * /api/db/* calls need the x-api-key header (admin Control Room only).
 */

export type ApiResult = { ok: true; user: User } | { ok: false; error: string };

async function parse(r: Response): Promise<Record<string, unknown>> {
  try {
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toResult(r: Response, body: Record<string, unknown>): ApiResult {
  if (r.ok && body.user) return { ok: true, user: body.user as User };
  return { ok: false, error: (body.error as string) || `Request failed (HTTP ${r.status})` };
}

export async function apiRegister(
  email: string,
  password: string,
  displayName: string,
): Promise<ApiResult> {
  const r = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  return toResult(r, await parse(r));
}

export async function apiLogin(email: string, password: string): Promise<ApiResult> {
  const r = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return toResult(r, await parse(r));
}

export async function apiLogout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
}

export async function apiMe(): Promise<User | null> {
  try {
    const r = await fetch("/api/auth/me");
    if (!r.ok) return null;
    const body = await parse(r);
    return (body.user as User) ?? null;
  } catch {
    return null;
  }
}

/* ---------------- /api/db/* (x-api-key protected) ---------------- */

function dbHeaders(apiKey: string): HeadersInit {
  return { "x-api-key": apiKey, "Content-Type": "application/json" };
}

export async function dbGet<T>(apiKey: string, path: string): Promise<T> {
  const r = await fetch(`/api/db${path}`, { headers: dbHeaders(apiKey) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function dbPost<T>(apiKey: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(`/api/db${path}`, {
    method: "POST",
    headers: dbHeaders(apiKey),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) {
    const b = await parse(r);
    throw new Error((b.error as string) || `HTTP ${r.status}`);
  }
  return (await r.json()) as T;
}

export async function dbPut<T>(apiKey: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(`/api/db${path}`, {
    method: "PUT",
    headers: dbHeaders(apiKey),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

export async function dbDelete(apiKey: string, path: string): Promise<void> {
  const r = await fetch(`/api/db${path}`, { method: "DELETE", headers: dbHeaders(apiKey) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

/* ---------------- registry helpers ---------------- */

export interface Registry {
  base: string;
  /** id → webhook URL */
  webhooks: Record<string, string>;
  /** id → display name (so added sources keep their name across devices) */
  names?: Record<string, string>;
  /** id → paused; paused sources are skipped by triggers and the scheduler */
  disabled?: Record<string, boolean>;
}

export const DEFAULT_REGISTRY: Registry = {
  base: "https://n8n.onlydel.com",
  webhooks: {
    alrajhi: "https://n8n.onlydel.com/webhook/onlydeals-alrajhi",
    jarir: "https://n8n.onlydel.com/webhook/onlydeals-jarir",
  },
};
