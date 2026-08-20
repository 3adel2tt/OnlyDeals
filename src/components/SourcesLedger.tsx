import type { CustomSource, SourceDef } from "../types";
import { ArrowUpRight, LockIcon, PlusIcon, TrashIcon } from "./icons";

const SOURCES: SourceDef[] = [
  { id: "alrajhi", name: "Al Rajhi Bank", kind: "credit-card offers", status: "live", progress: 100, note: "10 offers indexed · snapshot fallback wired" },
  { id: "snb", name: "SNB (AlAhli)", kind: "credit-card offers", status: "drafting", progress: 45, note: "selector ladder drafted, needs live test" },
  { id: "riyad", name: "Riyad Bank", kind: "card offers", status: "queued", progress: 12, note: "target page identified" },
  { id: "tamara", name: "Tamara", kind: "BNPL merchant deals", status: "queued", progress: 0, note: "public deals feed under review" },
  { id: "amazon", name: "Amazon.sa", kind: "card-linked promos", status: "queued", progress: 0, note: "bank-code rotation tracking" },
  { id: "noon", name: "Noon", kind: "bank code tracking", status: "queued", progress: 0, note: "depends on Amazon.sa module" },
];

const CHIP: Record<SourceDef["status"], string> = {
  live: "bg-live/15 text-[#0d7a47] border-live/40",
  drafting: "bg-amber-soft text-[#8a6410] border-amber/50",
  queued: "bg-paper text-ink-faint border-line",
  registered: "bg-tint text-brick border-brick/40",
};

const BAR: Record<SourceDef["status"], string> = {
  live: "bg-live",
  drafting: "bg-amber",
  queued: "bg-line",
  registered: "bg-brick/40",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

interface Props {
  custom: CustomSource[];
  isAdmin: boolean;
  onPick: (name: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onRegisterGate: () => void;
}

export default function SourcesLedger({ custom, isAdmin, onPick, onAdd, onRemove, onRegisterGate }: Props) {
  const rows: Array<SourceDef & { url?: string; customId?: string }> = [
    ...SOURCES,
    ...custom.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind === "bank" ? "registered bank" : "registered vendor",
      status: "registered" as const,
      progress: 0,
      note: `target: ${hostOf(c.url)}${c.note ? ` · ${c.note}` : ""}`,
      url: c.url,
      customId: c.id,
    })),
  ];

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
            /// source pipeline
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            One bank today, <span className="text-brick">the rest in line.</span>
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
        {rows.map((s, i) => (
          <div
            key={s.id}
            className={`group flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3.5 text-left transition-colors first:border-t-0 sm:flex-nowrap sm:px-5 ${
              s.status === "live" ? "cursor-default bg-tint/45" : "hover:bg-tint/60"
            }`}
          >
            <button
              onClick={() => s.status !== "live" && onPick(s.name)}
              disabled={s.status === "live"}
              className={`flex min-w-0 flex-1 items-center gap-x-4 gap-y-1 text-left ${s.status === "live" ? "cursor-default" : "cursor-pointer"}`}
            >
              <span className="w-8 font-mono text-[11px] text-ink-faint">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-[150px] items-center gap-2 font-display text-[16px] font-bold tracking-tight text-ink">
                {s.status === "live" && (
                  <span className="relative inline-block h-2 w-2 rounded-full bg-live text-live ping-dot" />
                )}
                {s.name}
              </span>
              <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint md:block">
                {s.kind}
              </span>
              <span className="hidden flex-1 truncate text-[12px] text-ink-soft lg:block">
                {s.note}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line sm:block">
                  <span
                    className={`block h-full rounded-full ${BAR[s.status]} transition-all duration-700`}
                    style={{ width: `${s.progress}%` }}
                  />
                </span>
                <span className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] ${CHIP[s.status]}`}>
                  {s.status === "live" ? "● live" : s.status}
                </span>
              </span>
            </button>

            {s.customId && s.url && (
              <span className="flex items-center gap-1">
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
                  onClick={() => onRemove(s.customId!)}
                  className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-ember hover:text-ember"
                  aria-label={`Remove ${s.name} from registry`}
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
