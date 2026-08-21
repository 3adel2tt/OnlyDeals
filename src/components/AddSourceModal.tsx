import { useEffect, useState } from "react";
import type { Category, CustomSource } from "../types";
import { CATEGORY_LABEL } from "../types";
import {
  ArrowUpRight,
  BankIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  PulseIcon,
  StoreIcon,
  TrashIcon,
} from "./icons";

const RELAY = "https://api.allorigins.win/raw?url=";

const RESERVED = ["al rajhi", "alrajhi", "snb", "alahli", "riyad bank", "tamara", "amazon", "noon", "jarir"];

function normaliseUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  try {
    const u = new URL(v);
    if (!u.hostname.includes(".")) return null;
    return u.href;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type ProbeState = "probing" | "ok" | "fail";

interface Props {
  open: boolean;
  sources: CustomSource[];
  onAdd: (s: CustomSource) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export default function AddSourceModal({ open, sources, onAdd, onRemove, onClose }: Props) {
  const [kind, setKind] = useState<"bank" | "vendor">("bank");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<Category>("online");
  const [error, setError] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setNote("");
      setError(null);
      setKind("bank");
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the source a name.");
    const lower = trimmed.toLowerCase();
    if (RESERVED.some((r) => lower.includes(r)) || sources.some((s) => s.name.toLowerCase() === lower)) {
      return setError("That source is already on onlydeals.");
    }
    const clean = normaliseUrl(url);
    if (!clean) return setError("That URL doesn't parse — include the full page, e.g. https://bank.com/offers");

    onAdd({
      id: `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      name: trimmed,
      url: clean,
      note: note.trim() || undefined,
      category: kind === "vendor" ? category : undefined,
      createdAt: Date.now(),
    });
    setName("");
    setUrl("");
    setNote("");
    setError(null);
  };

  const probe = async (s: CustomSource) => {
    setProbes((p) => ({ ...p, [s.id]: "probing" }));
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(RELAY + encodeURIComponent(s.url), { signal: ctrl.signal });
      window.clearTimeout(t);
      setProbes((p) => ({ ...p, [s.id]: res.ok ? "ok" : "fail" }));
    } catch {
      setProbes((p) => ({ ...p, [s.id]: "fail" }));
    }
  };

  const inputCls =
    "w-full rounded-lg border border-line bg-paper px-3.5 py-2.5 text-[13.5px] text-ink placeholder:text-ink-faint focus:border-brick focus:outline-none focus:ring-2 focus:ring-brick/20 transition-shadow";

  return (
    <div
      className="fade-in fixed inset-0 z-[70] flex items-end justify-center bg-term/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Register a source"
    >
      <div
        className="modal-pop relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3.5 top-3.5 rounded-full border border-line p-2 text-ink-faint transition-all hover:rotate-90 hover:border-brick hover:text-brick"
          aria-label="Close"
        >
          <CloseIcon />
        </button>

        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-brick">
          /// source registry
        </p>
        <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-ink">
          Add a bank or vendor
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Register the offers page of a source that's missing. It appears on the public
          ledger as queued, then gets its own n8n workflow (duplicate a source workflow,
          rename the webhook — it will show up on the Workflows page automatically).
        </p>

        <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-1">
          {(
            [
              { id: "bank", label: "Bank", Icon: BankIcon },
              { id: "vendor", label: "Vendor", Icon: StoreIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setKind(id)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all ${
                kind === id
                  ? "bg-brick font-semibold text-paper shadow-[0_2px_10px_-2px_rgba(200,16,46,0.5)]"
                  : "text-ink-faint hover:text-ink"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
              {kind === "bank" ? "Bank name" : "Vendor name"} *
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder={kind === "bank" ? "e.g. Banque Saudi Fransi" : "e.g. IKEA Saudi"}
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
              Offers page URL *
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="https://…"
              className={`${inputCls} font-mono text-[12.5px]`}
            />
          </div>
          {kind === "vendor" && (
            <div>
              <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className={`${inputCls} cursor-pointer`}
              >
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">
              Note <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. offers live behind the mobile app"
              className={inputCls}
            />
          </div>

          {error && (
            <p className="fade-in flex items-center gap-2 rounded-lg border border-ember/40 bg-ember-soft px-3 py-2 text-[12.5px] font-medium text-ember">
              <CloseIcon className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}

          <button
            onClick={submit}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brick px-5 py-3 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-paper transition-all hover:bg-ink active:scale-[0.98]"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add to onlydeals
          </button>
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-ink-faint">
            Registry · {sources.length} saved
          </p>

          {sources.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-ink-faint">
              Nothing registered beyond the pipeline — yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {sources.map((s) => {
                const p = probes[s.id];
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-paper/70 px-3 py-2.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brick/30 bg-tint text-brick">
                      {s.kind === "bank" ? <BankIcon className="h-4 w-4" /> : <StoreIcon className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[14px] font-bold tracking-tight text-ink">
                        {s.name}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-ink-faint">
                        {hostOf(s.url)}
                        {s.note ? ` · ${s.note}` : ""}
                      </span>
                    </span>

                    {p === "probing" && (
                      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-amber">
                        <PulseIcon className="h-3.5 w-3.5 animate-pulse" />
                        probing…
                      </span>
                    )}
                    {p === "ok" && (
                      <span className="flex items-center gap-1 rounded-full bg-live/15 px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-okc">
                        <CheckIcon className="h-3 w-3" />
                        page reachable
                      </span>
                    )}
                    {p === "fail" && (
                      <span className="rounded-full bg-ember-soft px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ember">
                        blocked / timeout
                      </span>
                    )}

                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => probe(s)}
                        disabled={p === "probing"}
                        className="rounded-full border border-line px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-soft transition-colors hover:border-brick hover:text-brick disabled:opacity-50"
                      >
                        probe
                      </button>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-brick/50 hover:text-brick"
                        aria-label={`Open ${s.name} offers page`}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => onRemove(s.id)}
                        className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-ember hover:text-ember"
                        aria-label={`Remove ${s.name}`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            "Probe" pings the page through a public CORS relay — a green tick means an n8n
            workflow can reach it from your server too.
          </p>
        </div>
      </div>
    </div>
  );
}
