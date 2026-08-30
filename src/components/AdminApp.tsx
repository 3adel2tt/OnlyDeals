import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomSource, User } from "../types";
import { apiLogin, apiLogout, apiMe, dbDelete, dbGet, dbPost, dbPut, DEFAULT_REGISTRY, type Registry } from "../lib/api";
import { clearLocalFeed, FEED_URL, pushLocalFeed, readLocalFeed, testPushPayload } from "../lib/feed";
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
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PulseIcon,
  RefreshIcon,
  SearchIcon,
  StoreIcon,
  SunIcon,
  TrashIcon,
  UserIcon,
  WorkflowIcon,
} from "./icons";

const REGISTRY_KEY = "onlydeals.registry.v1";
const WEBHOOKS_KEY = "onlydeals.webhooks.v1";
const WORKFLOWS_KEY = "onlydeals.workflows.v1";
const APIKEY_KEY = "onlydeals.apikey"; // sessionStorage only — never persisted

/* ---------------- types ---------------- */

interface DbUser {
  id: number;
  email: string;
  display_name: string | null;
  role: string;
  disabled: boolean;
  created_at: string;
}

type WorkflowOrigin = "bundled" | "feed" | "registered";

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
  base?: string;
  workflows: Array<{
    id: string;
    name: string;
    type: "source" | "scheduler";
    file: string;
    webhook: string | null;
    trigger?: string;
    description?: string;
  }>;
}

type TriggerState = { state: "idle" | "busy" | "ok" | "fail"; detail?: string };
type Tab = "overview" | "workflows" | "users";

/* ---------------- helpers ---------------- */

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function discoveredFromFeed(): string[] {
  const feed = readLocalFeed();
  if (!feed) return [];
  const ids = new Set<string>();
  const g = feed.generator || "";
  if (g.startsWith("n8n:")) ids.add(g.slice(4));
  for (const s of feed.sources ?? []) if (s.id) ids.add(s.id);
  return Array.from(ids);
}

const DB_CONTRACT = `-- every source workflow writes straight to Postgres
INSERT INTO offers (source, ext_id, merchant, …, last_seen, active)
VALUES ('<source>', …, now(), true)
ON CONFLICT (source, ext_id) DO UPDATE
  SET …, last_seen = EXCLUDED.last_seen, active = true;

-- then prunes what disappeared from the site
UPDATE offers SET active = false
WHERE source = '<source>' AND active = true
  AND last_seen < now() - interval '12 hours';

-- the feed service serves the merge:
GET /onlydeals.json   → offer.v1 payload from active rows`;

interface Props {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onExit: () => void;
}

/* ================================================================== */

