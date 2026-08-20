import type { CustomSource, SourceOutcome, SourceStatus } from "../types";
import { ArrowUpRight } from "./icons";

/**
 * Read-only on the public site. Sources are scraped by n8n workflows on the
 * server; the registry (adding/removing sources) lives in the control room.
 */

interface BaseSource {
  id: string;
  name: string;
  kind: string;
  engine: string;
  base: SourceStatus;
  progress: number;
  note: string;
}

const PIPELINE: BaseSource[] = [
  { id: "alrajhi", name: "Al Rajhi Bank", kind: "credit-card offers", engine: "onlydeals-alrajhi", base: "queued", progress: 100, note: "webhook ready · runs from control room or master scheduler" },
  { id: "jarir", name: "Jarir", kind: "merchant offers", engine: "onlydeals-jarir", base: "queued", progress: 100, note: "webhook ready · runs from control room or master scheduler" },
  { id: "snb", name: "SNB (AlAhli)", kind: "credit-card offers", engine: "—", base: "queued", progress: 35, note: "workflow drafting" },
  { id: "tamara", name: "Tamara", kind: "BNPL merchant deals", engine: "—", base: "queued", progress: 10, note: "deals feed under review" },
  { id: "noon", name: "Noon", kind: "bank code tracking", engine: "—", base: "queued", progress: 5, note: "queued behind jarir" },
];

const CHIP: Record<SourceStatus, string> = {
  live: "bg-live/15 text-[#0d7a47] border-live/40",
  snapshot: "bg-amber-soft text-[#8a6410] border-amber/50",
  error: "bg-ember-soft text-ember border-ember/40",
  queued: "bg-paper text-ink-faint border-line",
};

const BAR: Record<SourceStatus, string> = {
  live: "bg-live",
  snapshot: "bg-amber",
  error: "bg-ember",
  queued: "bg-line",
};

interface Props {
  outcomes: SourceOutcome[];
  custom: CustomSource[];
}

export default function SourcesLedger({ outcomes, custom }: Props) {
  const rows = [
    ...PIPELINE.map((p) => {
      const oc = outcomes.find((o) => o.id === p.id);
      const status: SourceStatus = oc ? oc.status : p.base;
      return {
        ...p,
        status,
        note: oc ? `${oc.note} · engine ${p.engine}` : p.note,
      };
    }),
    ...custom.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind === "bank" ? "registered bank" : "registered vendor",
      engine: "—",
      base: "queued" as SourceStatus,
      status: "queued" as SourceStatus,
      progress: 0,
      note: `registered from the control room · awaiting its workflow`,
    })),
  ];

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
            /// source pipeline · runs on n8n
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            One workflow per source, <span className="text-brick">plug and play.</span>
          </h2>
        </div>
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">
          Every source is its own n8n workflow posting to one ingest endpoint. The master
          scheduler fans them out; the registry lives in the control room.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        {rows.map((s, i) => (
          <div
            key={s.id}
            className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3.5 first:border-t-0 sm:flex-nowrap sm:px-5"
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
            <span className="hidden flex-1 truncate text-[12px] text-ink-soft lg:block">{s.note}</span>
            <span className="hidden max-w-[180px] truncate rounded border border-line bg-paper px-2 py-0.5 font-mono text-[10px] text-ink-soft xl:block">
              {s.engine !== "—" ? (
                <span className="flex items-center gap-1">
                  wf: {s.engine}
                  <ArrowUpRight className="h-3 w-3 text-ink-faint" />
                </span>
              ) : (
                "no workflow yet"
              )}
            </span>
            <span className="ml-auto flex items-center gap-3">
              <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-line sm:block">
                <span
                  className={`block h-full rounded-full ${BAR[s.status]} transition-all duration-700`}
                  style={{ width: `${s.progress}%` }}
                />
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] ${CHIP[s.status]}`}
              >
                {s.status === "live" ? "● live" : s.status}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
