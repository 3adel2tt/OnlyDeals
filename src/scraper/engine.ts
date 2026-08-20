import type { Offer, ScrapeResult, SourceOutcome, SourceStatus } from "../types";
import { fetchHtml, fetchText, type Logger } from "./relays";
import {
  extractOfferLine,
  extractOffersFromText,
  parseWithLadder,
  type SourceCtx,
} from "./extract";
import { SCRAPE_SOURCES, type ScraperSource } from "./sources";

export type { Logger };

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function outcome(
  src: ScraperSource,
  status: SourceStatus,
  count: number,
  note: string,
): SourceOutcome {
  return { id: src.id, name: src.name, status, count, note, at: Date.now() };
}

/**
 * One source, three routes, in order:
 *   1. raw HTML via the relay waterfall → selector ladder → offer extraction
 *   2. Jina Reader (headless render → text) → pattern extraction
 *   3. cached snapshot (Al Rajhi only) — or an honest "blocked"
 */
export async function scrapeSource(
  src: ScraperSource,
  log: Logger,
): Promise<{ offers: Offer[]; outcome: SourceOutcome }> {
  const ctx: SourceCtx = { id: src.id, bank: src.bank, defaultCard: src.defaultCard, url: src.url };
  log("sys", `connecting → ${src.name} (${hostOf(src.url)})`);

  try {
    // route 1 — raw HTML + selector ladder
    const html = await fetchHtml(src.url, log);
    if (html) {
      const doc = new DOMParser().parseFromString(html.text, "text/html");
      const titles = parseWithLadder(doc, src.htmlLadder);
      log(
        titles.length ? "info" : "warn",
        titles.length
          ? `selector ladder → ${titles.length} candidate strings`
          : "selector ladder matched nothing usable",
      );
      const offers = titles
        .map((t, i) => extractOfferLine(t, ctx, i))
        .filter((o): o is Offer => o !== null);
      if (offers.length >= 2) {
        offers.slice(0, 3).forEach((o) =>
          log("info", `· ${o.merchant} ${o.discountLabel}${o.expiresAt ? ` · ends ${o.expiresAt.slice(0, 10)}` : ""}`),
        );
        log("ok", `parsed ${offers.length} offers from html`);
        log("sys", `${src.id}: LIVE`);
        return {
          offers,
          outcome: outcome(src, "live", offers.length, `${offers.length} offers · html via ${html.relay}`),
        };
      }
      if (offers.length > 0) log("warn", `only ${offers.length} usable offer(s) in html — trying text mode`);
    }

    // route 2 — rendered text via Jina Reader
    const txt = await fetchText(src.url, log);
    if (txt) {
      const offers = extractOffersFromText(txt.text, ctx);
      if (offers.length >= 1) {
        offers.slice(0, 3).forEach((o) =>
          log("info", `· ${o.merchant} ${o.discountLabel}${o.expiresAt ? ` · ends ${o.expiresAt.slice(0, 10)}` : ""}`),
        );
        log("ok", `text mode → ${offers.length} offers extracted`);
        log("sys", `${src.id}: LIVE`);
        return {
          offers,
          outcome: outcome(src, "live", offers.length, `${offers.length} offers · text via jina-reader`),
        };
      }
      log("warn", "text mode found no discount patterns on the page");
    }
  } catch {
    /* fall through to fallback */
  }

  // route 3 — snapshot fallback or honest blocked
  if (src.fallback) {
    const offers = src.fallback();
    log("warn", "all routes failed — serving cached snapshot");
    log("ok", `snapshot loaded · ${offers.length} offers`);
    log("sys", `${src.id}: SNAPSHOT`);
    return {
      offers,
      outcome: outcome(src, "snapshot", offers.length, "snapshot fallback — live routes blocked"),
    };
  }

  log("err", `${src.id}: BLOCKED — every relay refused or timed out`);
  return {
    offers: [],
    outcome: outcome(src, "blocked", 0, "all relays blocked — retries next pass"),
  };
}

/**
 * A full pass: every registered source scraped in parallel, logs interleaved
 * with a per-source tag, results merged into one board + per-source outcomes.
 */
export async function runScrape(log: Logger): Promise<ScrapeResult> {
  log("sys", `offradar v0.3 · pass start · ${SCRAPE_SOURCES.length} sources in parallel`);

  const results = await Promise.all(
    SCRAPE_SOURCES.map((src) =>
      scrapeSource(src, (kind, text) => log(kind, `[${src.id}] ${text}`)),
    ),
  );

  const offers = results.flatMap((r) => r.offers);
  const outcomes = results.map((r) => r.outcome);
  const liveCount = outcomes.filter((o) => o.status === "live").length;

  const note = outcomes
    .map((o) => `${o.name.split(" ")[0].toLowerCase()}: ${o.status}${o.count ? ` · ${o.count}` : ""}`)
    .join(" · ");

  log(
    "sys",
    `pass complete — ${offers.length} offers on the board · ${liveCount}/${outcomes.length} sources live`,
  );

  return { offers, outcomes, live: liveCount > 0, note, scrapedAt: Date.now() };
}
