import type { FeedPayload, FeedProvenance, Offer, SourceOutcome } from "../types";
import { alrajhiSnapshot, SNAPSHOT_TAKEN } from "../data/alrajhiSnapshot";
import { daysFromNow } from "./format";

/**
 * The site never scrapes. It reads a feed produced by the n8n workflows:
 *
 *   1. FEED_URL — the merged offradar.json your ingest service publishes
 *      (set this to your server URL, e.g. https://offers.example.com/offradar.json)
 *   2. localStorage feed — what the admin's "push snapshot" writes, mirroring
 *      exactly what the ingest endpoint stores
 *   3. bundled seed — shipped with the app so the board is never empty
 */
export const FEED_URL: string | null = null;

const LOCAL_KEY = "offradar:feed:v2";

const IMG_ELECTRONICS =
  "https://image.qwenlm.ai/generated-images/b234c9bf-74b2-4f4e-9c88-280e71fea217/_result.png";

export function jarirSeed(): Offer[] {
  return [
    {
      id: "jr-1",
      merchant: "Jarir",
      headline: "15% off laptops and tablets on jarir.com with any linked bank card",
      discountLabel: "−15%",
      value: 15,
      kind: "percent",
      category: "electronics",
      bank: "Jarir",
      card: "All bank cards",
      image: IMG_ELECTRONICS,
      cards: ["All bank cards"],
      code: "JR-LAPTOP15",
      link: "https://www.jarir.com/sa-en/offers",
      expiresAt: daysFromNow(12),
      terms: [
        "Max discount SAR 300 per transaction.",
        "Valid on sold-and-shipped-by-Jarir items only.",
        "Cannot be combined with clearance pricing.",
      ],
    },
    {
      id: "jr-2",
      merchant: "Jarir",
      headline: "0% installments for 12 months on all smartphones above SAR 1,000",
      discountLabel: "0% ×12",
      value: 8,
      kind: "installments",
      category: "electronics",
      bank: "Jarir",
      card: "All credit cards",
      image: IMG_ELECTRONICS,
      cards: ["Visa", "Mastercard"],
      link: "https://www.jarir.com/sa-en/offers",
      expiresAt: daysFromNow(30),
      terms: ["Minimum order SAR 1,000.", "Issuing bank must support the installment plan."],
    },
    {
      id: "jr-3",
      merchant: "Jarir",
      headline: "25% off school and office supplies — back-to-school week",
      discountLabel: "−25%",
      value: 25,
      kind: "percent",
      category: "online",
      bank: "Jarir",
      card: "All bank cards",
      image: "",
      cards: ["All bank cards"],
      link: "https://www.jarir.com/sa-en/offers",
      expiresAt: daysFromNow(8),
      terms: ["Selected stationery and office SKUs only."],
    },
  ];
}

export function bundledFeed(): FeedPayload {
  const offers = alrajhiSnapshot();
  const at = SNAPSHOT_TAKEN;
  const sources: SourceOutcome[] = [
    {
      id: "alrajhi",
      name: "Al Rajhi Bank",
      status: "snapshot",
      count: offers.length,
      note: "bundled seed · awaiting first n8n sync",
      at,
    },
    { id: "jarir", name: "Jarir", status: "queued", count: 0, note: "workflow ready · not yet deployed", at },
  ];
  return {
    version: "offer.v1",
    generatedAt: new Date(at).toISOString(),
    generator: "bundled-seed",
    sources,
    offers,
  };
}

/** What the admin's "push snapshot" simulates n8n POSTing to ingest. */
export function testPushPayload(): FeedPayload {
  const now = Date.now();
  const alrajhi = alrajhiSnapshot();
  const jarir = jarirSeed();
  return {
    version: "offer.v1",
    generatedAt: new Date(now).toISOString(),
    generator: "admin-push",
    sources: [
      { id: "alrajhi", name: "Al Rajhi Bank", status: "live", count: alrajhi.length, note: `${alrajhi.length} offers · admin test push`, at: now },
      { id: "jarir", name: "Jarir", status: "live", count: jarir.length, note: `${jarir.length} offers · admin test push`, at: now },
    ],
    offers: [...alrajhi, ...jarir],
  };
}

function looksLikePayload(x: unknown): x is FeedPayload {
  return (
    !!x &&
    typeof x === "object" &&
    Array.isArray((x as FeedPayload).offers) &&
    Array.isArray((x as FeedPayload).sources)
  );
}

export function readLocalFeed(): FeedPayload | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return looksLikePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function pushLocalFeed(payload: FeedPayload): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable */
  }
}

export function clearLocalFeed(): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignore */
  }
}

export interface FeedResult {
  payload: FeedPayload;
  provenance: FeedProvenance;
  fetchedAt: number;
}

export async function loadFeed(): Promise<FeedResult> {
  if (FEED_URL) {
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(FEED_URL, { signal: ctrl.signal, cache: "no-store" });
      window.clearTimeout(t);
      if (res.ok) {
        const parsed: unknown = await res.json();
        if (looksLikePayload(parsed)) {
          return { payload: parsed, provenance: "remote", fetchedAt: Date.now() };
        }
      }
    } catch {
      /* fall through */
    }
  }
  const local = readLocalFeed();
  if (local) return { payload: local, provenance: "local", fetchedAt: Date.now() };
  return { payload: bundledFeed(), provenance: "bundled", fetchedAt: Date.now() };
}

export const PROVENANCE_NOTE: Record<FeedProvenance, string> = {
  remote: "feed synced from n8n ingest",
  local: "local feed · pushed from the control room",
  bundled: "bundled seed · connect the n8n feed to go live",
};
