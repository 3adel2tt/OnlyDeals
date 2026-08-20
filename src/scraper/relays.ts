import type { LogLine } from "../types";

export type Logger = (kind: LogLine["kind"], text: string) => void;

/**
 * Browsers can't hit bank sites directly (CORS), so every request is routed
 * through public relays. We waterfall three HTML relays, then fall back to
 * the Jina Reader, which renders the page in a headless browser and returns
 * clean text — usually the most reliable route for JS-heavy bank pages.
 */

export interface FetchResult {
  text: string;
  relay: string;
  ms: number;
}

const HTML_RELAYS: Array<{ name: string; build: (u: string) => string }> = [
  { name: "allorigins", build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
  { name: "corsproxy.io", build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}` },
  { name: "codetabs", build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
];

const jinaUrl = (u: string) => `https://r.jina.ai/${u}`;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function reason(e: unknown): string {
  if (e instanceof DOMException && e.name === "AbortError") return "timeout";
  return e instanceof Error ? e.message : "network error";
}

async function fetchOnce(url: string, timeoutMs: number): Promise<{ text: string; ms: number }> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "text/html,application/xhtml+xml,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 200) throw new Error("empty body");
    return { text, ms: Math.round(performance.now() - start) };
  } finally {
    window.clearTimeout(timer);
  }
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** Waterfalls the HTML relays. Returns the first success, logging every attempt. */
export async function fetchHtml(url: string, log: Logger): Promise<FetchResult | null> {
  for (const r of HTML_RELAYS) {
    log("info", `relay ${r.name} → GET ${hostOf(url)}`);
    try {
      const { text, ms } = await fetchOnce(r.build(url), 5000);
      log("ok", `${r.name} · 200 · ${kb(text.length)} in ${ms}ms`);
      return { text, relay: r.name, ms };
    } catch (e) {
      log("warn", `${r.name} ✗ ${reason(e)}`);
    }
  }
  return null;
}

/** Jina Reader: renders the page (JS included) and serves it as text. */
export async function fetchText(url: string, log: Logger): Promise<FetchResult | null> {
  log("info", `relay jina-reader (renders JS) → GET ${hostOf(url)}`);
  try {
    const { text, ms } = await fetchOnce(jinaUrl(url), 9000);
    log("ok", `jina-reader · 200 · ${kb(text.length)} in ${ms}ms`);
    return { text, relay: "jina-reader", ms };
  } catch (e) {
    log("warn", `jina-reader ✗ ${reason(e)}`);
    return null;
  }
}
