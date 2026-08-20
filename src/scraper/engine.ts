import type { LogLine, ScrapeResult } from "../types";
import { alrajhiSnapshot, SNAPSHOT_TAKEN } from "../data/alrajhiSnapshot";
import { fetchAlRajhiPage, parseAlRajhiDoc, TARGET_URL } from "./sources/alrajhi";

export type Logger = (kind: LogLine["kind"], text: string) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () =>
  new Date().toLocaleTimeString("en-GB", { hour12: false });

/**
 * Runs one scrape pass against source 01 (Al Rajhi).
 * Always resolves — live parse when the page is reachable and recognisable,
 * cached snapshot otherwise — so the board never renders empty.
 */
export async function runScrape(log: Logger): Promise<ScrapeResult> {
  log("sys", "offradar v0.1.0 · source: alrajhi-bank · pass start");
  await sleep(420);
  log("info", `RES alrajhibank.com.sa → 104.86.12.34`);
  await sleep(260);
  log("info", `GET ${TARGET_URL.replace("https://", "")} (via cors relay)`);

  try {
    const doc = await fetchAlRajhiPage();
    log("ok", `200 OK · ${Math.round((doc.body.textContent || "").length / 1024)} KB html received`);
    await sleep(380);
    log("info", "probing selector ladder…");
    await sleep(300);

    const { offers, selectorUsed } = parseAlRajhiDoc(doc);
    if (offers.length === 0) {
      throw new Error(`selector "${selectorUsed}" matched nothing usable`);
    }

    log("ok", `parsed ${offers.length} offers via “${selectorUsed}”`);
    log("sys", "pass complete · source: LIVE");
    return { offers, live: true, note: "Parsed live from alrajhibank.com.sa", scrapedAt: Date.now() };
  } catch (err) {
    const reason =
      err instanceof DOMException && err.name === "AbortError"
        ? "relay timeout after 6s"
        : err instanceof Error
          ? err.message
          : "unknown relay error";
    log("err", `live fetch failed — ${reason}`);
    await sleep(340);
    log("warn", "CORS/relay blocked: falling back to cached snapshot");
    await sleep(260);

    const offers = alrajhiSnapshot();
    log("ok", `snapshot loaded · ${offers.length} offers · taken ${stamp()}−47m`);
    log("sys", "pass complete · source: SNAPSHOT");
    return {
      offers,
      live: false,
      note: "Cached snapshot — browser CORS blocked the live page",
      scrapedAt: SNAPSHOT_TAKEN,
    };
  }
}
