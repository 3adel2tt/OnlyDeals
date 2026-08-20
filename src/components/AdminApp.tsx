import { useEffect, useRef, useState } from "react";
import type { CustomSource, User } from "../types";
import { DEMO_ADMIN, ensureSeeded, login, logout } from "../lib/auth";
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
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  LockIcon,
  LogoutIcon,
  PlusIcon,
  PulseIcon,
  RadarMark,
} from "./icons";

const REGISTRY_KEY = "offradar.registry.v1";
const WEBHOOKS_KEY = "offradar.webhooks.v1";
const DEFAULT_BASE = "https://n8n.your-domain.com/webhook";

const PIPELINE = [
  { id: "alrajhi", name: "Al Rajhi Bank", engine: "offradar-alrajhi", workflow: "offradar-alrajhi.workflow.json", ready: true },
  { id: "jarir", name: "Jarir", engine: "offradar-jarir", workflow: "offradar-jarir.workflow.json", ready: true },
  { id: "snb", name: "SNB (AlAhli)", engine: null, workflow: null, ready: false },
  { id: "tamara", name: "Tamara", engine: null, workflow: null, ready: false },
];

const WORKFLOWS = [
  {
    file: "offradar-master-scheduler.workflow.json",
    title: "Master scheduler",
    desc: "Cron every 6h. Reads the plug-and-play source registry and fans out a webhook call per source, then posts a run report.",
    nodes: 5,
  },
  {
    file: "offradar-alrajhi.workflow.json",
    title: "Source · Al Rajhi Bank",
    desc: "Webhook → fetch card-offers page → regex extraction → offer.v1 payload → POST to ingest. Replies with a parse summary.",
    nodes: 8,
  },
  {
    file: "offradar-jarir.workflow.json",
    title: "Source · Jarir",
    desc: "Same shape, Jarir offers page, plus an installments pattern. Duplicate this file to clone a new source.",
    nodes: 8,
  },
];

const INGEST_CONTRACT = `POST  {{ OFFRADAR_INGEST_URL }}
HEAD  x-api-key: {{ OFFRADAR_API_KEY }}

{
  "version": "offer.v1",
  "generatedAt": "2026-…T…Z",
  "generator": "n8n:offradar-<source>",
  "sources": [
    { "id": "alrajhi", "name": "Al Rajhi Bank",
      "status": "live" | "error",
      "count": 12, "note": "…", "at": 1739… }
  ],
  "offers": [ /* offer.v1 — same schema the board renders */ ]
}`;

function loadRegistry(): CustomSource[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as CustomSource[]) : [];
  } catch {
    return [];
  }
}

