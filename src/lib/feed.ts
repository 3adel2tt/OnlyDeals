import type { FeedPayload, FeedProvenance, Offer } from "../types";

/**
 * Feed reader — the ONLY way offers enter the public site.
 *
 * Resolution order:
 *   1. FEED_URL — the DB-backed feed served by the feed service
 *      (set this to e.g. https://deals.your-domain.com/onlydeals.json)
 *   2. local ingest store — what the control room's "push test" wrote (demo path)
 *   3. nothing — the board shows an honest "waiting for first n8n sync" state.
 *
 * There is deliberately NO bundled seed: the board only ever shows real
 * offers produced by the n8n pipeline.
 */

export const FEED_URL: string | null = null;

const LOCAL_KEY = "onlydeals:feed:v2";
const REMOTE_TIMEOUT_MS = 6000;

export interface FeedResult {
  payload: FeedPayload;
  provenance: FeedProvenance;
  fetchedAt: number;
}

function looksLikePayload(x: unknown): x is FeedPayload {
  const p = x as FeedPayload;
  return (
    !!p &&
    typeof p === "object" &&
    Array.isArray(p.offers) &&
    Array.isArray(p.sources) &&
    typeof p.generatedAt === "string"
  );
}

/** An honest empty feed — no bundled offers. */
function emptyFeed(): FeedPayload {
  return {
    version: "offer.v1",
    generatedAt: new Date().toISOString(),
    generator: "none",
    sources: [],
    offers: [],
  };
}

/** Payload the control room pushes to simulate the ingest endpoint. */
export function testPushPayload(): FeedPayload {
  const now = new Date();
  const offers: Offer[] = [
    {
      id: "test-push-1",
      merchant: "Acme Coffee",
      headline: "Buy one get one free — pushed from the control room to test the board",
      discountLabel: "1+1 FREE",
      value: 50,
      kind: "bogo",
      category: "coffee",
      bank: "Test Bank",
      card: "Test Card",
      image: "",
      cards: ["Test Card"],
      link: "#",
      expiresAt: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
      terms: ["Pushed via the control room to simulate an n8n ingest."],
    },
    {
      id: "test-push-2",
      merchant: "Acme Electronics",
      headline: "15% off — a second sample so the grid has something to lay out",
      discountLabel: "−15%",
      value: 15,
      kind: "percent",
      category: "electronics",
      bank: "Test Bank",
      card: "Test Card",
      image: "",
      cards: ["Test Card"],
      link: "#",
      expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
      terms: ["Pushed via the control room to simulate an n8n ingest."],
    },
  ];
  return {
    version: "offer.v1",
    generatedAt: now.toISOString(),
    generator: "n8n:onlydeals-test",
    sources: [
      {
        id: "test-push",
        name: "Control-room push",
        status: "live",
        count: offers.length,
        note: "simulated ingest payload",
        at: now.getTime(),
      },
    ],
    offers,
  };
}

export function pushLocalFeed(payload: FeedPayload): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch {
    /* storage full / private mode */
  }
}

export function readLocalFeed(): FeedPayload | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    return looksLikePayload(p) ? p : null;
  } catch {
    return null;
  }
}

export function clearLocalFeed(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

/** Load the feed with the documented resolution order. Always resolves. */
export async function loadFeed(): Promise<FeedResult> {
  if (FEED_URL) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), REMOTE_TIMEOUT_MS);
      const res = await fetch(FEED_URL, { signal: ctrl.signal, cache: "no-store" });
      window.clearTimeout(timer);
      if (res.ok) {
        const p = (await res.json()) as unknown;
        if (looksLikePayload(p)) {
          return { payload: p, provenance: "remote", fetchedAt: Date.now() };
        }
      }
    } catch {
      /* fall through to local */
    }
  }

  const local = readLocalFeed();
  if (local) return { payload: local, provenance: "local", fetchedAt: Date.now() };

  return { payload: emptyFeed(), provenance: "bundled", fetchedAt: Date.now() };
}

export const PROVENANCE_NOTE: Record<FeedProvenance, string> = {
  remote: "live feed · pulled from the DB-backed n8n feed",
  local: "local ingest store · pushed from the control room",
  bundled: "no feed yet · waiting for first n8n sync",
};
