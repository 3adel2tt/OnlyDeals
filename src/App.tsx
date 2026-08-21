import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BrowseScope,
  Category,
  CustomSource,
  FeedPayload,
  FeedProvenance,
  Offer,
  User,
} from "./types";
import { CATEGORY_LABEL } from "./types";
import { loadFeed, PROVENANCE_NOTE } from "./lib/feed";
import { daysLeft } from "./lib/format";
import { apiLogout, apiMe } from "./lib/api";
import {
  cardKey,
  getFollows,
  offerFollowed,
  toggleFollow,
  vendorKey,
} from "./lib/follows";
import AdminApp from "./components/AdminApp";
import TopBar from "./components/TopBar";
import Ticker from "./components/Ticker";
import OfferTile from "./components/OfferTile";
import OfferModal from "./components/OfferModal";
import SourcesLedger from "./components/SourcesLedger";
import BrowseDrawer from "./components/BrowseDrawer";
import AuthModal from "./components/AuthModal";
import Footer from "./components/Footer";
import Paginator, { type ViewMode } from "./components/Paginator";
import { BankIcon, CheckIcon, CloseIcon, SearchIcon, StarIcon, StoreIcon } from "./components/icons";

type SortKey = "expiring" | "value" | "recent";

const REGISTRY_KEY = "onlydeals.registry.v1";
const THEME_KEY = "onlydeals.theme";
const VIEW_KEY = "onlydeals.view";
const PAGESIZE_KEY = "onlydeals.pagesize";
const FEED_INTERVAL_MS = 5 * 60 * 1000;

function isAdminRoute(): boolean {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path.endsWith("/adminn") || window.location.hash.includes("adminn");
}

function basePath(): string {
  return window.location.pathname.replace(/adminn\/?$/, "");
}

function initialTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

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

/* ---------------- router + theme ---------------- */

