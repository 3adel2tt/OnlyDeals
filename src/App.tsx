import { useCallback, useEffect, useMemo, useState } from "react";
import TopBar from "./components/TopBar";
import OfferTile from "./components/OfferTile";
import OfferModal from "./components/OfferModal";
import Paginator, { type ViewMode } from "./components/Paginator";
import BrowseDrawer from "./components/BrowseDrawer";
import SourcesLedger from "./components/SourcesLedger";
import AuthModal from "./components/AuthModal";
import AdminApp from "./components/AdminApp";
import Footer from "./components/Footer";
import { SearchIcon, RefreshIcon } from "./components/icons";
import { loadFeed, type FeedResult } from "./lib/feed";
import { apiLogout, apiMe } from "./lib/api";
import {
  cardKey,
  vendorKey,
  getFollows,
  toggleFollow,
  offerFollowed,
} from "./lib/follows";
import { daysLeft } from "./lib/format";
import { alrajhiSnapshot } from "./data/alrajhiSnapshot";
import type {
  BrowseScope,
  CustomSource,
  FeedProvenance,
  Offer,
  SourceOutcome,
  User,
} from "./types";

type Sort = "big" | "soon";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function scopeLabel(scope: BrowseScope): string {
  switch (scope.type) {
    case "all":
      return "All sources";
    case "bank":
      return scope.bank;
    case "bank-card":
      return `${scope.bank} · ${scope.card}`;
    case "vendor":
      return scope.vendor;
  }
}

