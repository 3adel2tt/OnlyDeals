import type { Category, Offer } from "../types";

/**
 * Offer extraction heuristics. Banks don't publish a clean offers API, so
 * whatever the relays bring back (HTML title strings or Jina-rendered text)
 * is run through these patterns: discount shape → merchant → card tier →
 * expiry → promo code. Brutally pragmatic, and logged honestly upstream.
 */

const MON =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const MON_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function monIdx(name: string): number {
  return MON_IDX[name.slice(0, 3).toLowerCase()] ?? 0;
}

function buildDate(year: number, month: number, day: number): string | null {
  if (day < 1 || day > 31 || month < 0 || month > 11 || year < 2023 || year > 2031) return null;
  return new Date(year, month, day, 23, 59, 59).toISOString();
}

function guessYear(month: number, now: Date): number {
  return month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
}

export function extractExpiry(line: string): string | null {
  if (!/\b(valid|till|until|ends?|expir|deadline|through|period|last day)\b/i.test(line)) return null;
  const now = new Date();

  let m = line.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON})\\s*(\\d{4})?`, "i"));
  if (m) return buildDate(m[3] ? +m[3] : guessYear(monIdx(m[2]), now), monIdx(m[2]), +m[1]);

  m = line.match(new RegExp(`(${MON})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*,?\\s*(\\d{4})?`, "i"));
  if (m) return buildDate(m[3] ? +m[3] : guessYear(monIdx(m[1]), now), monIdx(m[1]), +m[2]);

  m = line.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return buildDate(year, +m[2] - 1, +m[1]);
  }
  return null;
}

export interface DiscountHit {
  value: number;
  kind: Offer["kind"];
  label: string;
}

const trim0 = (s: string) => s.replace(/\.0+$/, "");

export function parseDiscount(line: string): DiscountHit | null {
  let m =
    line.match(/(\d{1,2}(?:\.\d)?)\s*%\s*cash\s?back/i) ||
    line.match(/cash\s?back[^0-9]{0,14}(\d{1,2}(?:\.\d)?)\s*%/i);
  if (m) return { value: parseFloat(m[1]), kind: "cashback", label: `${trim0(m[1])}% CASHBACK` };

  if (/\b0\s*%\s*(install\w*|emi|easy\s?pay|split|finance)/i.test(line))
    return { value: 0.4, kind: "installments", label: "0% ×12" };

  if (/\bbuy\s*1\s*get\s*1\b|\bb1g1\b|\b1\s*\+\s*1\s*(free|on us)\b|\bget\s*one\s*free\b/i.test(line))
    return { value: 50, kind: "bogo", label: "1+1 FREE" };

  m =
    line.match(/(?:up\s*to\s*)?(\d{1,2}(?:\.\d)?)\s*%\s*(off|discount|rebate|saving|less)/i) ||
    line.match(/\b(save|get|enjoy)\b[^0-9%]{0,18}(\d{1,2}(?:\.\d)?)\s*%/i);
  if (m) {
    const v = m[2] ?? m[1];
    return { value: parseFloat(v), kind: "percent", label: `−${trim0(v)}%` };
  }

  m = line.match(/(\d{1,2})\s*%/);
  if (m && +m[1] >= 5) return { value: +m[1], kind: "percent", label: `−${m[1]}%` };

  return null;
}

function tidy(s: string): string {
  return s
    .split(/\s+(?:at|on|when|with|for|using|via|and|or|–|-)\s+/i)[0]
    .replace(/[.,;:]+$/, "")
    .trim()
    .slice(0, 32);
}

export function guessMerchant(line: string): string {
  let m = line.match(
    /(?:off|discount|cashback|deal|save)[^A-Z]{0,6}(at|on|with|from)\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,3})/,
  );
  if (m) return tidy(m[2]);

  m = line.match(/(?:\bat|\bon)\s+([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,3})/);
  if (m) return tidy(m[1]);

  m = line.match(/([A-Z][A-Za-z0-9&'.-]*(?:\s+[A-Z][A-Za-z0-9&'.-]*){0,2})/);
  if (m) {
    const t = tidy(m[1]);
    if (t.length >= 3 && !/^(get|enjoy|up|to|save|off|buy|use|now|exclusive|new|don|till|valid|card|offer|terms|pay)/i.test(t))
      return t;
  }
  return "Partner offer";
}

const TIERS: Array<[RegExp, string]> = [
  [/world\s*elite/i, "World Elite Mastercard"],
  [/(visa\s*)?infinite/i, "Visa Infinite"],
  [/signature/i, "Signature Visa"],
  [/titanium/i, "Titanium Plus"],
  [/platinum/i, "Platinum"],
  [/classic/i, "Classic Visa"],
  [/\bgold\b/i, "Gold"],
];

export function guessTier(line: string): string | null {
  return TIERS.find(([re]) => re.test(line))?.[1] ?? null;
}

const CATEGORY_GUESS: Array<[RegExp, Category]> = [
  [/restaurant|dining|food|burger|chicken|grill/i, "dining"],
  [/coffee|café|cafe|roastery/i, "coffee"],
  [/amazon|noon|online|shop|ecommerce/i, "online"],
  [/extra|jarir|electr|tech|mobile/i, "electronics"],
  [/fashion|style|namshi|boutique|apparel/i, "fashion"],
  [/grocer|danube|tamimi|panda|supermarket/i, "groceries"],
  [/fly|flight|airline|emirates|saudia/i, "travel"],
  [/hotel|rotana|resort|stay/i, "hotels"],
  [/fuel|petrol|petromin|sasco|gas station/i, "fuel"],
  [/cinema|movie|vox|theatre/i, "entertainment"],
];

export function guessCategory(line: string): Category {
  return CATEGORY_GUESS.find(([re]) => re.test(line))?.[1] ?? "online";
}

export function cleanLine(raw: string): string {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface SourceCtx {
  id: string;
  bank: string;
  defaultCard: string;
  url: string;
}

/** Parses a single line/title into an Offer — or null if no discount shape is found. */
export function extractOfferLine(raw: string, src: SourceCtx, idx: number): Offer | null {
  const line = cleanLine(raw);
  if (line.length < 8 || line.length > 220) return null;
  const hit = parseDiscount(line);
  if (!hit) return null;

  const tier = guessTier(line) ?? src.defaultCard;
  const codeM = line.match(/\bcode[:\s–-]*([A-Z0-9]{4,14})\b/i);

  return {
    id: `${src.id}-live-${idx}`,
    merchant: guessMerchant(line),
    headline: line.length > 130 ? line.slice(0, 127) + "…" : line,
    discountLabel: hit.label,
    value: hit.value,
    kind: hit.kind,
    category: guessCategory(line),
    bank: src.bank,
    card: tier,
    image: "",
    cards: [tier],
    code: codeM?.[1]?.toUpperCase(),
    link: src.url,
    expiresAt: extractExpiry(line),
    terms: [
      `Extracted live from ${new URL(src.url).hostname} through a CORS relay.`,
      "Snapshots of bank pages can drift — confirm exact terms on the issuer's official site before use.",
    ],
  };
}

/** Runs the whole text blob line-by-line, deduped, capped. */
export function extractOffersFromText(text: string, src: SourceCtx, cap = 24): Offer[] {
  const seen = new Set<string>();
  const out: Offer[] = [];
  for (const raw of text.split(/\n+/)) {
    const o = extractOfferLine(raw, src, out.length);
    if (!o) continue;
    const key = (o.merchant + o.discountLabel).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
    if (out.length >= cap) break;
  }
  return out;
}

/** Probes a parsed DOM with a ladder of selectors, returns usable title strings. */
export function parseWithLadder(doc: Document, ladder: string[]): string[] {
  for (const sel of ladder) {
    let titles: string[] = [];
    try {
      titles = Array.from(doc.querySelectorAll(sel))
        .map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
        .filter((t) => t.length >= 8 && t.length <= 200);
    } catch {
      continue;
    }
    const uniq = [...new Set(titles)];
    if (uniq.length >= 3) return uniq.slice(0, 30);
  }
  return [];
}
