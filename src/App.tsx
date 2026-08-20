import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BrowseScope, Category, CustomSource, LogLine, Offer, ScrapeStatus, SourceOutcome, User } from "./types";
import { CATEGORY_LABEL } from "./types";
import { runScrape } from "./scraper/engine";
import { daysLeft, formatClock } from "./lib/format";
import { ensureSeeded, getSession, logout } from "./lib/auth";
import {
  cardKey,
  getFollows,
  offerFollowed,
  toggleFollow,
  vendorKey,
} from "./lib/follows";
import TopBar from "./components/TopBar";
import Ticker from "./components/Ticker";
import Terminal from "./components/Terminal";
import OfferTile from "./components/OfferTile";
import OfferModal from "./components/OfferModal";
import SourcesLedger from "./components/SourcesLedger";
import BrowseDrawer from "./components/BrowseDrawer";
import AddSourceModal from "./components/AddSourceModal";
import AuthModal from "./components/AuthModal";
import Footer from "./components/Footer";
import {
  BankIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  StarIcon,
  StoreIcon,
} from "./components/icons";

type SortKey = "expiring" | "value" | "recent";

const REGISTRY_KEY = "offradar.registry.v1";

function loadRegistry(): CustomSource[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as CustomSource[]) : [];
  } catch {
    return [];
  }
}

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
  const [scope, setScope] = useState<BrowseScope>({ type: "all" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [customSources, setCustomSources] = useState<CustomSource[]>(loadRegistry);
  const [user, setUser] = useState<User | null>(null);
  const [follows, setFollows] = useState<string[]>([]);
  const [view, setView] = useState<"all" | "my">("all");
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"generic" | "admin" | "follow">("generic");
  const [outcomes, setOutcomes] = useState<SourceOutcome[]>([]);
  const [watch, setWatch] = useState(true);
  const [, setTick] = useState(0);

  const logId = useRef(0);
  const running = useRef(false);
  const started = useRef(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  const followsLoadedRef = useRef(false);

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
    setOutcomes(result.outcomes);
    setStatus("done");
    running.current = false;
    const liveN = result.outcomes.filter((o) => o.status === "live").length;
    showToast(
      liveN > 0
        ? `Pass complete — ${result.offers.length} offers · ${liveN} source${liveN === 1 ? "" : "s"} live`
        : `Pass complete — ${result.offers.length} offers from snapshot`,
    );
  }, [showToast]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runPass();
  }, [runPass]);

  // restore session + follows on mount
  useEffect(() => {
    ensureSeeded();
    const u = getSession();
    if (u) {
      setUser(u);
      setFollows(getFollows(u.id));
    }
  }, []);

  // watch mode — the radar keeps sweeping on its own
  useEffect(() => {
    if (!watch) return;
    const t = window.setInterval(() => {
      if (!running.current) void runPass();
    }, 120_000);
    return () => window.clearInterval(t);
  }, [watch, runPass]);

  const toggleWatch = useCallback(() => {
    const next = !watch;
    setWatch(next);
    showToast(next ? "Watch on — re-scanning every 2 min" : "Watch off — manual passes only");
  }, [watch, showToast]);

  // keep relative timestamps fresh
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // persist the source registry
  useEffect(() => {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(customSources));
    } catch {
      /* storage unavailable — registry stays in memory */
    }
  }, [customSources]);

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

  const applyScope = useCallback((next: BrowseScope) => {
    setScope(next);
    setCategory("all");
    setSearch("");
    setDrawerOpen(false);
    window.setTimeout(() => {
      document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const addSource = useCallback(
    (s: CustomSource) => {
      setCustomSources((prev) => [...prev, s]);
      showToast(`${s.name} registered — queued for its first scrape`);
    },
    [showToast],
  );

  const removeSource = useCallback(
    (id: string) => {
      setCustomSources((prev) => prev.filter((s) => s.id !== id));
      showToast("Removed from registry");
    },
    [showToast],
  );

  // ---- auth ----
  const openAuth = useCallback((intent: "generic" | "admin" | "follow" = "generic") => {
    setAuthIntent(intent);
    setAuthOpen(true);
  }, []);

  const handleAuthed = useCallback(
    (u: User) => {
      setUser(u);
      setFollows(getFollows(u.id));
      setAuthOpen(false);
      showToast(`Signed in as ${u.displayName}${u.role === "admin" ? " · admin" : ""}`);
    },
    [showToast],
  );

  const handleLogout = useCallback(() => {
    logout();
    setUser(null);
    setFollows([]);
    setView("all");
    showToast("Signed out — back to the public radar");
  }, [showToast]);

  // gate for admin-only actions (the source registry)
  const registerGate = useCallback(() => {
    if (!user) {
      openAuth("admin");
      return;
    }
    if (user.role !== "admin") {
      showToast("The registry is admin-only — sign in as the admin to register sources");
      return;
    }
    setAddOpen(true);
  }, [user, openAuth, showToast]);

  // ---- follows ----
  const requireAuthThen = useCallback(
    (fn: () => void, label: string) => {
      if (!user) {
        showToast(`Sign in to follow ${label}`);
        openAuth("follow");
        return;
      }
      fn();
    },
    [user, openAuth, showToast],
  );

  const toggleCard = useCallback(
    (bank: string, card: string) => {
      const key = cardKey(bank, card);
      requireAuthThen(() => {
        if (!user) return;
        const next = toggleFollow(user.id, key);
        setFollows(next);
      }, card);
    },
    [user, requireAuthThen],
  );

  const toggleVendor = useCallback(
    (merchant: string) => {
      const key = vendorKey(merchant);
      requireAuthThen(() => {
        if (!user) return;
        const next = toggleFollow(user.id, key);
        setFollows(next);
      }, merchant);
    },
    [user, requireAuthThen],
  );

  const toggleView = useCallback(() => {
    if (!user) {
      openAuth("follow");
      return;
    }
    setView((v) => (v === "all" ? "my" : "all"));
  }, [user, openAuth]);

  // follow state changed → toast the most recent action
  useEffect(() => {
    if (!user) return;
    const count = follows.length;
    // only toast after the first load (avoid on mount)
    if (followsLoadedRef.current) {
      showToast(
        count === 0
          ? "Radar cleared — nothing followed"
          : `Following ${count} ${count === 1 ? "source" : "sources"}`,
      );
    }
    followsLoadedRef.current = true;
  }, [follows, user, showToast]);

  // ---- my-radar pool: followed offers only ----
  const pool = useMemo(() => {
    if (view !== "my" || !user) return offers;
    return offers.filter((o) => offerFollowed(o, follows));
  }, [offers, view, user, follows]);

  // offers narrowed by the drawer's bank→card / vendor drill-down
  const scoped = useMemo(() => {
    if (scope.type === "bank") return pool.filter((o) => o.bank === scope.bank);
    if (scope.type === "bank-card")
      return pool.filter((o) => o.bank === scope.bank && o.card === scope.card);
    if (scope.type === "vendor") return pool.filter((o) => o.merchant === scope.vendor);
    return pool;
  }, [pool, scope]);

  const categories = useMemo(
    () => Array.from(new Set(scoped.map((o) => o.category))).sort(),
    [scoped],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = scoped.filter((o) => {
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
  }, [scoped, search, category, sort]);

  const stats = useMemo(() => {
    const best = scoped.length
      ? scoped.reduce((m, o) => (o.value > m.value ? o : m), scoped[0])
      : undefined;
    const expiring = scoped.filter(
      (o) => o.expiresAt && daysLeft(o.expiresAt) <= 7 && daysLeft(o.expiresAt) > 0,
    ).length;
    return { count: scoped.length, best, expiring };
  }, [scoped]);

  const scopeLabel =
    scope.type === "bank"
      ? scope.bank
      : scope.type === "bank-card"
        ? `${scope.bank} › ${scope.card}`
        : scope.type === "vendor"
          ? scope.vendor
          : "";

  const filtering = search.trim() !== "" || category !== "all" || scope.type !== "all";

  return (
    <div id="top" className="min-h-screen">
      <TopBar
        status={status}
        live={live}
        scrapedAt={scrapedAt}
        watch={watch}
        onRescrape={runPass}
        onBrowse={() => setDrawerOpen(true)}
        onToggleWatch={toggleWatch}
        user={user}
        view={view}
        followCount={follows.length}
        onToggleView={toggleView}
        onSignIn={() => openAuth("generic")}
        onLogout={handleLogout}
      />
      <Ticker offers={offers} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* intro + terminal */}
        <section className="grid gap-6 pt-8 sm:pt-12 lg:grid-cols-[1.15fr_1fr] lg:items-end">
          <div>
            <p className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
              <span className="inline-block h-2 w-2 bg-brick" />
              sources 01–03 · parallel crawl · alrajhi · snb · tamara
              {view === "my" && user && (
                <span className="star-pop inline-flex items-center gap-1 rounded-full bg-amber px-2 py-0.5 text-[9.5px] font-bold text-ink">
                  <StarIcon filled className="h-3 w-3" />
                  my radar · {user.displayName}
                </span>
              )}
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
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${live ? "bg-live" : "bg-amber"}`} />
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
              label: view === "my" ? "offers followed" : "offers loaded",
              value: status === "done" ? String(stats.count) : "··",
              sub:
                view === "my"
                  ? scope.type === "all"
                    ? `${follows.length} followed sources`
                    : scopeLabel.toLowerCase()
                  : scope.type === "all"
                    ? "al rajhi · card offers"
                    : scopeLabel.toLowerCase(),
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
        <section id="board" className="mt-8 scroll-mt-24">
          {scope.type !== "all" && (
            <div className="fade-in mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brick/30 bg-tint/70 px-4 py-2.5">
              {scope.type === "vendor" ? (
                <StoreIcon className="h-4 w-4 text-brick" />
              ) : (
                <BankIcon className="h-4 w-4 text-brick" />
              )}
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-brick/70">
                browsing
              </span>
              <span className="font-display text-[14.5px] font-bold tracking-tight text-ink">
                {scopeLabel}
              </span>
              <span className="num-tabular rounded-full bg-brick px-2 py-0.5 font-mono text-[10px] font-semibold text-paper">
                {scoped.length} offer{scoped.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => applyScope({ type: "all" })}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-brick/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-brick transition-all hover:bg-brick hover:text-paper active:scale-95"
              >
                <CloseIcon className="h-3 w-3" />
                show all offers
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchants, headlines, codes…"
                className="w-full rounded-full border border-line bg-card py-2.5 pl-10 pr-12 text-[14px] text-ink placeholder:text-ink-faint focus:border-brick focus:outline-none focus:ring-2 focus:ring-brick/25 transition-shadow"
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
                    ? "bg-ink text-paper shadow-[0_4px_12px_-4px_rgba(39,19,18,0.5)]"
                    : "border border-line bg-card text-ink-soft hover:border-brick/50 hover:text-brick"
                }`}
              >
                {c === "all" ? `all · ${scoped.length || "…"}` : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-ink-faint">
              {status === "done"
                ? scope.type !== "all"
                  ? `showing ${visible.length} of ${scoped.length} · in scope`
                  : `showing ${visible.length} of ${offers.length}`
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
          ) : view === "my" && status === "done" && pool.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-amber/60 bg-amber-soft/50 px-6 py-16 text-center">
              <StarIcon filled className="h-12 w-12 text-amber" />
              <p className="font-display text-xl font-bold text-ink">Your radar is empty</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
                {follows.length === 0
                  ? "Follow a card tier or a merchant — hit the ★ on any tile, or browse banks and vendors — and only those offers will show up here."
                  : "None of your followed cards or merchants have offers in the current scrape. Try widening back to all offers."}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => {
                    setDrawerOpen(true);
                  }}
                  className="rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-brick"
                >
                  Browse & follow
                </button>
                <button
                  onClick={() => setView("all")}
                  className="rounded-full border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-brick hover:text-brick"
                >
                  Back to all offers
                </button>
              </div>
            </div>
          ) : status === "done" && scoped.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-16 text-center">
              <RadarEmpty />
              <p className="font-display text-xl font-bold text-ink">
                Nothing indexed for {scopeLabel} yet
              </p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
                This source is registered but its scraper engine hasn't run — once an engine
                is wired, its offers will land here automatically.
              </p>
              <button
                onClick={() => applyScope({ type: "all" })}
                className="mt-1 rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-brick"
              >
                Back to all offers
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-16 text-center">
              <RadarEmpty />
              <p className="font-display text-xl font-bold text-ink">Nothing on the radar</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
                {view === "my"
                  ? `None of the offers you follow match${search ? ` “${search}”` : ""} right now. Widen the sweep or check your followed sources.`
                  : scope.type !== "all"
                    ? `No ${scopeLabel} offers match${search ? ` “${search}”` : ""} in this category. Widen the sweep or step out of scope.`
                    : `No offers match${search ? ` “${search}”` : ""} in this category. Widen the sweep.`}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {scope.type !== "all" && (
                  <button
                    onClick={() => applyScope({ type: "all" })}
                    className="rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-brick"
                  >
                    Clear scope
                  </button>
                )}
                <button
                  onClick={() => {
                    setSearch("");
                    setCategory("all");
                  }}
                  className={`rounded-full px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors ${
                    scope.type !== "all"
                      ? "border border-line text-ink-soft hover:border-brick hover:text-brick"
                      : "bg-ink text-paper hover:bg-brick"
                  }`}
                >
                  Reset sweep
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((o, i) => (
                <OfferTile
                  key={o.id}
                  offer={o}
                  index={i}
                  onOpen={setSelected}
                  followed={follows.includes(cardKey(o.bank, o.card))}
                  onToggleFollow={(offer) => toggleCard(offer.bank, offer.card)}
                />
              ))}
            </div>
          )}
        </section>

        <SourcesLedger
          outcomes={outcomes}
          custom={customSources}
          isAdmin={user?.role === "admin"}
          onPick={(name) => showToast(`${name} is queued — register it from Browse to fast-track`)}
          onAdd={() => setAddOpen(true)}
          onRemove={removeSource}
          onRegisterGate={registerGate}
        />
      </main>

      <Footer />

      {selected && (
        <OfferModal
          offer={selected}
          scrapedAt={scrapedAt}
          live={live}
          cardFollowed={follows.includes(cardKey(selected.bank, selected.card))}
          vendorFollowed={follows.includes(vendorKey(selected.merchant))}
          onToggleCard={(o) => toggleCard(o.bank, o.card)}
          onToggleVendor={(o) => toggleVendor(o.merchant)}
          onClose={() => setSelected(null)}
          onToast={showToast}
        />
      )}

      <BrowseDrawer
        open={drawerOpen}
        offers={offers}
        custom={customSources}
        active={scope}
        follows={follows}
        isAdmin={user?.role === "admin"}
        onApply={applyScope}
        onClose={() => setDrawerOpen(false)}
        onLocked={(name) =>
          showToast(`${name} is still queued — Al Rajhi is the only live source for now`)
        }
        onAdd={() => setAddOpen(true)}
        onToggleCard={toggleCard}
        onToggleVendor={toggleVendor}
        onRegisterGate={registerGate}
      />

      <AddSourceModal
        open={addOpen}
        sources={customSources}
        onAdd={addSource}
        onRemove={removeSource}
        onClose={() => setAddOpen(false)}
      />

      <AuthModal
        open={authOpen}
        intent={authIntent}
        onClose={() => setAuthOpen(false)}
        onAuthed={handleAuthed}
      />

      {toast && (
        <div className="toast-up fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-term-line bg-term px-4 py-2.5 font-mono text-[11.5px] tracking-[0.06em] text-paper shadow-[0_18px_40px_-12px_rgba(25,16,16,0.6)]">
          <CheckIcon className="h-3.5 w-3.5 text-flare" />
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
