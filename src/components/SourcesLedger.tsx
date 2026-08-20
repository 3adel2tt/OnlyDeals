import type { SourceDef } from "../types";

const SOURCES: SourceDef[] = [
  { id: "alrajhi", name: "Al Rajhi Bank", kind: "credit-card offers", status: "live", progress: 100, note: "10 offers indexed · snapshot fallback wired" },
  { id: "snb", name: "SNB (AlAhli)", kind: "credit-card offers", status: "drafting", progress: 45, note: "selector ladder drafted, needs live test" },
  { id: "riyad", name: "Riyad Bank", kind: "card offers", status: "queued", progress: 12, note: "target page identified" },
  { id: "tamara", name: "Tamara", kind: "BNPL merchant deals", status: "queued", progress: 0, note: "public deals feed under review" },
  { id: "amazon", name: "Amazon.sa", kind: "card-linked promos", status: "queued", progress: 0, note: "bank-code rotation tracking" },
  { id: "noon", name: "Noon", kind: "bank code tracking", status: "queued", progress: 0, note: "depends on Amazon.sa module" },
];

const CHIP: Record<SourceDef["status"], string> = {
  live: "bg-lime/15 text-pine border-lime/40",
  drafting: "bg-amber-soft text-[#8a6410] border-amber/50",
  queued: "bg-paper text-ink-faint border-line",
};

const BAR: Record<SourceDef["status"], string> = {
  live: "bg-mint",
  drafting: "bg-amber",
  queued: "bg-line",
};

export default function SourcesLedger({ onPick }: { onPick: (name: string) => void }) {
  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-pine">
            /// source pipeline
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            One bank today, <span className="text-pine">the rest in line.</span>
          </h2>
        </div>
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">
          Each source is a standalone scraper module. New engines plug into the same board, same schema.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        {SOURCES.map((s, i) => (
          <button
            key={s.id}
            onClick={() => s.status !== "live" && onPick(s.name)}
            disabled={s.status === "live"}
            className={`group flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3.5 text-left transition-colors first:border-t-0 sm:flex-nowrap sm:px-5 ${
              s.status === "live" ? "cursor-default bg-tint/45" : "hover:bg-tint/60"
            }`}
          >
            <span className="w-8 font-mono text-[11px] text-ink-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-[150px] items-center gap-2 font-display text-[16px] font-bold tracking-tight text-ink">
              {s.status === "live" && (
                <span className="relative inline-block h-2 w-2 rounded-full bg-mint text-mint ping-dot" />
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
        ))}
      </div>
    </section>
  );
}
