import type { CustomSource, SourceOutcome } from "../types";
import { ArrowUpRight, LockIcon, PlusIcon, TrashIcon } from "./icons";

const MODULE_META: Record<string, { name: string; kind: string }> = {
  alrajhi: { name: "Al Rajhi Bank", kind: "credit-card offers" },
  snb: { name: "SNB (AlAhli)", kind: "credit-card offers" },
  tamara: { name: "Tamara", kind: "BNPL merchant deals" },
};
const MODULE_ORDER = ["alrajhi", "snb", "tamara"];

const QUEUED = [
  { id: "riyad", name: "Riyad Bank", kind: "card offers" },
  { id: "amazon", name: "Amazon.sa", kind: "card-linked promos" },
  { id: "noon", name: "Noon", kind: "bank code tracking" },
];

type RowStatus = SourceOutcome["status"] | "pending" | "queued" | "registered";

const CHIP: Record<RowStatus, string> = {
  live: "bg-live/15 text-[#0d7a47] border-live/40",
  snapshot: "bg-amber-soft text-[#8a6410] border-amber/50",
  blocked: "bg-ember-soft text-ember border-ember/40",
  pending: "bg-paper text-ink-faint border-line",
  queued: "bg-paper text-ink-faint border-line",
  registered: "bg-tint text-brick border-brick/40",
};

const BAR: Record<RowStatus, string> = {
  live: "bg-live",
  snapshot: "bg-amber",
  blocked: "bg-ember/70",
  pending: "bg-line",
  queued: "bg-line",
  registered: "bg-brick/40",
};

const PROG: Record<RowStatus, number> = {
  live: 100,
  snapshot: 85,
  blocked: 25,
  pending: 55,
  queued: 12,
  registered: 0,
};

const CHIP_LABEL: Record<RowStatus, string> = {
  live: "● live",
  snapshot: "snapshot",
  blocked: "blocked",
  pending: "armed",
  queued: "queued",
  registered: "registered",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  outcomes: SourceOutcome[];
  custom: CustomSource[];
  isAdmin: boolean;
  onPick: (name: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRegisterGate: () => void;
}

interface Row {
  id: string;
  name: string;
  kind: string;
  engine: string;
  status: RowStatus;
  progress: number;
  note: string;
  clickable: boolean;
  url?: string;
  customId?: string;
}

export default function SourcesLedger({ outcomes, custom, isAdmin, onPick, onAdd, onRemove, onRegisterGate }: Props) {
  const byId = new Map(outcomes.map((o) => [o.id, o]));

  const moduleRows: Row[] = MODULE_ORDER.map((id) => {
    const o = byId.get(id);
    const status: RowStatus = o?.status ?? "pending";
    return {
      id,
      name: MODULE_META[id].name,
      kind: MODULE_META[id].kind,
      engine: `sources/${id}`,
      status,
      progress: PROG[status],
      note: o?.note ?? "engine armed — awaiting first pass",
      clickable: false,
    };
  });

  const queuedRows: Row[] = QUEUED.map((q) => ({
    id: q.id,
    name: q.name,
    kind: q.kind,
    engine: "—",
    status: "queued" as RowStatus,
    progress: PROG.queued,
    note: "queued — register it to fast-track",
    clickable: true,
  }));

  const customRows = custom.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind === "bank" ? "registered bank" : "registered vendor",
    engine: "registry",
    status: "registered" as RowStatus,
    progress: PROG.registered,
    note: `target: ${hostOf(c.url)}${c.note ? ` · ${c.note}` : ""}`,
    url: c.url,
    customId: c.id,
    clickable: true,
  }));

  const rows = [...moduleRows, ...queuedRows, ...customRows];

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
            /// source pipeline
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            Three engines running, <span className="text-brick">the rest in line.</span>
          </h2>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {isAdmin ? (
            <button
              onClick={onAdd}
              className="flex items-center gap-2 rounded-full border border-brick/50 bg-card px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-brick transition-all hover:bg-brick hover:text-paper active:scale-95"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              register a source
            </button>
          ) : (
            <button
              onClick={onRegisterGate}
              title="The source registry is admin-only"
              className="flex items-center gap-2 rounded-full border border-dashed border-line bg-card px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-faint transition-all hover:border-brick/50 hover:text-brick active:scale-95"
            >
              <LockIcon className="h-3.5 w-3.5" />
              register — admin only
            </button>
          )}
          <p className="max-w-xs text-right text-[12px] leading-relaxed text-ink-soft">
            {isAdmin
              ? "Missing a bank? Register its offers page here — it joins the queue for its own engine."
              : "The source registry is restricted to the web admin."}
          </p>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        {rows.map((r, i) => (
          <div
            key={r.id}
            onClick={() => {
              if ("customId" in r && r.customId) return; // ledger keeps its own links for custom rows
              if (r.clickable) onPick(r.name);
            }}
            className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3.5 text-left first:border-t-0 sm:flex-nowrap sm:px-5 ${
              r.clickable ? "cursor-pointer transition-colors hover:bg-tint/60" : ""
            }`}
          >
            <span className="w-8 font-mono text-[11px] text-ink-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-[150px] items-center gap-2 font-display text-[16px] font-bold tracking-tight text-ink">
              {r.status === "live" && (
                <span className="relative inline-block h-2 w-2 rounded-full bg-live text-live ping-dot" />
              )}
              {r.status === "snapshot" && (
                <span className="inline-block h-2 w-2 rounded-full bg-amber" />
              )}
              {r.status === "blocked" && (
                <span className="inline-block h-2 w-2 rounded-full bg-ember" />
              )}
              {r.name}
            </span>
            <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint md:block">
              {r.kind}
            </span>
            <span className="hidden w-24 font-mono text-[10.5px] text-brick/80 lg:block">
              {r.engine}
            </span>
            <span className="hidden flex-1 truncate text-[12px] text-ink-soft lg:block">
              {r.note}
            </span>
            <span className="ml-auto flex items-center gap-3">
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line sm:block">
                <span
                  className={`block h-full rounded-full ${BAR[r.status]} transition-all duration-700`}
                  style={{ width: `${r.progress}%` }}
                />
              </span>
              {"customId" in r && r.customId ? (
                <span className="flex items-center gap-1.5">
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-brick/50 hover:text-brick"
                      aria-label={`Open ${r.name} target page`}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                  <button
                    onClick={() => r.customId && onRemove(r.customId)}
                    className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-ember hover:text-ember"
                    aria-label={`Remove ${r.name}`}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                  <span className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] ${CHIP[r.status]}`}>
                    {CHIP_LABEL[r.status]}
                  </span>
                </span>
              ) : (
                <span className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] ${CHIP[r.status]}`}>
                  {CHIP_LABEL[r.status]}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
        blocked = every relay refused · snapshot = cached copy served · live = parsed from the page this pass
      </p>
    </section>
  );
}
