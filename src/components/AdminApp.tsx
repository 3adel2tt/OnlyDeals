import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomSource, User } from "../types";
import { DEMO_ADMIN, SESSION_KEY, USERS_KEY, ensureSeeded, login, logout } from "../lib/auth";
import {
  FEED_URL,
  clearLocalFeed,
  readLocalFeed,
  testPushPayload,
  pushLocalFeed,
} from "../lib/feed";
import { timeAgo } from "../lib/format";
import AddSourceModal from "./AddSourceModal";
import {
  ArrowUpRight,
  BrandMark,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  LockIcon,
  LogoutIcon,
  MoonIcon,
  PlusIcon,
  PulseIcon,
  RefreshIcon,
  StoreIcon,
  SunIcon,
  WorkflowIcon,
} from "./icons";

const REGISTRY_KEY = "onlydeals.registry.v1";
const WEBHOOKS_KEY = "onlydeals.webhooks.v1";
const WORKFLOWS_KEY = "onlydeals.workflows.v1";
const SVC_KEY = "onlydeals.svc.v1";
const DEFAULT_BASE = "https://n8n.your-domain.com/webhook";

/* readable grays for the dark control room (near-white on near-black) */
const T_BODY = "text-[#ddd2ca]"; // body / helper text
const T_SEC = "text-[#cbbcb3]"; // secondary labels, nav, icons
const T_META = "text-[#b3a29a]"; // small meta labels
const T_CODE = "text-[#f0e7e0]"; // code / mono values

/* ---------------- workflow discovery ---------------- */

type WorkflowOrigin = "bundled" | "feed" | "registered" | "custom";

interface WorkflowEntry {
  id: string;
  name: string;
  type: "source" | "scheduler";
  webhook: string | null;
  file?: string;
  description?: string;
  origin: WorkflowOrigin;
}

interface ManifestFile {
  version: number;
  workflows: Array<{
    id: string;
    name: string;
    type: "source" | "scheduler";
    file: string;
    webhook: string | null;
    description?: string;
  }>;
}

function saveRegistry(list: CustomSource[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function loadKnownWorkflows(): WorkflowEntry[] {
  try {
    const raw = localStorage.getItem(WORKFLOWS_KEY);
    return raw ? (JSON.parse(raw) as WorkflowEntry[]) : [];
  } catch {
    return [];
  }
}

/** Extracts `n8n:<id>` generator names from whatever the ingest has seen. */
function discoveredFromFeed(): string[] {
  const feed = readLocalFeed();
  if (!feed) return [];
  const ids = new Set<string>();
  const g = feed.generator || "";
  if (g.startsWith("n8n:")) ids.add(g.slice(4));
  for (const s of feed.sources ?? []) if (s.id) ids.add(s.id);
  return Array.from(ids);
}

const INGEST_CONTRACT = `n8n writes straight into Postgres (upsert), and the feed
service reads that table to build the board. The DB is the source
of truth — configure it on the DATABASE page.

offer.v1 card schema (unchanged):
{
  "id", "merchant", "headline", "discountLabel", "value",
  "kind", "category", "image", "cards", "code", "link",
  "expiresAt", "terms", "bank", "card"
}`;

function loadRegistry(): CustomSource[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as CustomSource[]) : [];
  } catch {
    return [];
  }
}