export default function App() {
  const [admin, setAdmin] = useState(isAdminRoute);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  useEffect(() => {
    const onChange = () => setAdmin(isAdminRoute());
    window.addEventListener("popstate", onChange);
    window.addEventListener("hashchange", onChange);
    return () => {
      window.removeEventListener("popstate", onChange);
      window.removeEventListener("hashchange", onChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  const navigate = useCallback((to: "public" | "admin") => {
    const url = to === "admin" ? `${basePath()}adminn` : basePath() || "/";
    try {
      window.history.pushState(null, "", url);
    } catch {
      window.location.hash = to === "admin" ? "#/adminn" : "#/";
    }
    setAdmin(to === "admin");
    window.scrollTo({ top: 0 });
  }, []);

  return admin ? (
    <AdminApp theme={theme} onToggleTheme={toggleTheme} onExit={() => navigate("public")} />
  ) : (
    <SiteApp theme={theme} onToggleTheme={toggleTheme} />
  );
}

/* ---------------- public site: pure feed reader ---------------- */

function SiteApp({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const [payload, setPayload] = useState<FeedPayload | null>(null);
  const [provenance, setProvenance] = useState<FeedProvenance | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [selected, setSelected] = useState<Offer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [sort, setSort] = useState<SortKey>("expiring");
  const [scope, setScope] = useState<BrowseScope>({ type: "all" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customSources] = useState<CustomSource[]>(loadRegistry);
  const [user, setUser] = useState<User | null>(null);
  const [follows, setFollows] = useState<string[]>([]);
  const [view, setView] = useState<"all" | "my">("all");
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState<"generic" | "follow">("generic");

  // pagination / view mode (persisted)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "infinite" ? "infinite" : "pages";
    } catch {
      return "pages";
    }
  });
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(PAGESIZE_KEY));
      return n === 24 || n === 48 || n === 96 ? n : 24;
    } catch {
      return 24;
    }
  });
  const [page, setPage] = useState(1);
  const [loaded, setLoaded] = useState(pageSize);

  const toastTimer = useRef<number | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  /* ---------- feed: read on load + every 5 minutes (no manual sync) ---------- */
  const refresh = useCallback(async (silent: boolean) => {
    const res = await loadFeed();
    setPayload(res.payload);
    setProvenance(res.provenance);
    setLastSync(res.fetchedAt);
    if (!silent) showToast(`Feed loaded — ${res.payload.offers.length} offers`);
  }, [showToast]);

  useEffect(() => {
    void refresh(false);
    const t = window.setInterval(() => void refresh(true), FEED_INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  /* ---------- session restore (server cookie) ---------- */
  useEffect(() => {
    void apiMe().then((u) => {
      if (u) {
        setUser(u);
        setFollows(getFollows(u.id));
      }
    });
  }, []);

  /* ---------- auth ---------- */
  const openAuth = (intent: "generic" | "follow") => {
    setAuthIntent(intent);
    setAuthOpen(true);
  };

  const handleAuthed = (u: User) => {
    setUser(u);
    setFollows(getFollows(u.id));
    setAuthOpen(false);
    showToast(`Welcome, ${u.displayName || u.email}`);
  };

  const handleLogout = async () => {
    await apiLogout();
    setUser(null);
    setFollows([]);
    setView("all");
    showToast("Signed out — see you soon");
  };

  /* ---------- follows ---------- */
  const toggleCard = (bank: string, card: string) => {
    if (!user) return openAuth("follow");
    const key = cardKey(bank, card);
    const next = toggleFollow(user.id, key);
    setFollows(next);
    showToast(next.includes(key) ? `Following ${card}` : `Unfollowed ${card}`);
  };

  const toggleVendor = (merchant: string) => {
    if (!user) return openAuth("follow");
    const key = vendorKey(merchant);
    const next = toggleFollow(user.id, key);
    setFollows(next);
    showToast(next.includes(key) ? `Following ${merchant}` : `Unfollowed ${merchant}`);
  };

  /* ---------- keyboard: "/" focuses search ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------- derived data ---------- */
  const offers = useMemo(() => payload?.offers ?? [], [payload]);

  const applyScope = useCallback((next: BrowseScope) => {
    setScope(next);
    setCategory("all");
    setSearch("");
    setDrawerOpen(false);
    window.setTimeout(() => {
      document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, []);

  const scoped = useMemo(() => {
    let list = offers;
    if (view === "my") list = list.filter((o) => offerFollowed(o, follows));
    if (scope.type === "bank") list = list.filter((o) => o.bank === scope.bank);
    if (scope.type === "bank-card") list = list.filter((o) => o.bank === scope.bank && o.card === scope.card);
    if (scope.type === "vendor") list = list.filter((o) => o.merchant === scope.vendor);
    return list;
  }, [offers, view, follows, scope]);

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
    if (sort === "recent") return [...filtered].sort((a, b) => b.id.localeCompare(a.id));
    return filtered;
  }, [scoped, search, category, sort]);

  /* ---------- pagination math ---------- */
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    setPage(1);
    setLoaded(pageSize);
  }, [search, category, sort, scopeKey, view, pageSize, visible.length]);

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const clampedPage = Math.min(page, totalPages);

  const pageItems = useMemo(
    () =>
      viewMode === "pages"
        ? visible.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)
        : visible.slice(0, loaded),
    [viewMode, visible, clampedPage, pageSize, loaded],
  );

  /* infinite-scroll sentinel */
  useEffect(() => {
    if (viewMode !== "infinite") return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLoaded((l) => Math.min(l + pageSize, visible.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [viewMode, pageSize, visible.length]);

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

  const done = payload !== null;

  return (
    <div id="top" className="min-h-screen">
      <TopBar
        provenance={provenance}
        lastSync={lastSync}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onBrowse={() => setDrawerOpen(true)}
        user={user}
        view={view}
        followCount={follows.length}
        onToggleView={() => {
          if (!user) return openAuth("follow");
          setView((v) => (v === "my" ? "all" : "my"));
        }}
        onSignIn={() => openAuth("generic")}
        onLogout={() => void handleLogout()}
      />
      <Ticker offers={offers} />

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* intro + live engine status */}
        <section className="grid gap-6 pt-8 sm:pt-12 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <div className="reveal is-in">
            <p className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
              <span className="inline-block h-2 w-2 bg-brick" />
              sources 01–02 · n8n engines · alrajhi + jarir
            </p>
            <h1 className="mt-4 font-display text-[42px] font-extrabold leading-[0.98] tracking-tight text-ink sm:text-[58px]">
              {view === "my" ? (
                <>
                  Your deals,
                  <br />
                  <span className="text-brick">on one board.</span>
                </>
              ) : (
                <>
                  Every card offer,
                  <br />
                  <span className="text-brick">scraped & sorted.</span>
                </>
              )}
            </h1>
            <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-soft">
              n8n workflows crawl bank and merchant offer pages on your server; this board
              reads the feed every five minutes. Follow the cards you own or the merchants
              you love — your list lives under <span className="font-semibold text-ink">My deals</span>.
            </p>
          </div>

          {/* engine strip — read-only status from the feed */}
          <div className="reveal is-in overflow-hidden rounded-xl border border-line bg-card" style={{ transitionDelay: "80ms" }}>
            <p className="border-b border-line px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.2em] text-ink-faint">
              engine status · last feed
            </p>
            <div className="divide-y divide-line">
              {(payload?.sources ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`relative inline-block h-2 w-2 shrink-0 rounded-full ${
                      s.status === "live"
                        ? "bg-live text-live ping-dot"
                        : s.status === "error"
                          ? "bg-ember text-ember"
                          : "bg-amber text-amber"
                    }`}
                  />
                  <span className="font-display text-[14px] font-bold tracking-tight text-ink">{s.name}</span>
                  <span className="num-tabular ml-auto font-mono text-[10.5px] text-ink-soft">
                    {s.count} offer{s.count === 1 ? "" : "s"}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                      s.status === "live"
                        ? "border-live/40 bg-live/10 text-live"
                        : s.status === "error"
                          ? "border-ember/40 bg-ember-soft text-ember"
                          : "border-amber/40 bg-amber-soft text-amber"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
              {!done && (
                <div className="px-4 py-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint">
                  reading /onlydeals.json…
                </div>
              )}
            </div>
            {provenance && (
              <p className="border-t border-line px-4 py-2 font-mono text-[9.5px] tracking-[0.1em] text-ink-faint">
                {PROVENANCE_NOTE[provenance]}
              </p>
            )}
          </div>
        </section>

        {/* stats strip */}
        <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            {
              k: view === "my" ? "followed offers" : "offers on board",
              v: done ? String(stats.count) : "…",
              sub: done && provenance ? PROVENANCE_NOTE[provenance] : "loading feed",
              hot: false,
            },
            {
              k: "best discount",
              v: stats.best ? stats.best.discountLabel : "—",
              sub: stats.best ? stats.best.merchant : "",
              hot: true,
            },
            {
              k: "expiring ≤ 7 days",
              v: String(stats.expiring),
              sub: "move fast on these",
              hot: false,
            },
          ].map((s, i) => (
            <div
              key={s.k}
              className={`reveal is-in rounded-xl border p-4 transition-all duration-300 hover:-translate-y-0.5 ${
                s.hot ? "border-brick/30 bg-tint" : "border-line bg-card"
              }`}
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-faint">{s.k}</p>
              <p className={`num-tabular mt-1.5 font-display text-3xl font-extrabold tracking-tight ${s.hot ? "text-brick" : "text-ink"}`}>
                {s.v}
              </p>
              <p className="mt-0.5 truncate text-[11.5px] text-ink-soft">{s.sub}</p>
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
              <span className="num-tabular rounded-full bg-brick px-2 py-0.5 font-mono text-[10px] font-semibold text-card">
                {scoped.length} offer{scoped.length === 1 ? "" : "s"}
              </span>
              <button
                onClick={() => applyScope({ type: "all" })}
                className="ml-auto flex items-center gap-1.5 rounded-full border border-brick/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-brick transition-all hover:bg-brick hover:text-card active:scale-95"
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
                placeholder="Search merchants, codes, categories…  ( / )"
                className="w-full rounded-full border border-line bg-card py-2.5 pl-10 pr-4 text-[13.5px] text-ink placeholder:text-ink-faint transition-all focus:border-brick focus:outline-none focus:ring-2 focus:ring-brick/15"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint transition-colors hover:text-brick"
                  aria-label="Clear search"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="cursor-pointer rounded-full border border-line bg-card px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft focus:border-brick focus:outline-none"
                aria-label="Sort offers"
              >
                <option value="expiring">expiring soonest</option>
                <option value="value">biggest discount</option>
                <option value="recent">recently added</option>
              </select>
            </div>
          </div>

          {/* category chips */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            {(["all", ...categories] as Array<Category | "all">).map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all active:scale-95 ${
                  category === c
                    ? "border-brick bg-brick text-card shadow-[0_4px_14px_-4px_color-mix(in_oklab,var(--color-brick)_70%,transparent)]"
                    : "border-line bg-card text-ink-soft hover:border-brick/50 hover:text-brick"
                }`}
              >
                {c === "all" ? `all · ${scoped.length || "…"}` : CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>

          <p className="num-tabular mt-3 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {done
              ? scope.type !== "all"
                ? `showing ${visible.length} of ${scoped.length} · in scope`
                : `showing ${visible.length} of ${offers.length}`
              : "reading feed…"}
          </p>

          {/* the board */}
          {!done ? (
            <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTile key={i} />
              ))}
            </div>
          ) : view === "my" && follows.length === 0 ? (
            <div className="fade-in mx-auto max-w-md rounded-xl border border-dashed border-line bg-card/60 px-6 py-14 text-center">
              <StarIcon className="mx-auto h-9 w-9 text-amber" filled />
              <p className="mt-3 font-display text-[19px] font-bold tracking-tight text-ink">
                Your deals list is empty
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                Star the card tiers you own or the merchants you love — from any tile or
                offer detail — and they collect here.
              </p>
              <button
                onClick={() => setView("all")}
                className="mt-4 rounded-full bg-brick px-5 py-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-card transition-all hover:opacity-90 active:scale-95"
              >
                Browse the board
              </button>
            </div>
          ) : done && scoped.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-16 text-center">
              <TagEmpty />
              <p className="font-display text-xl font-bold text-ink">
                Nothing in the feed for {scopeLabel} yet
              </p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
                This source hasn't posted offers yet — its n8n workflow hasn't run, or it came
                back empty. The master scheduler will pick it up on the next pass.
              </p>
              <button
                onClick={() => applyScope({ type: "all" })}
                className="mt-1 rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-brick hover:text-card"
              >
                Back to all offers
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line bg-card/60 px-6 py-16 text-center">
              <TagEmpty />
              <p className="font-display text-xl font-bold text-ink">No deals on the board</p>
              <p className="max-w-sm text-[13px] leading-relaxed text-ink-soft">
                {view === "my"
                  ? "None of your followed offers match the current filters."
                  : `No offers match${search ? ` “${search}”` : ""} in this category. Widen the sweep.`}
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                {scope.type !== "all" && (
                  <button
                    onClick={() => applyScope({ type: "all" })}
                    className="rounded-full bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-colors hover:bg-brick hover:text-card"
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
                      : "bg-ink text-paper hover:bg-brick hover:text-card"
                  }`}
                >
                  Reset sweep
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pageItems.map((o, i) => (
                  <OfferTile
                    key={o.id}
                    offer={o}
                    index={i}
                    followed={offerFollowed(o, follows)}
                    onOpen={setSelected}
                    onToggleFollow={(offer) => toggleCard(offer.bank, offer.card)}
                  />
                ))}
              </div>

              {/* infinite-scroll sentinel */}
              {viewMode === "infinite" && loaded < visible.length && (
                <div ref={sentinelRef} className="flex items-center justify-center gap-2 py-8 font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-faint">
                  <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-line border-t-brick" />
                  loading more…
                </div>
              )}

              <Paginator
                viewMode={viewMode}
                onViewMode={(m) => {
                  setViewMode(m);
                  try {
                    localStorage.setItem(VIEW_KEY, m);
                  } catch {
                    /* ignore */
                  }
                }}
                pageSize={pageSize}
                onPageSize={(n) => {
                  setPageSize(n);
                  setLoaded(n);
                  setPage(1);
                  try {
                    localStorage.setItem(PAGESIZE_KEY, String(n));
                  } catch {
                    /* ignore */
                  }
                }}
                page={clampedPage}
                totalPages={totalPages}
                onPage={(n) => {
                  setPage(n);
                  document.getElementById("board")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                totalItems={visible.length}
              />
            </>
          )}
        </section>

        <SourcesLedger
          outcomes={payload?.sources ?? []}
          custom={customSources}
          onPick={(name) => showToast(`${name} is queued — register it from the Control Room to fast-track`)}
        />
      </main>

      <Footer />

      {toast && (
        <div className="toast-up fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-card px-4 py-2.5 font-mono text-[11.5px] tracking-[0.06em] text-ink shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)]">
          <CheckIcon className="h-3.5 w-3.5 text-brick" />
          {toast}
        </div>
      )}

      {selected && (
        <OfferModal
          offer={selected}
          scrapedAt={lastSync}
          generator={payload?.generator ?? "onlydeals"}
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
        onApply={applyScope}
        onClose={() => setDrawerOpen(false)}
        onLocked={(name) =>
          showToast(`${name} is still queued — Al Rajhi and Jarir are the live engines for now`)
        }
        onToggleCard={toggleCard}
        onToggleVendor={toggleVendor}
      />

      <AuthModal open={authOpen} intent={authIntent} onClose={() => setAuthOpen(false)} onAuthed={handleAuthed} />
    </div>
  );
}

function TagEmpty() {
  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12 text-ink-faint" fill="none">
      <path
        d="M7 24 22.8 8.2a3 3 0 0 1 2.1-.9H38a3.6 3.6 0 0 1 3.6 3.6v26.2A3.6 3.6 0 0 1 38 40.7H24.9a3 3 0 0 1-2.1-.9L7 24Z"
        stroke="currentColor"
        strokeWidth="2.2"
        opacity="0.55"
      />
      <circle cx="14.2" cy="24" r="2.4" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <path d="M35 16.5 23.5 32" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity="0.7" />
      <circle cx="24.3" cy="17.8" r="3.2" stroke="currentColor" strokeWidth="2.2" opacity="0.7" />
      <circle cx="34.2" cy="30.4" r="3.2" stroke="currentColor" strokeWidth="2.2" opacity="0.7" />
    </svg>
  );
}