function loadWebhooks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(WEBHOOKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

type TriggerState = { state: "idle" | "busy" | "ok" | "fail"; detail?: string };

export default function AdminApp() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [triggers, setTriggers] = useState<Record<string, TriggerState>>({});
  const [webhooks, setWebhooks] = useState<Record<string, string>>(loadWebhooks);
  const [registry, setRegistry] = useState<CustomSource[]>(loadRegistry);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [localFeedTick, setLocalFeedTick] = useState(0);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    ensureSeeded();
    let s: string | null = null;
    try {
      s = localStorage.getItem("offradar:session:v1");
    } catch {
      /* ignore */
    }
    // restore session only if the stored user is an admin
    try {
      const raw = localStorage.getItem("offradar:users:v1");
      const users = raw ? (JSON.parse(raw) as Array<User & { id: string }>) : [];
      const u = users.find((x) => x.id === s);
      if (u && u.role === "admin") setUser(u);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(webhooks));
    } catch {
      /* ignore */
    }
  }, [webhooks]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  };

  const localFeed = localFeedTick >= 0 ? readLocalFeed() : null;

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

  const webhookFor = (id: string) => webhooks[id] ?? `${DEFAULT_BASE}/offradar-${id}`;

  const triggerNow = async (id: string) => {
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
      showToast(`${id}: webhook returned ${res.status}`);
    } catch {
      setTriggers((t) => ({ ...t, [id]: { state: "fail", detail: "unreachable — is the workflow deployed & active?" } }));
      showToast(`${id}: webhook unreachable`);
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
    showToast("Test feed pushed to the local ingest store");
  };

  /* ---------------- login gate ---------------- */
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-term px-4 text-paper">
        <div key={shake} className={`w-full max-w-sm ${error ? "shake-x" : ""}`}>
          <div className="flex items-center gap-3">
            <RadarMark className="h-10 w-10 text-flare" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#8f766f]">
                offradar /// control room
              </p>
              <h1 className="font-display text-2xl font-extrabold tracking-tight">
                Admin access only
              </h1>
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-[#a9928b]">
            Scraping, the source registry and the ingest store are managed here. The public
            site only reads what the n8n workflows produce.
          </p>

          <div className="mt-5 rounded-xl border border-term-line bg-[#1f1412] p-5">
            <div className="space-y-3">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                placeholder="Username"
                autoFocus
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-paper placeholder:text-[#6b544e] focus:border-flare focus:outline-none"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                type="password"
                placeholder="Password"
                className="w-full rounded-lg border border-term-line bg-term px-3.5 py-2.5 font-mono text-[13px] text-paper placeholder:text-[#6b544e] focus:border-flare focus:outline-none"
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
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6b544e]">
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

          <a
            href="#/"
            className="mt-4 flex items-center justify-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#8f766f] transition-colors hover:text-flare"
          >
            ← back to the public site
          </a>
        </div>
      </div>
    );
  }

  /* ---------------- control room ---------------- */
  return (
    <div className="min-h-screen bg-term text-paper">
      <header className="sticky top-0 z-40 border-b border-term-line bg-term/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <RadarMark active className="h-8 w-8 text-flare" />
          <div className="leading-none">
            <p className="font-display text-lg font-extrabold tracking-tight">CONTROL ROOM</p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[#8f766f]">
              offradar admin · n8n ops
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-flare/40 bg-flare/10 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-flare sm:flex">
              <LockIcon className="h-3 w-3" />
              {user.displayName}
            </span>
            <a
              href="#/"
              className="flex items-center gap-1.5 rounded-full border border-term-line px-3.5 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a9928b] transition-colors hover:border-flare/50 hover:text-flare"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              public site
            </a>
            <button
              onClick={doLogout}
              className="rounded-full border border-term-line p-2 text-[#8f766f] transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {/* pipeline */}
        <section className="rounded-xl border border-term-line bg-[#1f1412]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-term-line px-5 py-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 01 · source pipeline</p>
              <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Trigger a scrape</h2>
            </div>
            <p className="max-w-sm text-[12px] leading-relaxed text-[#8f766f]">
              The only two ways offers get scraped: these webhooks, and the master scheduler's
              cron. Everything POSTs to your ingest endpoint.
            </p>
          </div>
          <div className="divide-y divide-term-line">
            {PIPELINE.map((p) => {
              const t = triggers[p.id] ?? { state: "idle" as const };
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-[160px]">
                    <p className="font-display text-[15px] font-bold tracking-tight">{p.name}</p>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#6b544e]">
                      {p.ready ? `engine ${p.engine}` : "no workflow yet"}
                    </p>
                  </div>
                  {p.ready ? (
                    <>
                      <input
                        value={webhookFor(p.id)}
                        onChange={(e) => setWebhooks((w) => ({ ...w, [p.id]: e.target.value }))}
                        className="min-w-[220px] flex-1 rounded-lg border border-term-line bg-term px-3 py-2 font-mono text-[11px] text-[#d8c8c2] focus:border-flare focus:outline-none"
                        aria-label={`Webhook URL for ${p.name}`}
                      />
                      <button
                        onClick={() => copy(webhookFor(p.id), "Webhook URL")}
                        className="rounded-full border border-term-line p-2 text-[#8f766f] transition-colors hover:border-flare/50 hover:text-flare"
                        title="Copy webhook URL"
                        aria-label="Copy webhook URL"
                      >
                        <CopyIcon className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => triggerNow(p.id)}
                        disabled={t.state === "busy"}
                        className="flex items-center gap-2 rounded-full bg-flare px-4 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#2b0c08] transition-all hover:bg-paper active:scale-95 disabled:opacity-60"
                      >
                        {t.state === "busy" ? (
                          <span className="spin inline-block h-3 w-3 rounded-full border-2 border-[#2b0c08]/30 border-t-[#2b0c08]" />
                        ) : (
                          <PulseIcon className="h-3.5 w-3.5" />
                        )}
                        {t.state === "busy" ? "running…" : "trigger now"}
                      </button>
                      <p
                        className={`w-full pl-1 font-mono text-[10px] sm:ml-1 sm:w-auto sm:pl-0 ${
                          t.state === "ok" ? "text-[#4fd68c]" : t.state === "fail" ? "text-[#f07a5f]" : "text-[#6b544e]"
                        }`}
                      >
                        {t.detail ?? (t.state === "idle" ? "idle — waiting for a pass" : "")}
                      </p>
                    </>
                  ) : (
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b544e]">
                      clone a source workflow to activate
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* workflows */}
          <section className="rounded-xl border border-term-line bg-[#1f1412]">
            <div className="border-b border-term-line px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 02 · n8n workflows</p>
              <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">Import these three</h2>
            </div>
            <div className="space-y-3 p-5">
              {WORKFLOWS.map((w) => (
                <div key={w.file} className="rounded-lg border border-term-line bg-term p-4 transition-colors hover:border-flare/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-[14.5px] font-bold tracking-tight">{w.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#a9928b]">{w.desc}</p>
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
                  <p className="mt-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#6b544e]">
                    {w.nodes} nodes · {w.file}
                  </p>
                </div>
              ))}
              <ol className="list-decimal space-y-1 pl-5 font-mono text-[11px] leading-relaxed text-[#8f766f]">
                <li>Import all three into your n8n instance (Workflows → Import from file).</li>
                <li>
                  Set env vars: <code className="text-flare">OFFRADAR_INGEST_URL</code>,{" "}
                  <code className="text-flare">OFFRADAR_API_KEY</code>,{" "}
                  <code className="text-flare">OFFRADAR_N8N_BASE</code>.
                </li>
                <li>Activate the master scheduler — it becomes the heartbeat.</li>
                <li>
                  Point <code className="text-flare">FEED_URL</code> in{" "}
                  <code className="text-flare">src/lib/feed.ts</code> at your merged offradar.json.
                </li>
              </ol>
            </div>
          </section>

          {/* ingest */}
          <section className="rounded-xl border border-term-line bg-[#1f1412]">
            <div className="border-b border-term-line px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-flare">/// 03 · ingest contract</p>
              <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">What workflows POST</h2>
            </div>
            <div className="p-5">
              <pre className="overflow-x-auto rounded-lg border border-term-line bg-term p-4 font-mono text-[11px] leading-relaxed text-[#d8c8c2]">
                {INGEST_CONTRACT}
              </pre>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6b544e]">
                remote feed url:{" "}
                <span className={FEED_URL ? "text-[#4fd68c]" : "text-amber"}>
                  {FEED_URL ?? "not configured (src/lib/feed.ts)"}
                </span>
              </p>

              <div className="mt-4 rounded-lg border border-term-line bg-term p-4">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#8f766f]">
                  local ingest store (this browser)
                </p>
                {localFeed ? (
                  <p className="mt-1.5 text-[12.5px] text-[#a9928b]">
                    <span className="font-semibold text-[#4fd68c]">{localFeed.offers.length} offers</span>{" "}
                    · generator <span className="font-mono text-flare">{localFeed.generator}</span> ·{" "}
                    {timeAgo(Date.parse(localFeed.generatedAt))}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[12.5px] text-[#6b544e]">empty — the site is showing bundled seed data</p>
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
                      className="flex items-center gap-1.5 rounded-full border border-term-line px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#8f766f] transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]"
                    >
                      <CloseIcon className="h-3 w-3" />
                      clear
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#6b544e]">
                  Simulates the ingest endpoint — the public site picks it up on its next sync.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* registry */}
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
              <p className="text-[12.5px] text-[#6b544e]">
                Nothing registered beyond the pipeline above. Register a missing bank's offers
                page and it appears on the public site's ledger as queued-for-workflow.
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
                      <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#6b544e]">
                        {s.kind} · awaiting workflow
                      </span>
                    </span>
                    <button
                      onClick={() => {
                        setRegistry((r) => r.filter((x) => x.id !== s.id));
                        try {
                          localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry.filter((x) => x.id !== s.id)));
                        } catch {
                          /* ignore */
                        }
                        showToast(`${s.name} removed from registry`);
                      }}
                      className="rounded-full border border-term-line p-1.5 text-[#8f766f] transition-colors hover:border-[#f07a5f]/50 hover:text-[#f07a5f]"
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

        <p className="pb-4 text-center font-mono text-[9.5px] uppercase tracking-[0.18em] text-[#6b544e]">
          <CheckIcon className="mr-1 inline h-3 w-3 text-[#4fd68c]" />
          scraping happens only here and on the n8n master scheduler · the public site is read-only
        </p>
      </main>

      <AddSourceModal
        open={addOpen}
        sources={registry}
        onAdd={(s) => {
          const next = [...registry, s];
          setRegistry(next);
          try {
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          showToast(`${s.name} registered — queued for its workflow`);
        }}
        onRemove={(id) => {
          const next = registry.filter((x) => x.id !== id);
          setRegistry(next);
          try {
            localStorage.setItem(REGISTRY_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
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
