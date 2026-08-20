import type { Offer } from "../../types";

/**
 * Source 01 — Al Rajhi Bank, credit-card offers page.
 *
 * The browser can't hit the bank directly (CORS), so the request is routed
 * through a public CORS relay. When the relay is down, the bank blocks it,
 * or the markup no longer matches, the engine falls back to the cached
 * snapshot — that contract is handled one level up in `engine.ts`.
 */

export const TARGET_URL =
  "https://www.alrajhibank.com.sa/en/personal/cards/credit-cards/card-offers";

const RELAY = "https://api.allorigins.win/raw?url=";
const TIMEOUT_MS = 6000;

interface ParseOutcome {
  offers: Offer[];
  selectorUsed: string;
}

export async function fetchAlRajhiPage(): Promise<Document> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RELAY + encodeURIComponent(TARGET_URL), {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html || html.length < 400) throw new Error("empty response body");
    return new DOMParser().parseFromString(html, "text/html");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Best-effort structural parser. The bank's page has no stable offer API,
 * so we probe a ladder of selectors that have matched past revisions and
 * normalise whatever survives into the Offer schema.
 */
export function parseAlRajhiDoc(doc: Document): ParseOutcome {
  const ladder: Array<{ sel: string; name: string }> = [
    { sel: '[class*="offer" i] [class*="title" i]', name: "offer-title" },
    { sel: '[class*="card-offer" i] a', name: "card-offer links" },
    { sel: '[class*="Campaign" i] h2, [class*="Campaign" i] h3', name: "campaign headings" },
    { sel: "a[href*='offer' i] img", name: "offer imagery" },
  ];

  for (const { sel, name } of ladder) {
    const nodes = Array.from(doc.querySelectorAll(sel));
    const seen = new Set<string>();
    const offers: Offer[] = [];

    for (const node of nodes) {
      const title = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (title.length < 8 || title.length > 140) continue;
      const key = title.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);

      const anchor =
        node.tagName === "A"
          ? (node as HTMLAnchorElement)
          : node.closest("a");
      const href = anchor?.href || TARGET_URL;

      offers.push(normalise(title, href, offers.length));
      if (offers.length >= 14) break;
    }

    if (offers.length >= 3) return { offers, selectorUsed: name };
  }

  return { offers: [], selectorUsed: "none" };
}

const CATEGORY_GUESS: Array<[RegExp, Offer["category"]]> = [
  [/restaurant|dining|food|burger|chicken/i, "dining"],
  [/coffee|café|cafe/i, "coffee"],
  [/amazon|noon|online|shop/i, "online"],
  [/extra|jarir|electr/i, "electronics"],
  [/fashion|style|namshi/i, "fashion"],
  [/grocer|danube|tamimi|panda/i, "groceries"],
  [/fly|flight|airline|emirates/i, "travel"],
  [/hotel|rotana|stay/i, "hotels"],
  [/fuel|petrol|petromin|sasco/i, "fuel"],
  [/cinema|movie|vox/i, "entertainment"],
];

const PERCENT_RE = /(\d{1,2})\s*(%|percent)/i;

function normalise(title: string, link: string, idx: number): Offer {
  const category =
    CATEGORY_GUESS.find(([re]) => re.test(title))?.[1] ?? "online";
  const pct = title.match(PERCENT_RE)?.[1];

  return {
    id: `arj-live-${idx}`,
    merchant: title.split(/[-–—:|]/)[0].trim().slice(0, 32) || "Al Rajhi offer",
    headline: title,
    discountLabel: pct ? `−${pct}%` : "OFFER",
    value: pct ? Number(pct) : 0,
    kind: "percent",
    category,
    bank: "Al Rajhi Bank",
    card: "All credit tiers",
    image: "",
    cards: ["Al Rajhi credit cards"],
    link,
    expiresAt: null,
    terms: ["Parsed live from the bank's offers page — open the link for full terms."],
  };
}