export default function AdminApp({ theme, onToggleTheme, onExit }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [triggers, setTriggers] = useState<Record<string, TriggerState>>({});
  const [registry, setRegistry] = useState<Registry>(() => loadJson(REGISTRY_KEY, DEFAULT_REGISTRY));
  const [customSources, setCustomSources] = useState<CustomSource[]>(() => loadJson("onlydeals.sources.v1", []));
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localFeedTick, setLocalFeedTick] = useState(0);
  const [known, setKnown] = useState<WorkflowEntry[]>(() => loadJson(WORKFLOWS_KEY, []));
  const [manifestTick, setManifestTick] = useState(0);
  const [manifestLoading, setManifestLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(APIKEY_KEY) ?? "");
  const [keyDraft, setKeyDraft] = useState("");

  // users tab state
  const [users, setUsers] = useState<DbUser[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userQuery, setUserQuery] = useState("");
  const [tempPw, setTempPw] = useState<{ id: number; pw: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);

  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }, []);

  /* ---------- session restore ---------- */
  useEffect(() => {
    void apiMe().then((u) => {
      if (u && u.role === "admin") setUser(u);
    });
  }, []);

  /* ---------- registry: server-truthful, localStorage fallback ----------
   * Writes go to PUT /api/db/registry first (the feed service persists them to
   * /etc/onlydeals/registry.json, creating the file if missing). Only after the
   * server acks do we adopt the change as truth — so nothing "disappears on
   * refresh": either the server has it, or the save visibly failed.
   */
  const didLocalWrite = useRef(false);
  useEffect(() => {
    if (!apiKey) return;
    dbGet<Registry>(apiKey, "/registry")
      .then((r) => {
        // never clobber a write that just happened in this session
        if (didLocalWrite.current) return;
        if (r && r.base) {
          setRegistry(r);
          saveJson(REGISTRY_KEY, r);
        }
      })
      .catch(() => showToast("Registry: using local copy (server unreachable or bad key)"));
  }, [apiKey, showToast]);

  const saveRegistry = async (next: Registry): Promise<boolean> => {
    if (apiKey) {
      try {
        const saved = await dbPut<Registry>(apiKey, "/registry", next);
        const truth =
          saved && typeof saved.base === "string" && saved.webhooks
            ? { ...next, ...saved, webhooks: { ...next.webhooks, ...saved.webhooks } }
            : next;
        didLocalWrite.current = true;
        setRegistry(truth);
        saveJson(REGISTRY_KEY, truth);
        showToast("Registry saved to server");
        return true;
      } catch (e) {
        // keep a local copy so work isn't lost, but be loud about it
        setRegistry(next);
        saveJson(REGISTRY_KEY, next);
        showToast(
          `Server save failed (${e instanceof Error ? e.message : "HTTP error"}) — kept a local copy only`,
        );
        return false;
      }
    }
    didLocalWrite.current = true;
    setRegistry(next);
    saveJson(REGISTRY_KEY, next);
    showToast("Registry saved locally — set the x-api-key to persist it to the server");
    return true;
  };

  /* ---------- workflow auto-discovery ---------- */
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
          saveJson(WORKFLOWS_KEY, merged);
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

  const workflows = useMemo(() => {
    // manifest/local entries first, then anything that only lives in the
    // server-side trigger registry (added via "Add a workflow").
    const merged = [...known];
    const seen = new Set(known.map((k) => k.id));
    for (const id of Object.keys(registry.webhooks)) {
      if (seen.has(id)) continue;
      merged.push({
        id,
        name: registry.names?.[id] || id.charAt(0).toUpperCase() + id.slice(1),
        type: "source",
        webhook: `onlydeals-${id}`,
        origin: "registered",
        description: "Registered via the Control Room.",
      });
      seen.add(id);
    }
    return merged;
  }, [known, registry]);
  const localFeed = readLocalFeed();

  const isPaused = (id: string) => !!registry.disabled?.[id];

  /* ---------- auth ---------- */
  const doLogin = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await apiLogin(email.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setShake((s) => s + 1);
      return;
    }
    if (res.user.role !== "admin") {
      await apiLogout();
      setError("That account isn't an admin. The Control Room is admin-only.");
      setShake((s) => s + 1);
      return;
    }
    setUser(res.user);
    setEmail("");
    setPassword("");
  };

  const doLogout = async () => {
    await apiLogout();
    setUser(null);
  };

  /* ---------- trigger ---------- */
  const webhookFor = (id: string) =>
    registry.webhooks[id] ?? `${registry.base.replace(/\/+$/, "")}/webhook/onlydeals-${id}`;

  /* ---------- trigger / reachability probe ----------
   * n8n Webhook nodes are POST-only and rarely send CORS headers, so a
   * browser-direct fetch fails even for perfectly healthy webhooks. The probe
   * therefore goes through the feed service (POST /api/db/probe), which makes
   * the request server-side and treats any 2xx — empty body included — as
   * "reachable". Direct POST is kept as a no-key fallback.
   */
  const triggerNow = async (id: string, name: string) => {
    if (isPaused(id)) {
      showToast(`${name} is paused — resume it before triggering`);
      return;
    }
    const url = webhookFor(id);
    const payload = { triggeredFrom: "control-room", at: new Date().toISOString() };
    setTriggers((t) => ({ ...t, [id]: { state: "busy" } }));
    const okState = (status: number, ms?: number): TriggerState => ({
      state: "ok",
      detail: `reachable · HTTP ${status}${ms != null ? ` · ${ms} ms` : ""} — workflow ran`,
    });
    const failState = (reason: string): TriggerState => ({
      state: "fail",
      detail: `unreachable · ${reason}`,
    });

    // preferred: server-side relay (immune to browser CORS)
    if (apiKey) {
      try {
        const r = await dbPost<{ ok: boolean; status: number; ms: number; error?: string }>(
          apiKey,
          "/probe",
          { url, payload },
        );
        setTriggers((t) => ({
          ...t,
          [id]: r.ok ? okState(r.status, r.ms) : failState(r.error || `HTTP ${r.status}`),
        }));
        showToast(r.ok ? `${name}: reachable (HTTP ${r.status})` : `${name}: unreachable`);
        return;
      } catch {
        /* feed service itself unreachable — fall through to direct POST */
      }
    }

    // fallback: direct POST (works when n8n is same-origin or sends CORS headers)
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 90_000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      window.clearTimeout(timer);
      const reachable = res.status >= 200 && res.status < 300; // empty body is fine
      setTriggers((t) => ({
        ...t,
        [id]: reachable ? okState(res.status) : failState(`HTTP ${res.status}`),
      }));
      showToast(reachable ? `${name}: reachable (HTTP ${res.status})` : `${name}: HTTP ${res.status}`);
    } catch {
      setTriggers((t) => ({
        ...t,
        [id]: failState("no response — set the x-api-key to probe via the server"),
      }));
      showToast(`${name}: unreachable from this browser`);
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

  /* ---------- workflow management (add / delete / pause) ---------- */

  const [wfName, setWfName] = useState("");
  const [wfUrl, setWfUrl] = useState("");
  const [confirmDeleteWf, setConfirmDeleteWf] = useState<string | null>(null);

  const addWorkflow = async () => {
    const name = wfName.trim();
    if (!name) {
      showToast("Give the source a name first");
      return;
    }
    const id =
      name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ||
      `source-${Date.now().toString(36)}`;
    const url =
      wfUrl.trim() || `${registry.base.replace(/\/+$/, "")}/webhook/onlydeals-${id}`;
    const ok = await saveRegistry({
      ...registry,
      webhooks: { ...registry.webhooks, [id]: url },
      names: { ...(registry.names ?? {}), [id]: name },
    });
    if (!ok) return; // fields stay filled so nothing is silently lost
    setWfName("");
    setWfUrl("");
    // in local-only mode saveRegistry already showed the sync warning
    if (apiKey) showToast(`${name} added — persisted to the server registry`);
  };

  const deleteWorkflow = async (id: string, name: string) => {
    const webhooks = { ...registry.webhooks };
    delete webhooks[id];
    const names = { ...(registry.names ?? {}) };
    delete names[id];
    const disabled = { ...(registry.disabled ?? {}) };
    delete disabled[id];
    const ok = await saveRegistry({ ...registry, webhooks, names, disabled });
    setConfirmDeleteWf(null);
    if (!ok) return;
    // also drop it from the locally-known list so bundled entries hide until a rescan
    setKnown((prev) => {
      const next = prev.filter((w) => w.id !== id);
      saveJson(WORKFLOWS_KEY, next);
      return next;
    });
    if (apiKey) showToast(`${name} removed from the registry`);
  };

  const togglePause = async (id: string, name: string) => {
    const pausing = !isPaused(id);
    const disabled = { ...(registry.disabled ?? {}), [id]: pausing };
    if (!pausing) delete disabled[id];
    const ok = await saveRegistry({ ...registry, disabled });
    if (!ok) return;
    if (apiKey)
      showToast(pausing ? `${name} paused — triggers and the scheduler will skip it` : `${name} resumed`);
  };

  /* ---------- users ops ---------- */
  const needKey = (): boolean => {
    if (!apiKey) {
      showToast("Add your x-api-key first (top of this page)");
      return true;
    }
    return false;
  };

  const loadUsers = async () => {
    if (needKey()) return;
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await dbGet<DbUser[]>(apiKey, "/users");
      setUsers(list);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (user && tab === "users" && users === null && apiKey) void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tab, apiKey]);

  const resetPassword = async (u: DbUser) => {
    if (needKey()) return;
    setRowBusy(u.id);
    try {
      const r = await dbPost<{ temp_password: string }>(apiKey, `/users/${u.id}/reset-password`);
      setTempPw({ id: u.id, pw: r.temp_password });
      showToast(`Temporary password issued for ${u.email}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setRowBusy(null);
    }
  };

  const toggleUser = async (u: DbUser) => {
    if (needKey()) return;
    setRowBusy(u.id);
    try {
      await dbPost(apiKey, `/users/${u.id}/toggle`);
      setUsers((list) => (list ? list.map((x) => (x.id === u.id ? { ...x, disabled: !x.disabled } : x)) : list));
      showToast(`${u.email} ${u.disabled ? "enabled" : "disabled"}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setRowBusy(null);
    }
  };

  const deleteUser = async (u: DbUser) => {
    if (needKey()) return;
    setRowBusy(u.id);
    try {
      await dbDelete(apiKey, `/users/${u.id}`);
      setUsers((list) => (list ? list.filter((x) => x.id !== u.id) : list));
      setConfirmDelete(null);
      showToast(`${u.email} deleted`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRowBusy(null);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.display_name ?? "").toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  /* ---------------- login gate ---------------- */
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-term px-4 text-ink">
        <div key={shake} className={`w-full max-w-sm ${error ? "shake-x" : ""}`}>
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 text-ink" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-dim">
                onlydeals /// control room
              </p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">Admin access only</h1>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-mut">
            Scraping, users, workflows and the source registry are managed here. The public
            site only reads what the n8n workflows produce.
          </p>

          <div className="mt-5 rounded-xl border border-term-line bg-term-2 p-5">
            <div className="space-y-3">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void doLogin()}
                type="email"
                placeholder="admin email"
                autoFocus
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-dim focus:border-flare focus:outline-none"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void doLogin()}
                type="password"
                placeholder="Password"
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-dim focus:border-flare focus:outline-none"
              />
              {error && (
                <p className="fade-in flex items-center gap-2 rounded-lg border border-ember/40 bg-ember-soft px-3 py-2 text-[12.5px] font-medium text-ember">
                  <CloseIcon className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              )}
              <button
                onClick={() => void doLogin()}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-flare px-5 py-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.14em] text-card transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              >
                {busy && <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-card/30 border-t-card" />}
                {busy ? "Checking…" : "Unlock control room"}
              </button>
            </div>
            <p className="mt-3 border-t border-term-line pt-3 font-mono text-[9.5px] leading-relaxed tracking-[0.08em] text-dim">
              Seeded on first boot: {`{ADMIN_EMAIL}`}:… / {`{ADMIN_PASSWORD}`}:… (env vars — see deploy/DEPLOY.md)
            </p>
          </div>

          <button
            onClick={onExit}
            className="mt-4 flex w-full items-center justify-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-dim transition-colors hover:text-flare"
          >
            ← back to the public site
          </button>
        </div>
      </div>
    );
  }

  /* ---------------- control room ---------------- */
  const sourceWorkflows = workflows.filter((w) => w.type === "source");

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      className={`rounded-full px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-all ${
        tab === id ? "bg-flare font-semibold text-card" : "text-dim hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-term text-ink">
      <header className="sticky top-0 z-40 border-b border-term-line bg-term/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <BrandMark className="h-8 w-8 text-ink" />
          <div className="leading-none">
            <p className="font-display text-lg font-extrabold tracking-tight">
              only<span className="text-flare">deals</span> · CONTROL ROOM
            </p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-dim">
              admin · n8n ops · users
            </p>
          </div>

          <nav className="ml-4 hidden items-center gap-1 rounded-full border border-term-line bg-term-2 p-1 sm:flex">
            {tabBtn("overview", "Overview")}
            {tabBtn("workflows", `Workflows · ${workflows.length}`)}
            {tabBtn("users", `Users${users ? ` · ${users.length}` : ""}`)}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-term-line text-dim transition-all hover:rotate-12 hover:border-amber hover:text-amber"
            >
              {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
            </button>
            <span className="hidden items-center gap-1.5 rounded-full border border-flare/40 bg-flare/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-flare lg:flex">
              <LockIcon className="h-3 w-3" />
              {user.email}
            </span>
            <button
              onClick={onExit}
              className="flex items-center gap-1.5 rounded-full border border-term-line px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mut transition-colors hover:border-flare/50 hover:text-flare"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              public site
            </button>
            <button
              onClick={() => void doLogout()}
              className="rounded-full border border-term-line p-2 text-dim transition-colors hover:border-ember/50 hover:text-ember"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 border-t border-term-line px-4 py-2 sm:hidden">
          {tabBtn("overview", "Overview")}
          {tabBtn("workflows", `Workflows · ${workflows.length}`)}
          {tabBtn("users", "Users")}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* API key bar */}
        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-term-line bg-term-2 px-4 py-3">
          <LockIcon className="h-4 w-4 shrink-0 text-flare" />
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            x-api-key · for /api/db/* (users + registry)
          </p>
          <div className="flex min-w-[240px] flex-1 items-center gap-2">
            <input
              value={apiKey ? "••••••••" : keyDraft}
              placeholder="paste the ONLYDEALS_API_KEY value"
              onChange={(e) => setKeyDraft(e.target.value)}
              onFocus={() => {
                if (apiKey) {
                  setApiKey("");
                  setKeyDraft("");
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[12px] text-ink placeholder:text-dim focus:border-flare focus:outline-none"
            />
            <button
              onClick={() => {
                const v = keyDraft.trim();
                if (!v) return showToast("Paste a key first");
                setApiKey(v);
                sessionStorage.setItem(APIKEY_KEY, v);
                setKeyDraft("");
                showToast("API key set for this session");
              }}
              className="rounded-full bg-flare px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95"
            >
              {apiKey ? "replace" : "set"}
            </button>
          </div>
          <p className="w-full font-mono text-[9.5px] tracking-[0.06em] text-dim sm:w-auto">
            kept in sessionStorage only · never written to disk
          </p>
        </section>

        {/* ================= USERS ================= */}
        {tab === "users" && (
          <section className="rounded-xl border border-term-line bg-term-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-line px-5 py-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// user management</p>
                <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Accounts on Postgres</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
                  <input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="Search email / name…"
                    className="w-56 rounded-full border border-term-line bg-term py-2 pl-9 pr-3 font-mono text-[11.5px] text-ink placeholder:text-dim focus:border-flare focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => void loadUsers()}
                  disabled={usersLoading}
                  className="flex items-center gap-2 rounded-full border border-term-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-mut transition-colors hover:border-flare/50 hover:text-flare disabled:opacity-50"
                >
                  <RefreshIcon className={`h-3.5 w-3.5 ${usersLoading ? "spin" : ""}`} />
                  refresh
                </button>
              </div>
            </div>

            {tempPw && (
              <div className="fade-in mx-5 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber/50 bg-amber-soft px-4 py-3">
                <UserIcon className="h-4 w-4 shrink-0 text-amber" />
                <p className="text-[12.5px] text-ink">
                  Temporary password for user <span className="font-semibold">#{tempPw.id}</span> — shown{" "}
                  <span className="font-semibold text-amber">once</span>:
                </p>
                <code className="rounded border border-amber/50 bg-term px-2.5 py-1 font-mono text-[13px] font-bold tracking-[0.08em] text-amber">
                  {tempPw.pw}
                </code>
                <button
                  onClick={() => void copy(tempPw.pw, "Temporary password")}
                  className="flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-brick hover:text-card"
                >
                  <CopyIcon className="h-3 w-3" />
                  copy
                </button>
                <button
                  onClick={() => setTempPw(null)}
                  className="ml-auto rounded-full p-1.5 text-dim transition-colors hover:text-ember"
                  aria-label="Dismiss"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="p-5">
              {usersError && (
                <p className="mb-3 rounded-lg border border-ember/40 bg-ember-soft px-3 py-2 font-mono text-[11px] text-ember">
                  {usersError} — check the API key and that the feed service is running.
                </p>
              )}

              {!users && !usersError && (
                <p className="py-10 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
                  {apiKey ? "loading users…" : "set the x-api-key above to load accounts"}
                </p>
              )}

              {users && (
                <div className="overflow-x-auto rounded-lg border border-term-line">
                  <table className="w-full min-w-[720px] text-left">
                    <thead>
                      <tr className="border-b border-term-line bg-term font-mono text-[9.5px] uppercase tracking-[0.16em] text-dim">
                        <th className="px-4 py-2.5 font-medium">id</th>
                        <th className="px-4 py-2.5 font-medium">email</th>
                        <th className="px-4 py-2.5 font-medium">display name</th>
                        <th className="px-4 py-2.5 font-medium">role</th>
                        <th className="px-4 py-2.5 font-medium">status</th>
                        <th className="px-4 py-2.5 font-medium">created</th>
                        <th className="px-4 py-2.5 text-right font-medium">actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-term-line">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className={`transition-colors hover:bg-term/60 ${u.disabled ? "opacity-55" : ""}`}>
                          <td className="num-tabular px-4 py-3 font-mono text-[11px] text-dim">{u.id}</td>
                          <td className="px-4 py-3 font-display text-[13.5px] font-bold tracking-tight">{u.email}</td>
                          <td className="px-4 py-3 text-[12.5px] text-mut">{u.display_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                                u.role === "admin"
                                  ? "border-flare/40 bg-flare/10 text-flare"
                                  : "border-term-line text-mut"
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${
                                u.disabled
                                  ? "border-ember/40 bg-ember-soft text-ember"
                                  : "border-okc/40 bg-okc/10 text-okc"
                              }`}
                            >
                              {u.disabled ? "disabled" : "active"}
                            </span>
                          </td>
                          <td className="num-tabular px-4 py-3 font-mono text-[10.5px] text-dim">
                            {new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => void resetPassword(u)}
                                disabled={rowBusy === u.id}
                                className="rounded-full border border-term-line px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-mut transition-colors hover:border-amber/60 hover:text-amber disabled:opacity-50"
                              >
                                reset pw
                              </button>
                              <button
                                onClick={() => void toggleUser(u)}
                                disabled={rowBusy === u.id}
                                className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] transition-colors disabled:opacity-50 ${
                                  u.disabled
                                    ? "border-okc/40 text-okc hover:bg-okc/10"
                                    : "border-term-line text-mut hover:border-amber/60 hover:text-amber"
                                }`}
                              >
                                {u.disabled ? "enable" : "disable"}
                              </button>
                              {confirmDelete === u.id ? (
                                <>
                                  <button
                                    onClick={() => void deleteUser(u)}
                                    disabled={rowBusy === u.id}
                                    className="rounded-full bg-ember px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-card transition-all hover:opacity-90"
                                  >
                                    confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmDelete(null)}
                                    className="rounded-full border border-term-line px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-mut"
                                  >
                                    keep
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => setConfirmDelete(u.id)}
                                  className="rounded-full border border-term-line p-1.5 text-dim transition-colors hover:border-ember/60 hover:text-ember"
                                  aria-label={`Delete ${u.email}`}
                                >
                                  <CloseIcon className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
                            no users match “{userQuery}”
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ================= WORKFLOWS ================= */}
        {tab === "workflows" && (
          <>
            <section className="rounded-xl border border-term-line bg-term-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// workflows · trigger deck</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Every workflow on the radar</h2>
                </div>
                <button
                  onClick={() => {
                    setManifestTick((x) => x + 1);
                    showToast("Rescanning manifest + ingest feed…");
                  }}
                  disabled={manifestLoading}
                  className="flex items-center gap-2 rounded-full border border-term-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mut transition-colors hover:border-flare/50 hover:text-flare disabled:opacity-50"
                >
                  <RefreshIcon className={`h-3.5 w-3.5 ${manifestLoading ? "spin" : ""}`} />
                  rescan
                </button>
              </div>

              <div className="px-5 py-4">
                <p className="max-w-2xl text-[12.5px] leading-relaxed text-mut">
                  Workflows appear here <span className="font-semibold text-ink">by themselves</span>: the page
                  scans <code className="text-flare">workflows/manifest.json</code> on load, and any workflow that
                  has ever posted to the ingest feed (its <code className="text-flare">generator</code> tag) is
                  picked up automatically. The only action from here is a trigger.
                </p>
              </div>

              <div className="divide-y divide-term-line">
                {workflows.length === 0 && (
                  <p className="px-5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-dim">
                    {manifestLoading ? "scanning…" : "no workflows found — import one and it will show up"}
                  </p>
                )}
                {workflows.map((w, i) => {
                  const t = triggers[w.id] ?? { state: "idle" as const };
                  const url = w.webhook ? webhookFor(w.id) : null;
                  return (
                    <div
                      key={w.id}
                      className={`row-in flex flex-wrap items-center gap-3 px-5 py-4 transition-all hover:bg-term/40 ${
                        isPaused(w.id) ? "opacity-55" : ""
                      }`}
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
                                ? "border border-term-line text-dim"
                                : w.origin === "feed"
                                  ? "bg-okc/15 text-okc"
                                  : "bg-amber/15 text-amber"
                            }`}
                          >
                            {w.origin === "feed" ? "auto-discovered" : w.origin}
                          </span>
                          {isPaused(w.id) && (
                            <span className="rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.12em] text-ember">
                              paused
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                          {w.type === "scheduler" ? "cron · fans out to sources" : `webhook · onlydeals-${w.id}`}
                          {w.file ? ` · ${w.file}` : ""}
                        </p>
                      </div>

                      {url ? (
                        <>
                          <code className="hidden min-w-0 flex-1 truncate rounded border border-term-line bg-term px-3 py-2 font-mono text-[10.5px] text-ink-soft md:block">
                            {url}
                          </code>
                          <button
                            onClick={() => void copy(url, "Webhook URL")}
                            className="rounded-full border border-term-line p-2 text-dim transition-colors hover:border-flare/50 hover:text-flare"
                            title="Copy webhook URL"
                            aria-label={`Copy webhook URL for ${w.name}`}
                          >
                            <CopyIcon className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => void triggerNow(w.id, w.name)}
                            disabled={t.state === "busy"}
                            className="flex items-center gap-2 rounded-full bg-flare px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95 disabled:opacity-60"
                          >
                            {t.state === "busy" ? (
                              <span className="spin inline-block h-3 w-3 rounded-full border-2 border-card/30 border-t-card" />
                            ) : (
                              <PulseIcon className="h-3.5 w-3.5" />
                            )}
                            {t.state === "busy" ? "running…" : "trigger"}
                          </button>
                        </>
                      ) : (
                        <span className="rounded-full border border-dashed border-term-line px-3 py-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                          schedule-driven · no webhook
                        </span>
                      )}

                      {/* pause / resume */}
                      <button
                        onClick={() => void togglePause(w.id, w.name)}
                        title={isPaused(w.id) ? "Resume — triggers & scheduler will run it again" : "Pause — triggers & scheduler will skip it"}
                        aria-label={isPaused(w.id) ? `Resume ${w.name}` : `Pause ${w.name}`}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-all active:scale-95 ${
                          isPaused(w.id)
                            ? "border-okc/50 bg-okc/10 text-okc hover:bg-okc/20"
                            : "border-term-line text-dim hover:border-amber/50 hover:text-amber"
                        }`}
                      >
                        {isPaused(w.id) ? <PlayIcon className="h-3 w-3" /> : <PauseIcon className="h-3 w-3" />}
                        {isPaused(w.id) ? "resume" : "pause"}
                      </button>

                      {/* delete (with confirm) */}
                      {confirmDeleteWf === w.id ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            onClick={() => void deleteWorkflow(w.id, w.name)}
                            className="rounded-full bg-ember px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95"
                          >
                            confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteWf(null)}
                            className="rounded-full border border-term-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim transition-colors hover:text-ink"
                          >
                            cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteWf(w.id)}
                          title="Remove from the registry"
                          aria-label={`Delete ${w.name}`}
                          className="rounded-full border border-term-line p-2 text-dim transition-colors hover:border-ember/50 hover:text-ember"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <p
                        className={`w-full pl-12 font-mono text-[10px] md:ml-1 md:w-auto md:pl-0 ${
                          t.state === "ok" ? "text-okc" : t.state === "fail" ? "text-ember" : "text-dim"
                        }`}
                      >
                        {t.detail ?? ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-term-line bg-term-2 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// how discovery works</p>
              <ol className="mt-3 list-decimal space-y-1.5 pl-5 font-mono text-[11.5px] leading-relaxed text-mut">
                <li>
                  Deploy a new n8n workflow that tags its payload{" "}
                  <code className="text-flare">"generator": "n8n:onlydeals-&lt;id&gt;"</code> and POSTs to the
                  ingest endpoint.
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

        {/* ================= OVERVIEW ================= */}
        {tab === "overview" && (
          <>
            <section className="rounded-xl border border-term-line bg-term-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 01 · trigger-URL registry</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">What's wired</h2>
                </div>
                <p className="max-w-sm text-[12px] leading-relaxed text-dim">
                  Stored server-side at <code className="text-flare">/etc/onlydeals/registry.json</code> and served
                  at <code className="text-flare">/api/db/registry</code>. Changes here write back to the server
                  when an API key is set.
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <label className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
                  service base
                  <input
                    value={registry.base}
                    onChange={(e) => setRegistry((r) => ({ ...r, base: e.target.value }))}
                    onBlur={() => void saveRegistry(registry)}
                    className="min-w-[260px] flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11.5px] normal-case tracking-normal text-ink focus:border-flare focus:outline-none"
                  />
                </label>
                <div className="divide-y divide-term-line rounded-lg border border-term-line">
                  {sourceWorkflows.length === 0 && (
                    <p className="px-4 py-5 font-mono text-[11px] uppercase tracking-[0.12em] text-dim">
                      no source workflows registered yet
                    </p>
                  )}
                  {sourceWorkflows.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[11px] font-extrabold text-flare">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-[150px]">
                        <p className="font-display text-[15px] font-bold tracking-tight">{p.name}</p>
                        <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                          engine onlydeals-{p.id}
                        </p>
                      </div>
                      <input
                        value={webhookFor(p.id)}
                        onChange={(e) => {
                          const url = e.target.value;
                          setRegistry((r) => ({ ...r, webhooks: { ...r.webhooks, [p.id]: url } }));
                        }}
                        onBlur={() => void saveRegistry({ ...registry, webhooks: { ...registry.webhooks, [p.id]: webhookFor(p.id) } })}
                        className="min-w-[220px] flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] text-ink-soft focus:border-flare focus:outline-none"
                        aria-label={`Webhook URL for ${p.name}`}
                      />
                      <button
                        onClick={() => setTab("workflows")}
                        className="flex items-center gap-1.5 rounded-full border border-flare/40 px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-flare transition-all hover:bg-flare hover:text-card active:scale-95"
                      >
                        <PulseIcon className="h-3.5 w-3.5" />
                        trigger
                      </button>
                    </div>
                  ))}
                </div>

                {/* add a workflow */}
                <div className="rounded-lg border border-dashed border-term-line bg-term/40 p-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
                    add a workflow
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <input
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void addWorkflow()}
                      placeholder="Source name (e.g. Alinma)"
                      className="min-w-[160px] flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11.5px] normal-case tracking-normal text-ink placeholder:text-dim focus:border-flare focus:outline-none"
                    />
                    <input
                      value={wfUrl}
                      onChange={(e) => setWfUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && void addWorkflow()}
                      placeholder="Webhook URL (optional — derived from base)"
                      className="min-w-[220px] flex-[2] rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] normal-case tracking-normal text-ink-soft placeholder:text-dim focus:border-flare focus:outline-none"
                    />
                    <button
                      onClick={() => void addWorkflow()}
                      className="flex items-center gap-1.5 rounded-full bg-flare px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      add
                    </button>
                  </div>
                  <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-dim">
                    Merged into <code className="text-flare">registry.json</code> via PUT{" "}
                    <code className="text-flare">/api/db/registry</code> — appears in the Workflows tab and
                    survives reloads and other machines.
                  </p>
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border border-term-line bg-term-2">
                <div className="border-b border-term-line px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 02 · n8n workflows</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Import these three</h2>
                </div>
                <div className="space-y-3 p-5">
                  {workflows
                    .filter((w) => w.file)
                    .map((w) => (
                      <div key={w.file} className="rounded-lg border border-term-line bg-term p-4 transition-colors hover:border-flare/40">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-display text-[14.5px] font-bold tracking-tight">{w.name}</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-mut">
                              {w.description ?? "offer.v1 payload → ingest."}
                            </p>
                          </div>
                          <a
                            href={`workflows/${w.file}`}
                            download
                            className="flex shrink-0 items-center gap-1.5 rounded-full bg-flare px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95"
                          >
                            <DownloadIcon className="h-3.5 w-3.5" />
                            .json
                          </a>
                        </div>
                        <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">{w.file}</p>
                      </div>
                    ))}
                  <ol className="list-decimal space-y-1 pl-5 font-mono text-[11px] leading-relaxed text-dim">
                    <li>Import all three into your n8n instance (Workflows → Import from file).</li>
                    <li>
                      Env / creds: <code className="text-flare">ONLYDEALS_PG_URL</code> (postgres creds
                      "onlydeals-pg"), <code className="text-flare">ONLYDEALS_N8N_BASE</code>, Sheets credential
                      "onlydeals-sheets-sa".
                    </li>
                    <li>Activate the master scheduler — it becomes the heartbeat.</li>
                    <li>
                      <code className="text-flare">FEED_URL</code> is pinned to{" "}
                      <code className="text-flare">{FEED_URL}</code> in <code className="text-flare">src/lib/feed.ts</code>.
                    </li>
                  </ol>
                </div>
              </section>

              <section className="rounded-xl border border-term-line bg-term-2">
                <div className="border-b border-term-line px-5 py-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 03 · write contract</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">How workflows write</h2>
                </div>
                <div className="p-5">
                  <pre className="overflow-x-auto rounded-lg border border-term-line bg-term p-4 font-mono text-[11px] leading-relaxed text-ink-soft">
                    {DB_CONTRACT}
                  </pre>
                  <div className="mt-4 rounded-lg border border-term-line bg-term p-4">
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-dim">
                      local ingest store (this browser)
                    </p>
                    {localFeed ? (
                      <p className="mt-1.5 text-[12.5px] text-mut">
                        <span className="font-semibold text-okc">{localFeed.offers.length} offers</span> · generator{" "}
                        <span className="font-mono text-flare">{localFeed.generator}</span> ·{" "}
                        {timeAgo(Date.parse(localFeed.generatedAt))}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-[12.5px] text-dim">empty — the site is showing the server feed</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          pushLocalFeed(testPushPayload());
                          setLocalFeedTick((x) => x + 1);
                          showToast("Test feed pushed — new generators appear in Workflows");
                        }}
                        className="flex items-center gap-1.5 rounded-full bg-amber px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-card transition-all hover:opacity-90 active:scale-95"
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
                          className="flex items-center gap-1.5 rounded-full border border-term-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-dim transition-colors hover:border-ember/50 hover:text-ember"
                        >
                          <CloseIcon className="h-3 w-3" />
                          clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-term-line bg-term-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-term-line px-5 py-4">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 04 · source registry</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Banks & vendors on the radar</h2>
                </div>
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-2 rounded-full bg-flare px-4 py-2.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-card transition-all hover:opacity-90 active:scale-95"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  register a bank / vendor
                </button>
              </div>
              <div className="p-5">
                {customSources.length === 0 ? (
                  <p className="flex items-center gap-2 text-[12.5px] text-dim">
                    <StoreIcon className="h-4 w-4 shrink-0" />
                    Nothing registered beyond the pipeline above. Register a missing bank's offers page and it
                    appears on the public site's ledger as queued-for-workflow.
                  </p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {customSources.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 rounded-lg border border-term-line bg-term px-3.5 py-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[12px] font-extrabold text-flare">
                          {s.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[13.5px] font-bold tracking-tight">{s.name}</span>
                          <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">
                            {s.kind} · awaiting workflow
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            const next = customSources.filter((x) => x.id !== s.id);
                            setCustomSources(next);
                            saveJson("onlydeals.sources.v1", next);
                            showToast(`${s.name} removed from registry`);
                          }}
                          className="rounded-full border border-term-line p-1.5 text-dim transition-colors hover:border-ember/50 hover:text-ember"
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

            <p className="pb-4 text-center font-mono text-[9.5px] uppercase tracking-[0.18em] text-dim">
              <CheckIcon className="mr-1 inline h-3 w-3 text-okc" />
              scraping happens only here and on the n8n master scheduler · the public site is read-only
            </p>
          </>
        )}
      </main>

      <AddSourceModal
        open={addOpen}
        sources={customSources}
        onAdd={(s) => {
          const next = [...customSources, s];
          setCustomSources(next);
          saveJson("onlydeals.sources.v1", next);
          showToast(`${s.name} registered — queued for its workflow`);
        }}
        onRemove={(id) => {
          const next = customSources.filter((x) => x.id !== id);
          setCustomSources(next);
          saveJson("onlydeals.sources.v1", next);
          showToast("Removed from registry");
        }}
        onClose={() => setAddOpen(false)}
      />

      {toast && (
        <div className="toast-up fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-term-line bg-term-2 px-4 py-2.5 font-mono text-[11.5px] tracking-[0.06em] text-ink shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)]">
          <CheckIcon className="h-3.5 w-3.5 text-flare" />
          {toast}
        </div>
      )}
    </div>
  );
}
