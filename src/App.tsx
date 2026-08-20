import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Category, LogLine, Offer, ScrapeStatus } from "./types";
import { CATEGORY_LABEL } from "./types";
import { runScrape } from "./scraper/engine";
import { daysLeft, formatClock } from "./lib/format";
import TopBar from "./components/TopBar";
import Ticker from "./components/Ticker";
import Terminal from "./components/Terminal";
import OfferTile from "./components/OfferTile";
import OfferModal from "./components/OfferModal";
import SourcesLedger from "./components/SourcesLedger";
import Footer from "./components/Footer";
import { CheckIcon, SearchIcon } from "./components/icons";

type SortKey = "expiring" | "value" | "recent";

function SkeletonTile() {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-card">
      <div className="aspect-[4/3] animate-pulse bg-tint" />
      <div className="space-y-2.5 p-4">
        <div className="h-2.5 w-16 animate-pulse rounded bg-tint" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-tint" />
        <div className="h-3 w-full animate-pulse rounded bg-tint" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-tint" />
      </div>
    </div>
  );
}

export default function App() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [status, setStatus] = useState<ScrapeStatus>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [scrapedAt, setScrapedAt] = useState<number | null>(null);
  const [live, setLive] = useState(false);
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<Offer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [sort, setSort] = useState<SortKey>("expiring");
  const [, setTick] = useState(0);

  const logId = useRef(0);
  const running = useRef(false);
  const started = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const runPass = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("running");
    setLogs([]);
    const result = await runScrape((kind, text) => {
      setLogs((prev) => [
        ...prev,
        { id: ++logId.current, time: formatClock(Date.now()), kind, text },
      ]);
    });
    setOffers(result.offers);
    setLive(result.live);
    setNote(result.note);
    setScrapedAt(result.scrapedAt);
    setStatus("done");
    running.current = false;
    showToast(`Pass complete — ${result.offers.length} offers loaded`);
  }, [showToast]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runPass();
  }, [runPass]);

  // keep relative timestamps fresh
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // "/" focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(offers.map((o) => o.category))).sort(),
    [offers],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = offers.filter((o) => {
      if (category !== "all" && o.category !== category) return false;
      if (!q) return true;
      return (
        o.merchant.toLowerCase().includes(q) ||
        o.headline.toLowerCase().includes(q) ||
        o.code?.toLowerCase().includes(q) ||
        CATEGORY_LABEL[o.category].toLowerCase().includes(q)
      );
    });
    const byExpiry = (o: Offer) => (o.expiresAt ? Date.parse(o.expiresAt) : Number.MAX_SAFE_INTEGER);
    if (sort === "expiring") return [...filtered].sort((a, b) => byExpiry(a) - byExpiry(b));
    if (sort === "value") return [...filtered].sort((a, b) => b.value - a.value);
    return filtered;
  }, [offers, search, category, sort]);

  const stats = useMemo(() => {
    const best = offers.reduce((m, o) => (o.value > m.value ? o : m), offers[0]);
    const expiring = offers.filter(
      (o) => o.expiresAt && daysLeft(o.expiresAt) <= 7 && daysLeft(o.expiresAt) > 0,
    ).length;
    return { count: offers.length, best, expiring };
  }, [offers]);

  const filtering = search.trim() !== "" || category !== "all";

  return (
    <div id="top" className="min-h-screen">
      <TopBar status={status} live={live} scrapedAt={scrapedAt} onRescrape={runPass} />
      <Ticker offers={offers} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* intro + terminal */}
        <section className="grid gap-6 pt-8 sm:pt-12 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-pine">
              <span className="inline-block h-2 w-2 bg-pine" />
              source 01 · al rajhi bank · card-offers
            </p>
            <h1 className="mt-3 font-display text-[34px] font-extrabold leading-[1.04] tracking-tight text-ink sm:text-[52px]">
              Every card offer on the
              <br className="hidden sm:block" /> bank's page,{" "}
              <span className="relative inline-block">
                scraped&nbsp;&amp;&nbsp;sorted.
                <svg
                  viewBox="0 0 220 12"
                  className="absolute -bottom-1.5 left-0 w-full text-amber"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 9 C 40 3, 75 3, 110 7 S 180 10, 217 4"
                    stroke="currentColor"
                    strokeWidth="4.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[14.5px] leading-relaxed text-ink-soft">
              The radar hits the offers page, strips the marketing, and leaves the numbers:
              what you save, which card tier qualifies, the code if there is one, and the
              exact date it dies. Click any tile for the full brief.
            </p>
            {status === "done" && (
              <p className="mt-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-mint" : "bg-amber"}`} />
                {note}
              </p>
            )}
          </div>
          <Terminal logs={logs} status={status} />
        </section>

        {/* stats strip */}
        <section className="mt-8 flex flex-wrap items-stretch gap-px overflow-hidden rounded-xl border border-line bg-line">
          {[
            {
              label: "offers loaded",
              value: status === "done" ? String(stats.count) : "··",
              sub: "al rajhi · card offers",
              hot: false,
            },
            {
              label: "best discount",
              value: status === "done" && stats.best ? stats.best.discountLabel : "··",
              sub: stats.best ? stats.best.merchant.toLowerCase() : "—",
              hot: false,
            },
            {
              label: "expiring ≤ 7 days",
              value: status === "done" ? String(stats.expiring) : "··",
              sub: "act on these first",
              hot: stats.expiring > 0,
            },
          ].map((s, i) => (
            <div key={i} className="flex-1 bg-card px-5 py-4 transition-colors hover:bg-tint/50">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-faint">{s.label}</p>
              <p
                className={`num-tabular mt-1 font-display text-[30px] font-extrabold leading-none tracking-tight ${
                  s.hot ? "text-ember" : "text-ink"
                }`}
              >
                {s.value}
              </p>
              <p className="mt-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-soft">{s.sub}</p>
            </div>
          ))}
        </section>

        {/* control deck */}
        <section className="mt-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchants, headlines, codes…"
                className="w-full rounded-full border border-line bg-card py-2.5 pl-10 pr-12 text-[14px] text-ink placeholder:text-ink-faint focus:border-pine focus:outline-none focus:ring-2 focus:ring-pine/25 transition-shadow"
              />
              <kbd className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                /
              </kbd>
            </div>
            <label className="flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="cursor-pointer bg-transparent font-mono text-[11.5px] font-medium uppercase tracking-[0.1em] text-ink focus:outline-none"
              >
                <option value="expiring">expiring soonest</option>
                <option value="value">biggest discount</option>
                <option value="recent">as scraped</option>
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["all", ...categories] as Array<Category | "all">).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all active:scale-95 ${
                  category === c
                    ? "bg-ink text-paper shadow-[0_4px_12px_-4px_rgba(20,35,27,0.5)]"
                    : "border border-line bg-card text-ink-soft hover:border-pine/50 hover:text-pine"
                }`}
              >
                {c === "all" ? `all · ${offers.length || "…"}` : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
              {status === "done"
                ? `showing ${visible.length} of ${offers.length}`
                : "receiving transmission…"}
            </p>
            {filtering && (
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
                className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-ember underline-offset-4 hover:underline"
              >
                clear filters ×
              </button>
            )}
          </div>
        </section>

        {/* offer grid */}
        <section className="mt-4">
          {status !== "done" && offers.length === 0 ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTile key={i} />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-16 text-center">
              <RadarEmpty />
              <p className="font-display text-xl font-bold text-ink">Nothing on the radar</p>
              <p className="max-w-xs text-[13px] text-ink-soft">
                No offers match “{search}” in this category. Widen the sweep.
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setCategory("all");
                }}
                className="mt-1 rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-pine"
              >
                Reset sweep
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((o, i) => (
                <OfferTile key={o.id} offer={o} index={i} onOpen={setSelected} />
              ))}
            </div>
          )}
        </section>

        <SourcesLedger onPick={(name) => showToast(`${name} is next on the bench — queued for v0.2`)} />
      </main>

      <Footer />

      {selected && (
        <OfferModal
          offer={selected}
          scrapedAt={scrapedAt}
          live={live}
          onClose={() => setSelected(null)}
          onToast={showToast}
        />
      )}

      {toast && (
        <div className="toast-up fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-term-line bg-term px-4 py-2.5 font-mono text-[11.5px] tracking-[0.06em] text-paper shadow-[0_18px_40px_-12px_rgba(12,23,18,0.6)]">
          <CheckIcon className="h-3.5 w-3.5 text-lime" />
          {toast}
        </div>
      )}
    </div>
  );
}

function RadarEmpty() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-ink-faint" fill="none">
      <circle cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      <circle cx="24" cy="24" r="11" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="24" cy="24" r="2.5" fill="currentColor" opacity="0.6" />
      <path d="M24 24 L40 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