export default function App() {
  /* ---------------- theme ---------------- */
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("onlydeals.theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    try {
      localStorage.setItem("onlydeals.theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );

  /* ---------------- route (#/admin → control room) ---------------- */
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /* ---------------- feed ---------------- */
  const [feed, setFeed] = useState<FeedResult | null>(null);
  const [syncing, setSyncing] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSyncing(true);
    loadFeed().then((r) => {
      if (!cancelled) {
        setFeed(r);
        setSyncing(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const provenance: FeedProvenance | null = feed?.provenance ?? null;

  const offers: Offer[] = useMemo(() => {
    if (!feed) return [];
    if (feed.provenance === "bundled") return alrajhiSnapshot();
    return feed.payload.offers;
  }, [feed]);

  const outcomes: SourceOutcome[] = feed?.payload.sources ?? [];
  const generator = feed?.payload.generator ?? "—";

  /* ---------------- session + follows ---------------- */
  const [user, setUser] = useState<User | null>(null);
  const [follows, setFollows] = useState<string[]>([]);
  useEffect(() => {
    apiMe().then((u) => {
      setUser(u);
      if (u) setFollows(getFollows(u.id));
    });
  }, []);

  const [auth, setAuth] = useState<{ open: boolean; intent: "generic" | "follow" }>({
    open: false,
    intent: "generic",
  });

  const [toast, setToast] = useState<string | null>(null);
  const say = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  }, []);

  const toggle = useCallback(
    (key: string, label: string) => {
      if (!user) {
        setAuth({ open: true, intent: "follow" });
        return;
      }
      const next = toggleFollow(user.id, key);
      setFollows(next);
      say(next.includes(key) ? `Following ${label}` : `Unfollowed ${label}`);
    },
    [user, say],
  );

  const onToggleVendor = useCallback(
    (o: Offer) => toggle(vendorKey(o.merchant), o.merchant),
    [toggle],
  );
  const onToggleCard = useCallback(
    (o: Offer) => toggle(cardKey(o.bank, o.card), `${o.card} (${o.bank})`),
    [toggle],
  );

  /* ---------------- board controls ---------------- */
  const [view, setView] = useState<"all" | "my">("all");
  const [scope, setScope] = useState<BrowseScope>({ type: "all" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("big");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [viewMode, setViewMode] = useState<ViewMode>("pages");
  const [active, setActive] = useState<Offer | null>(null);

  const custom: CustomSource[] = useMemo(
    () => loadJson<CustomSource[]>("onlydeals.sources.v1", []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawerOpen, route],
  );

  useEffect(() => setPage(1), [search, scope, view, sort, pageSize, offers]);

  const filtered = useMemo(() => {
    let list = offers;
    if (scope.type === "bank") list = list.filter((o) => o.bank === scope.bank);
    if (scope.type === "bank-card")
      list = list.filter((o) => o.bank === scope.bank && o.card === scope.card);
    if (scope.type === "vendor") list = list.filter((o) => o.merchant === scope.vendor);
    if (view === "my") list = list.filter((o) => offerFollowed(o, follows));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) =>
        [o.merchant, o.headline, o.bank, o.card, ...o.cards]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    const sorted = [...list];
    if (sort === "big") sorted.sort((a, b) => b.value - a.value);
    else
      sorted.sort((a, b) => {
        if (!a.expiresAt && !b.expiresAt) return 0;
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return daysLeft(a.expiresAt) - daysLeft(b.expiresAt);
      });
    return sorted;
  }, [offers, scope, view, follows, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible =
    viewMode === "infinite"
      ? filtered.slice(0, page * pageSize)
      : filtered.slice((page - 1) * pageSize, page * pageSize);

  const onLogout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    setFollows([]);
    say("Signed out");
  }, [say]);

  /* ---------------- control room ---------------- */
  if (route.startsWith("#/admin")) {
    return (
      <AdminApp
        theme={theme}
        onToggleTheme={toggleTheme}
        onExit={() => {
          window.location.hash = "";
        }}
      />
    );
  }

  return (
    <div className="min-h-screen">
      <TopBar
        provenance={provenance}
        lastSync={feed?.fetchedAt ?? null}
        theme={theme}
        onToggleTheme={toggleTheme}
        onBrowse={() => setDrawerOpen(true)}
        user={user}
        view={view}
        followCount={follows.length}
        onToggleView={() => setView((v) => (v === "all" ? "my" : "all"))}
        onSignIn={() => setAuth({ open: true, intent: "generic" })}
        onLogout={onLogout}
      />

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6">
        {/* board head */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
              The board
            </h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-faint">
              {scopeLabel(scope)} · {filtered.length} offer{filtered.length === 1 ? "" : "s"}
              {syncing && <span className="ml-2 text-flare">syncing…</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReloadTick((n) => n + 1)}
            className="group flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-flare hover:text-flare"
          >
            <RefreshIcon className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" />
            Re-pull feed
          </button>
        </div>

        {/* toolbar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant, bank, card…"
              className="w-full rounded-md border border-line bg-card py-2.5 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-flare focus:outline-none"
            />
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-line bg-card px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft focus:border-flare focus:outline-none"
            aria-label="Sort offers"
          >
            <option value="big">Biggest discount first</option>
            <option value="soon">Ending soonest</option>
          </select>
        </div>

        {/* grid / empty states */}
        {offers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-card/50 px-6 py-16 text-center">
            <p className="font-display text-xl font-bold text-ink-soft">Waiting for the first n8n sync</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-faint">
              The board only shows offers produced by the scraping pipeline. Point the feed at
              <code className="mx-1 rounded bg-tint px-1.5 py-0.5 font-mono text-[11px] text-flare">/onlydeals.json</code>
              or push a test payload from the control room.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-card/50 px-6 py-16 text-center">
            <p className="font-display text-xl font-bold text-ink-soft">
              {view === "my" ? "Nothing followed here yet" : "No matches"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-faint">
              {view === "my"
                ? "Star a card tier or a merchant and your slice of the board appears here."
                : "Try a different search, or clear the browse scope."}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setScope({ type: "all" });
                if (view === "my") setView("all");
              }}
              className="mt-5 rounded-md bg-brick px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-paper transition-transform hover:-translate-y-0.5"
            >
              Show everything
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((o, i) => (
                <OfferTile
                  key={o.id}
                  offer={o}
                  index={i}
                  followed={offerFollowed(o, follows)}
                  onOpen={setActive}
                  onToggleFollow={onToggleVendor}
                />
              ))}
            </div>

            {viewMode === "infinite" && page < totalPages ? (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-line bg-card px-6 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft transition-colors hover:border-flare hover:text-flare"
                >
                  Load {Math.min(pageSize, filtered.length - page * pageSize)} more
                </button>
              </div>
            ) : null}

            <Paginator
              viewMode={viewMode}
              onViewMode={setViewMode}
              pageSize={pageSize}
              onPageSize={setPageSize}
              page={page}
              totalPages={totalPages}
              onPage={(n) => {
                setPage(n);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              totalItems={filtered.length}
            />
          </>
        )}

        {/* sources */}
        <section className="mt-16">
          <SourcesLedger
            outcomes={outcomes}
            custom={custom}
            onPick={(name) => {
              const asBank = offers.some((o) => o.bank === name);
              setScope(
                asBank ? { type: "bank", bank: name } : { type: "vendor", vendor: name },
              );
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </section>
      </main>

      <Footer provenance={provenance} lastSync={feed?.fetchedAt ?? null} />

      {/* overlays */}
      <BrowseDrawer
        open={drawerOpen}
        offers={offers}
        custom={custom}
        active={scope}
        follows={follows}
        onApply={(s) => {
          setScope(s);
          setDrawerOpen(false);
        }}
        onClose={() => setDrawerOpen(false)}
        onLocked={() => setAuth({ open: true, intent: "follow" })}
        onToggleCard={(bank, card) => toggle(cardKey(bank, card), `${card} (${bank})`)}
        onToggleVendor={(merchant) => toggle(vendorKey(merchant), merchant)}
      />

      {active && (
        <OfferModal
          offer={active}
          scrapedAt={feed?.fetchedAt ?? null}
          generator={generator}
          cardFollowed={follows.includes(cardKey(active.bank, active.card))}
          vendorFollowed={follows.includes(vendorKey(active.merchant))}
          onToggleCard={onToggleCard}
          onToggleVendor={onToggleVendor}
          onClose={() => setActive(null)}
          onToast={say}
        />
      )}

      <AuthModal
        open={auth.open}
        intent={auth.intent}
        onClose={() => setAuth((a) => ({ ...a, open: false }))}
        onAuthed={(u) => {
          setUser(u);
          setFollows(getFollows(u.id));
          setAuth((a) => ({ ...a, open: false }));
          say(`Signed in as ${u.displayName || u.username}`);
        }}
      />

      {toast && (
        <div className="modal-pop fixed bottom-5 left-1/2 z-[90] -translate-x-1/2 rounded-md border border-line bg-term px-4 py-2.5 font-mono text-[11.5px] tracking-wide text-ink shadow-xl">
          {toast}
        </div>
      )}
    </div>
  );
}