function saveRegistry(list: CustomSource[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function loadSvc(): { base: string; key: string } {
  try {
    const raw = localStorage.getItem(SVC_KEY);
    if (raw) return JSON.parse(raw) as { base: string; key: string };
  } catch {
    /* ignore */
  }
  const fallback = FEED_URL ? FEED_URL.replace(/\/onlydeals\.json.*$/, "") : "http://localhost:8788";
  return { base: fallback, key: "" };
}

type TriggerState = { state: "idle" | "busy" | "ok" | "fail"; detail?: string };
type TabId = "control" | "workflows" | "database";

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onExit: () => void;
}

export default function AdminApp({ theme, onToggleTheme, onExit }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [tab, setTab] = useState<TabId>("control");
  const [triggers, setTriggers] = useState<Record<string, TriggerState>>({});
  const [webhooks, setWebhooks] = useState<Record<string, string>>(loadWebhooks);
  const [registry, setRegistry] = useState<CustomSource[]>(loadRegistry);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localFeedTick, setLocalFeedTick] = useState(0);
  const [known, setKnown] = useState<WorkflowEntry[]>(loadKnownWorkflows);
  const [manifestTick, setManifestTick] = useState(0);
  const [manifestLoading, setManifestLoading] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  /* add-workflow form */
  const [wfName, setWfName] = useState("");
  const [wfUrl, setWfUrl] = useState("");

  /* database page */
  const [svc, setSvc] = useState<{ base: string; key: string }>(loadSvc);
  const [db, setDb] = useState({
    host: "localhost",
    port: "5432",
    database: "onlydeals",
    user: "onlydeals",
    password: "",
    table: "offers",
  });
  const [dbBusy, setDbBusy] = useState<null | "test" | "save" | "load">(null);
  const [dbResult, setDbResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    ensureSeeded();
    let sessionId: string | null = null;
    try {
      sessionId = localStorage.getItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    if (sessionId) {
      try {
        const raw = localStorage.getItem(USERS_KEY);
        const users = raw ? (JSON.parse(raw) as User[]) : [];
        const u = users.find((x) => x.id === sessionId);
        if (u && u.role === "admin") setUser(u);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(webhooks));
    } catch {
      /* ignore */
    }
  }, [webhooks]);

  useEffect(() => {
    try {
      localStorage.setItem(SVC_KEY, JSON.stringify(svc));
    } catch {
      /* ignore */
    }
  }, [svc]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  /* ---------- workflow auto-discovery: manifest ∪ feed ∪ remembered ---------- */
  useEffect(() => {
    let cancelled = false;
    setManifestLoading(true);
    fetch("workflows/manifest.json", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ManifestFile>) : Promise.reject(new Error("no manifest"))))
      .then((m) => {
        if (cancelled) return;
        const bundled: WorkflowEntry[] = m.workflows.map((w) => ({ ...w, origin: "bundled" }));
        setKnown((prev) => {
          const merged = [...bundled];
          const seen = new Set(bundled.map((b) => b.id));
          for (const p of prev) {
            if (!seen.has(p.id)) {
              merged.push(p);
              seen.add(p.id);
            }
          }
          for (const id of discoveredFromFeed()) {
            if (!seen.has(id)) {
              merged.push({
                id,
                name: id.charAt(0).toUpperCase() + id.slice(1),
                type: "source",
                webhook: `onlydeals-${id}`,
                origin: "feed",
                description: "Spotted in the ingest feed — its workflow ran at least once.",
              });
              seen.add(id);
            }
          }
          try {
            localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(merged));
          } catch {
            /* ignore */
          }
          return merged;
        });
        setManifestLoading(false);
      })
      .catch(() => {
        if (!cancelled) setManifestLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manifestTick, localFeedTick]);

  const workflows = useMemo(() => known, [known]);
  const localFeed = readLocalFeed();

  const doLogin = () => {
    const res = login(username, password, { requireAdmin: true });
    if (!res.ok) {
      setError(res.error);
      setShake((s) => s + 1);
      return;
    }
    setUser(res.user);
    setUsername("");
    setPassword("");
    setError(null);
  };

  const doLogout = () => {
    logout();
    setUser(null);
  };

  const webhookFor = (id: string) => webhooks[id] ?? `${DEFAULT_BASE}/onlydeals-${id}`;

  const triggerNow = async (id: string, name: string) => {
    const url = webhookFor(id);
    setTriggers((t) => ({ ...t, [id]: { state: "busy" } }));
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredFrom: "control-room", at: new Date().toISOString() }),
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      setTriggers((t) => ({ ...t, [id]: { state: "ok", detail: `HTTP ${res.status} — workflow ran` } }));
      showToast(`${name}: webhook returned ${res.status}`);
    } catch {
      setTriggers((t) => ({ ...t, [id]: { state: "fail", detail: "unreachable — is the workflow deployed & active?" } }));
      showToast(`${name}: webhook unreachable`);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copied`);
    } catch {
      showToast(text);
    }
  };

  const pushTest = () => {
    pushLocalFeed(testPushPayload());
    setLocalFeedTick((x) => x + 1);
    showToast("Test feed pushed — new generators appear in Workflows on rescan");
  };

  /* ---------- add a workflow manually (registers a triggerable source) ---------- */
  const addWorkflow = () => {
    const name = wfName.trim();
    const url = wfUrl.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    if (!id) return showToast("Enter a source name");
    if (!/^https?:\/\//i.test(url)) return showToast("Webhook URL must start with http:// or https://");
    if (known.some((k) => k.id === id)) return showToast("A workflow with that name already exists");

    const entry: WorkflowEntry = {
      id,
      name,
      type: "source",
      webhook: url,
      origin: "custom",
      description: "Registered manually from the control room.",
    };
    setKnown((prev) => {
      const next = [...prev, entry];
      try {
        localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setWebhooks((prev) => ({ ...prev, [id]: url }));
    setWfName("");
    setWfUrl("");
    showToast(`${name} registered — trigger it from the pipeline`);
  };

  /* ---------- database page: test / save against the feed service ---------- */
  const loadDbConfig = useCallback(async () => {
    setDbBusy("load");
    setDbResult(null);
    try {
      const res = await fetch(`${svc.base.replace(/\/+$/, "")}/api/db/config`, {
        headers: { "x-api-key": svc.key },
      });
      const j = (await res.json()) as { ok?: boolean; configured?: boolean; config?: Partial<typeof db> };
      if (res.ok && j.ok && j.config) {
        setDb((prev) => ({
          ...prev,
          host: j.config!.host ?? prev.host,
          port: j.config!.port != null ? String(j.config!.port) : prev.port,
          database: j.config!.database ?? prev.database,
          user: j.config!.user ?? prev.user,
          table: j.config!.table ?? prev.table,
          password: "",
        }));
        setDbResult({
          ok: true,
          message: j.configured
            ? "Loaded saved config from the server (password hidden)."
            : "Connected to the feed service — no DB config saved yet.",
        });
      } else {
        setDbResult({ ok: false, message: "Feed service replied unexpectedly on /api/db/config." });
      }
    } catch {
      setDbResult({ ok: false, message: "Could not reach the feed service — check the base URL and that it's running." });
    } finally {
      setDbBusy(null);
    }
  }, [svc.base, svc.key]);

  useEffect(() => {
    if (user) void loadDbConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const dbCall = async (kind: "test" | "save") => {
    setDbBusy(kind);
    setDbResult(null);
    try {
      const res = await fetch(`${svc.base.replace(/\/+$/, "")}/api/db/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": svc.key },
        body: JSON.stringify({
          host: db.host,
          port: Number(db.port) || 5432,
          database: db.database,
          user: db.user,
          password: db.password,
          table: db.table,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (res.ok && j.ok) {
        setDbResult({ ok: true, message: j.message ?? (kind === "test" ? "Connection OK." : "Saved.") });
        showToast(kind === "test" ? "Postgres connection OK" : "DB config saved server-side");
      } else {
        setDbResult({ ok: false, message: j.error ?? j.message ?? `HTTP ${res.status}` });
      }
    } catch {
      setDbResult({ ok: false, message: "Could not reach the feed service — check the base URL and that it's running." });
    } finally {
      setDbBusy(null);
    }
  };

  /* ---------------- login gate ---------------- */
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-term px-4 text-paper">
        <div key={shake} className={`w-full max-w-sm ${error ? "shake-x" : ""}`}>
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10" />
            <div>
              <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${T_SEC}`}>
                onlydeals /// control room
              </p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                Admin access only
              </h1>
            </div>
          </div>
          <p className={`mt-3 text-[13px] leading-relaxed ${T_BODY}`}>
            Scraping, workflows, the database and the source registry are managed here. The
            public site only reads what the n8n pipeline writes to Postgres.
          </p>

          <div className="mt-5 rounded-xl border border-term-line bg-[#1f1412] p-5">
            <div className="space-y-3">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="Username"
                autoFocus
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-paper placeholder:text-[#8f7f77] focus:border-flare focus:outline-none"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                type="password"
                placeholder="Password"
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-paper placeholder:text-[#8f7f77] focus:border-flare focus:outline-none"
              />
              {error && (
                <p className="fade-in flex items-center gap-2 rounded-lg border border-[#f07a5f]/40 bg-[#f07a5f]/10 px-3 py-2 text-[12.5px] font-medium text-[#f07a5f]">
                  <CloseIcon className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <button
                onClick={doLogin}
                className="w-full rounded-full bg-flare px-5 py-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-[#2b0c08] transition-all hover:bg-paper active:scale-[0.98]"
              >
                Unlock control room
              </button>
            </div>
            <div className="mt-4 border-t border-term-line pt-3">
              <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${T_META}`}>
                seeded demo admin
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <code className="rounded border border-flare/40 bg-flare/10 px-2 py-0.5 font-mono text-[11.5px] font-semibold text-flare">
                  {DEMO_ADMIN.username} / {DEMO_ADMIN.password}
                </code>
                <button
                  onClick={() => {
                    setUsername(DEMO_ADMIN.username);
                    setPassword(DEMO_ADMIN.password);
                    setError(null);
                  }}
                  className="rounded-full bg-paper px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-term transition-colors hover:bg-flare"
                >
                  Fill
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={onExit}
            className={`mt-4 flex w-full items-center justify-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] ${T_SEC} transition-colors hover:text-flare`}
          >
            ← back to the public site
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- control room ---------------- */
  const sourceWorkflows = workflows.filter((w) => w.type === "source");

  const NAV: Array<{ id: TabId; label: string }> = [
    { id: "control", label: "Overview" },
    { id: "workflows", label: `Workflows · ${workflows.length}` },
    { id: "database", label: "Database" },
  ];

  return (
    <div className="min-h-screen bg-term text-paper">
      <header className="sticky top-0 z-40 border-b border-term-line bg-term/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandMark className="h-8 w-8" />
          <div className="leading-none">
            <p className="font-display text-lg font-extrabold tracking-tight">
              only<span className="text-flare">deals</span> · CONTROL ROOM
            </p>
            <p className={`mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.22em] ${T_SEC}`}>
              admin · n8n ops
            </p>
          </div>

          <nav className="ml-4 hidden items-center gap-1 rounded-full border border-term-line bg-[#1f1412] p-1 sm:flex">
            {NAV.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all ${
                  tab === t.id ? "bg-flare font-semibold text-[#2b0c08]" : `${T_SEC} hover:text-paper`
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
              className={`flex h-9 w-9 items-center justify-center rounded-full border border-term-line ${T_SEC} transition-all hover:rotate-12 hover:border-amber hover:text-amber`}
            >
              {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
            <span className="hidden items-center gap-1.5 rounded-full border border-flare/40 bg-flare/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-flare lg:flex">
              <LockIcon className="h-3 w-3" />
              {user.displayName}
            </span>
            <button
              onClick={onExit}
              className={`flex items-center gap-1.5 rounded-full border border-term-line px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] ${T_BODY} transition-colors hover:border-flare/50 hover:text-flare`}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              public site
            </button>
            <button
              onClick={doLogout}
              className={`rounded-full border border-term-line p-2 ${T_SEC} transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]`}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-term-line px-4 py-2 sm:hidden">
          {NAV.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all ${
                tab === t.id ? "bg-flare font-semibold text-[#2b0c08]" : `border border-term-line ${T_SEC}`
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* ================= WORKFLOWS PAGE ================= */}
        {tab === "workflows" && (
          <>
            <section className="rounded-xl border border-term-line bg-[#1f1412]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">
                    /// workflows · trigger deck
                  </p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">
                    Every workflow on the radar
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setManifestTick((x) => x + 1);
                      showToast("Rescanning manifest + ingest feed…");
                    }}
                    disabled={manifestLoading}
                    className={`flex items-center gap-2 rounded-full border border-term-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] ${T_BODY} transition-colors hover:border-flare/50 hover:text-flare disabled:opacity-50`}
                  >
                    <RefreshIcon className={`h-3.5 w-3.5 ${manifestLoading ? "spin" : ""}`} />
                    rescan
                  </button>
                </div>
              </div>

              <div className="px-5 py-4">
                <p className={`max-w-2xl text-[12.5px] leading-relaxed ${T_BODY}`}>
                  Workflows appear here <span className="font-semibold text-paper">by themselves</span>:
                  the page scans <code className="text-flare">workflows/manifest.json</code> on load, and any
                  workflow that has ever posted to the feed (its{" "}
                  <code className="text-flare">generator</code> tag) is picked up automatically. You can also
                  register one manually from the Overview pipeline. The only action from here is a trigger.
                </p>
              </div>

              <div className="divide-y divide-term-line">
                {workflows.length === 0 && (
                  <p className={`px-5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] ${T_META}`}>
                    {manifestLoading ? "scanning…" : "no workflows found — import one and it will show up"}
                  </p>
                )}
                {workflows.map((w, i) => {
                  const t = triggers[w.id] ?? { state: "idle" as const };
                  const url = w.webhook ? webhookFor(w.id) : null;
                  return (
                    <div
                      key={w.id}
                      className="row-in flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-term/40"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-flare/30 bg-flare/10 text-flare">
                        <WorkflowIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-[180px]">
                        <p className="flex items-center gap-2 font-display text-[15px] font-bold tracking-tight">
                          {w.name}
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] ${
                              w.origin === "bundled"
                                ? `border border-term-line ${T_SEC}`
                                : w.origin === "feed"
                                  ? "bg-live/15 text-[#4fd68c]"
                                  : w.origin === "custom"
                                    ? "border border-flare/40 text-flare"
                                    : "bg-amber/15 text-amber"
                            }`}
                          >
                            {w.origin === "feed" ? "auto-discovered" : w.origin}
                          </span>
                        </p>
                        <p className={`mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${T_META}`}>
                          {w.type === "scheduler"
                            ? "cron · fans out to sources"
                            : w.origin === "custom"
                              ? "custom webhook"
                              : `webhook · onlydeals-${w.id}`}
                          {w.file ? ` · ${w.file}` : ""}
                        </p>
                      </div>

                      {url ? (
                        <>
                          <code className={`hidden min-w-0 flex-1 truncate rounded border border-term-line bg-term px-3 py-2 font-mono text-[10.5px] ${T_CODE} md:block`}>
                            {url}
                          </code>
                          <button
                            onClick={() => copy(url, "Webhook URL")}
                            className={`rounded-full border border-term-line p-2 ${T_SEC} transition-colors hover:border-flare/50 hover:text-flare`}
                            title="Copy webhook URL"
                            aria-label={`Copy webhook URL for ${w.name}`}
                          >
                            <CopyIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => triggerNow(w.id, w.name)}
                            disabled={t.state === "busy"}
                            className="flex items-center gap-2 rounded-full bg-flare px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95 disabled:opacity-60"
                          >
                            {t.state === "busy" ? (
                              <span className="spin inline-block h-3 w-3 rounded-full border-2 border-[#2b0c08]/30 border-t-[#2b0c08]" />
                            ) : (
                              <PulseIcon className="h-3.5 w-3.5" />
                            )}
                            {t.state === "busy" ? "running…" : "trigger"}
                          </button>
                        </>
                      ) : (
                        <span className={`rounded-full border border-dashed border-term-line px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] ${T_META}`}>
                          schedule-driven · no webhook
                        </span>
                      )}

                      <p
                        className={`w-full pl-12 font-mono text-[10px] md:ml-1 md:w-auto md:pl-0 ${
                          t.state === "ok" ? "text-[#4fd68c]" : t.state === "fail" ? "text-[#f07a5f]" : T_META
                        }`}
                      >
                        {t.detail ?? ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-term-line bg-[#1f1412] p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// how discovery works</p>
              <ol className={`mt-3 list-decimal space-y-1.5 pl-5 font-mono text-[11.5px] leading-relaxed ${T_BODY}`}>
                <li>
                  Deploy a new n8n workflow that upserts into the Postgres offers table and tags its run with a{" "}
                  <code className="text-flare">generator</code>, or register its webhook manually on the Overview.
                </li>
                <li>Run it once (from here, or let the master scheduler do it).</li>
                <li>
                  It lands on this page automatically — no config, no restart. Add it to{" "}
                  <code className="text-flare">manifest.json</code> to pin it permanently.
                </li>
              </ol>
            </section>
          </>
        )}

        {/* ================= DATABASE PAGE ================= */}
        {tab === "database" && (
          <section className="rounded-xl border border-term-line bg-[#1f1412]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-term-line px-5 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// database · source of truth</p>
                <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Postgres behind the feed</h2>
              </div>
              <p className={`max-w-sm text-[12px] leading-relaxed ${T_BODY}`}>
                The public board is generated from this database. n8n upserts offers into the table;
                the feed service reads it and serves <code className="text-flare">onlydeals.json</code>.
              </p>
            </div>

            <div className="space-y-5 p-5">
              {/* feed-service auth */}
              <div className="rounded-lg border border-term-line bg-term p-4">
                <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${T_META}`}>feed service (owns the DB credentials)</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr_auto]">
                  <div>
                    <label className={`mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] ${T_META}`}>service base url</label>
                    <input
                      value={svc.base}
                      onChange={(e) => setSvc((s) => ({ ...s, base: e.target.value }))}
                      placeholder="https://deals.your-domain.com"
                      className={`w-full rounded-lg border border-term-line bg-[#1f1412] px-3 py-2 font-mono text-[11.5px] ${T_CODE} placeholder:text-[#8f7f77] focus:border-flare focus:outline-none`}
                    />
                  </div>
                  <div>
                    <label className={`mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] ${T_META}`}>service api key (x-api-key)</label>
                    <input
                      value={svc.key}
                      onChange={(e) => setSvc((s) => ({ ...s, key: e.target.value }))}
                      type="password"
                      placeholder="OFFRADAR_API_KEY"
                      className={`w-full rounded-lg border border-term-line bg-[#1f1412] px-3 py-2 font-mono text-[11.5px] ${T_CODE} placeholder:text-[#8f7f77] focus:border-flare focus:outline-none`}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => void loadDbConfig()}
                      disabled={dbBusy === "load"}
                      className={`flex h-[38px] items-center gap-1.5 rounded-lg border border-term-line px-3 font-mono text-[10px] uppercase tracking-[0.12em] ${T_BODY} transition-colors hover:border-flare/50 hover:text-flare disabled:opacity-50`}
                    >
                      <RefreshIcon className={`h-3.5 w-3.5 ${dbBusy === "load" ? "spin" : ""}`} />
                      reload
                    </button>
                  </div>
                </div>
                <p className={`mt-2 text-[11px] leading-relaxed ${T_META}`}>
                  This is the feed-service auth, kept in this browser only. The DB password below is sent
                  straight to the service and stored server-side (chmod 600) — never here, never in the repo.
                </p>
              </div>

              {/* db connection fields */}
              <div>
                <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${T_META}`}>connection</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      { k: "host", label: "host", ph: "localhost", type: "text" },
                      { k: "port", label: "port", ph: "5432", type: "text" },
                      { k: "database", label: "database", ph: "onlydeals", type: "text" },
                      { k: "user", label: "user", ph: "onlydeals", type: "text" },
                      { k: "password", label: "password", ph: "••••••••", type: "password" },
                      { k: "table", label: "table name", ph: "offers", type: "text" },
                    ] as const
                  ).map((f) => (
                    <div key={f.k}>
                      <label className={`mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] ${T_META}`}>{f.label}</label>
                      <input
                        value={db[f.k]}
                        onChange={(e) => setDb((d) => ({ ...d, [f.k]: e.target.value }))}
                        type={f.type}
                        placeholder={f.ph}
                        className={`w-full rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11.5px] ${T_CODE} placeholder:text-[#8f7f77] focus:border-flare focus:outline-none`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* actions + result */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void dbCall("test")}
                  disabled={dbBusy !== null}
                  className="flex items-center gap-2 rounded-full border border-flare/50 px-4 py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-flare transition-all hover:bg-flare hover:text-[#2b0c08] active:scale-95 disabled:opacity-50"
                >
                  {dbBusy === "test" ? (
                    <span className="spin inline-block h-3 w-3 rounded-full border-2 border-flare/30 border-t-flare" />
                  ) : (
                    <PulseIcon className="h-3.5 w-3.5" />
                  )}
                  {dbBusy === "test" ? "testing…" : "test connection"}
                </button>
                <button
                  onClick={() => void dbCall("save")}
                  disabled={dbBusy !== null}
                  className="flex items-center gap-2 rounded-full bg-flare px-4 py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95 disabled:opacity-50"
                >
                  {dbBusy === "save" ? (
                    <span className="spin inline-block h-3 w-3 rounded-full border-2 border-[#2b0c08]/30 border-t-[#2b0c08]" />
                  ) : (
                    <CheckIcon className="h-3.5 w-3.5" />
                  )}
                  {dbBusy === "save" ? "saving…" : "save"}
                </button>
              </div>

              {dbResult && (
                <p
                  className={`fade-in rounded-lg border px-3.5 py-2.5 font-mono text-[11.5px] leading-relaxed ${
                    dbResult.ok
                      ? "border-live/40 bg-live/10 text-[#4fd68c]"
                      : "border-[#f07a5f]/40 bg-[#f07a5f]/10 text-[#f07a5f]"
                  }`}
                >
                  {dbResult.ok ? "✓ " : "✗ "}
                  {dbResult.message}
                </p>
              )}

              <p className={`text-[11px] leading-relaxed ${T_META}`}>
                TEST opens a real connection and runs <code className={T_CODE}>SELECT 1</code> against the table,
                reporting the exact driver error on failure. SAVE writes the config to the server's{" "}
                <code className={T_CODE}>/etc/onlydeals/db.json</code> (chmod 600).
              </p>
            </div>
          </section>
        )}

        {/* ================= OVERVIEW ================= */}
        {tab === "control" && (
          <>
            <section className="rounded-xl border border-term-line bg-[#1f1412]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 01 · source pipeline</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">What's wired</h2>
                </div>
                <p className={`max-w-sm text-[12px] leading-relaxed ${T_BODY}`}>
                  Offers only enter the board through n8n — a manual trigger from here / the Workflows
                  page, or the master scheduler's cron — writing into Postgres.
                </p>
              </div>
              <div className="divide-y divide-term-line">
                {sourceWorkflows.length === 0 && (
                  <p className={`px-5 py-6 font-mono text-[11px] uppercase tracking-[0.12em] ${T_META}`}>
                    no source workflows registered yet
                  </p>
                )}
                {sourceWorkflows.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[11px] font-extrabold text-flare">
                      {p.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-[150px]">
                      <p className="font-display text-[15px] font-bold tracking-tight">{p.name}</p>
                      <p className={`font-mono text-[9.5px] uppercase tracking-[0.12em] ${T_META}`}>
                        engine onlydeals-{p.id}
                      </p>
                    </div>
                    <input
                      value={webhookFor(p.id)}
                      onChange={(e) => setWebhooks((w) => ({ ...w, [p.id]: e.target.value }))}
                      className={`min-w-[220px] flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] ${T_CODE} focus:border-flare focus:outline-none`}
                      aria-label={`Webhook URL for ${p.name}`}
                    />
                    <span
                      className={`rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] ${
                        p.origin === "feed"
                          ? "bg-live/15 text-[#4fd68c]"
                          : p.origin === "custom"
                            ? "border border-flare/40 text-flare"
                            : `border border-term-line ${T_SEC}`
                      }`}
                    >
                      {p.origin === "feed" ? "auto-discovered" : p.origin}
                    </span>
                    <button
                      onClick={() => setTab("workflows")}
                      className="flex items-center gap-1.5 rounded-full border border-flare/40 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-flare transition-all hover:bg-flare hover:text-[#2b0c08] active:scale-95"
                    >
                      <PulseIcon className="h-3.5 w-3.5" />
                      trigger
                    </button>
                  </div>
                ))}

                {/* add a workflow manually */}
                <div className="px-5 py-4">
                  <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${T_META}`}>add a workflow</p>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      placeholder="Source name (e.g. Alinma)"
                      className={`sm:w-56 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] ${T_CODE} placeholder:text-[#8f7f77] focus:border-flare focus:outline-none`}
                    />
                    <input
                      value={wfUrl}
                      onChange={(e) => setWfUrl(e.target.value)}
                      placeholder="n8n webhook URL (https://…/webhook/onlydeals-alinma)"
                      className={`flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] ${T_CODE} placeholder:text-[#8f7f77] focus:border-flare focus:outline-none`}
                    />
                    <button
                      onClick={addWorkflow}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-flare px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      add workflow
                    </button>
                  </div>
                  <p className={`mt-2 text-[11px] leading-relaxed ${T_META}`}>
                    Registers a source row with a working trigger — it appears here and on the Workflows
                    page, and persists across reloads.
                  </p>
                </div>

                <p className={`px-5 py-3 font-mono text-[9.5px] uppercase tracking-[0.14em] ${T_META}`}>
                  also in the fleet: {workflows.filter((w) => w.type === "scheduler").map((w) => w.name).join(", ") || "—"}
                </p>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-term-line bg-[#1f1412]">
                <div className="border-b border-term-line px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 02 · n8n workflows</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Import these</h2>
                </div>
                <div className="space-y-3 p-5">
                  {workflows
                    .filter((w) => w.file)
                    .map((w) => (
                      <div key={w.file} className="rounded-lg border border-term-line bg-term p-4 transition-colors hover:border-flare/40">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-[14.5px] font-bold tracking-tight">{w.name}</p>
                            <p className={`mt-1 text-[12px] leading-relaxed ${T_BODY}`}>
                              {w.description ??
                                (w.type === "scheduler"
                                  ? "Cron every 6h. Reads the plug-and-play source registry and fans out a webhook call per source."
                                  : "Webhook → fetch offers page → extraction → upsert into Postgres.")}
                            </p>
                          </div>
                          <a
                            href={`workflows/${w.file}`}
                            download
                            className="flex shrink-0 items-center gap-1.5 rounded-full bg-flare px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95"
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                            .json
                          </a>
                        </div>
                        <p className={`mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] ${T_META}`}>
                          {w.file}
                        </p>
                      </div>
                    ))}
                  <ol className={`list-decimal space-y-1 pl-5 font-mono text-[11px] leading-relaxed ${T_BODY}`}>
                    <li>Import the workflows into your n8n instance (Workflows → Import from file).</li>
                    <li>
                      Set env vars: <code className="text-flare">OFFRADAR_INGEST_URL</code>,{" "}
                      <code className="text-flare">OFFRADAR_API_KEY</code>,{" "}
                      <code className="text-flare">OFFRADAR_N8N_BASE</code> (see{" "}
                      <code className="text-flare">deploy/DEPLOY.md</code>).
                    </li>
                    <li>Configure Postgres on the Database page, then activate the master scheduler.</li>
                    <li>
                      Point <code className="text-flare">FEED_URL</code> in{" "}
                      <code className="text-flare">src/lib/feed.ts</code> at the feed service's{" "}
                      <code className="text-flare">/onlydeals.json</code>.
                    </li>
                  </ol>
                </div>
              </section>

              <section className="rounded-xl border border-term-line bg-[#1f1412]">
                <div className="border-b border-term-line px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 03 · data flow</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Postgres is the source of truth</h2>
                </div>
                <div className="p-5">
                  <pre className={`overflow-x-auto rounded-lg border border-term-line bg-term p-4 font-mono text-[11px] leading-relaxed ${T_CODE}`}>
                    {INGEST_CONTRACT}
                  </pre>
                  <p className={`mt-3 font-mono text-[10px] uppercase tracking-[0.12em] ${T_META}`}>
                    remote feed url:{" "}
                    <span className={FEED_URL ? "text-[#4fd68c]" : "text-amber"}>
                      {FEED_URL ?? "not configured (src/lib/feed.ts)"}
                    </span>
                  </p>

                  <div className="mt-4 rounded-lg border border-term-line bg-term p-4">
                    <p className={`font-mono text-[9.5px] uppercase tracking-[0.16em] ${T_META}`}>
                      local ingest store (this browser)
                    </p>
                    {localFeed ? (
                      <p className={`mt-1.5 text-[12.5px] ${T_BODY}`}>
                        <span className="font-semibold text-[#4fd68c]">{localFeed.offers.length} offers</span>{" "}
                        · generator <span className="font-mono text-flare">{localFeed.generator}</span> ·{" "}
                        {timeAgo(Date.parse(localFeed.generatedAt))}
                      </p>
                    ) : (
                      <p className={`mt-1.5 text-[12.5px] ${T_META}`}>empty — the board shows “waiting for first n8n sync”</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={pushTest}
                        className="flex items-center gap-1.5 rounded-full bg-amber px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink transition-all hover:bg-paper active:scale-95"
                      >
                        <PulseIcon className="h-3.5 w-3.5" />
                        push test snapshot
                      </button>
                      {localFeed && (
                        <button
                          onClick={() => {
                            clearLocalFeed();
                            setLocalFeedTick((x) => x + 1);
                            showToast("Local feed cleared");
                          }}
                          className={`flex items-center gap-1.5 rounded-full border border-term-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] ${T_SEC} transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]`}
                        >
                          <CloseIcon className="h-3 w-3" />
                          clear
                        </button>
                      )}
                    </div>
                    <p className={`mt-2 text-[11px] leading-relaxed ${T_META}`}>
                      Simulates a feed push for layout testing — real offers come from Postgres.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-term-line bg-[#1f1412]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 04 · source registry</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">
                    Banks & vendors on the radar
                  </h2>
                </div>
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-2 rounded-full bg-flare px-4 py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  register a bank / vendor
                </button>
              </div>
              <div className="p-5">
                {registry.length === 0 ? (
                  <p className={`flex items-center gap-2 text-[12.5px] ${T_META}`}>
                    <StoreIcon className="h-4 w-4 shrink-0" />
                    Nothing registered beyond the pipeline above. Register a missing bank's offers
                    page and it's queued for its own workflow.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {registry.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-lg border border-term-line bg-term px-3.5 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[12px] font-extrabold text-flare">
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[13.5px] font-bold tracking-tight">{s.name}</span>
                          <span className={`block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] ${T_META}`}>
                            {s.kind} · awaiting workflow
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            const next = registry.filter((x) => x.id !== s.id);
                            setRegistry(next);
                            saveRegistry(next);
                            showToast(`${s.name} removed from registry`);
                          }}
                          className={`rounded-full border border-term-line p-1.5 ${T_SEC} transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]`}
                          aria-label={`Remove ${s.name}`}
                        >
                          <CloseIcon className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <p className={`pb-4 text-center font-mono text-[9.5px] uppercase tracking-[0.18em] ${T_META}`}>
              <CheckIcon className="mr-1 inline h-3 w-3 text-[#4fd68c]" />
              scraping happens only here and on the n8n master scheduler · the public site is read-only
            </p>
          </>
        )}
      </main>

      <AddSourceModal
        open={addOpen}
        sources={registry}
        onAdd={(s) => {
          const next = [...registry, s];
          setRegistry(next);
          saveRegistry(next);
          showToast(`${s.name} registered — queued for its workflow`);
        }}
        onRemove={(id) => {
          const next = registry.filter((x) => x.id !== id);
          setRegistry(next);
          saveRegistry(next);
          showToast("Removed from registry");
        }}
        onClose={() => setAddOpen(false)}
      />

      {toast && (
        <div className="toast-up fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-term-line bg-[#1f1412] px-4 py-2.5 font-mono text-[11.5px] tracking-[0.06em] text-paper shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
          <CheckIcon className="h-3.5 w-3.5 text-flare" />
          {toast}
        </div>
      )}
    </div>
  );
}
