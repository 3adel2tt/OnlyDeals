import type { FeedPayload, FeedProvenance, Offer, SourceOutcome } from "../types";
import { alrajhiSnapshot } from "../data/alrajhiSnapshot";

/**
 * Feed reader — the ONLY way offers enter the public site.
 *
 * Resolution order:
 *   1. FEED_URL — the merged onlydeals.json your ingest service publishes
 *      (set this to your server URL, e.g. https://offers.example.com/onlydeals.json)
 *   2. local ingest store — what the control room's "push test" wrote (demo path)
 *   3. bundled seed — shipped with the app so the board is never empty
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

/** The bundled seed presented in feed shape. */
export function bundledFeed(): FeedPayload {
  const offers = alrajhiSnapshot();
  const sources: SourceOutcome[] = [
    {
      id: "alrajhi",
      name: "Al Rajhi Bank",
      status: "snapshot",
      count: offers.length,
      note: "bundled seed · awaiting first n8n sync",
      at: Date.now(),
    },
    {
      id: "jarir",
      name: "Jarir",
      status: "queued",
      count: 0,
      note: "workflow ready · not run yet",
      at: Date.now(),
    },
  ];
  return {
    version: "offer.v1",
    generatedAt: new Date().toISOString(),
    generator: "bundled-seed",
    sources,
    offers,
  };
}

/** Payload the control room pushes to simulate the ingest endpoint. */
export function testPushPayload(): FeedPayload {
  const seed = bundledFeed();
  const now = new Date();
  const offers: Offer[] = seed.offers.map((o) => ({ ...o }));
  offers.push({
    id: "jarir-push-1",
    merchant: "Jarir",
    headline: "0% installments for 12 months — pushed from the control room",
    discountLabel: "0% ×12",
    value: 12,
    kind: "installments",
    category: "electronics",
    bank: "Jarir",
    card: "All bank cards",
    image: "",
    cards: ["All bank cards"],
    link: "https://www.jarir.com/sa-en/offers",
    expiresAt: new Date(now.getTime() + 20 * 86_400_000).toISOString(),
    terms: ["Pushed via the control room to simulate an n8n ingest."],
  });
  return {
    version: "offer.v1",
    generatedAt: now.toISOString(),
    generator: "n8n:onlydeals-test",
    sources: [
      ...seed.sources.map((s) => ({ ...s })),
      {
        id: "test-push",
        name: "Control-room push",
        status: "live",
        count: 1,
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

  return { payload: bundledFeed(), provenance: "bundled", fetchedAt: Date.now() };
}

export const PROVENANCE_NOTE: Record<FeedProvenance, string> = {
  remote: "live feed · pulled from the n8n ingest",
  local: "local ingest store · pushed from the control room",
  bundled: "bundled seed · connect the n8n feed to go live",
};
