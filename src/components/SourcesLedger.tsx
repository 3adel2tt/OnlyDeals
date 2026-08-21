import type { CustomSource, SourceOutcome } from "../types";
import { ArrowUpRight } from "./icons";

/**
 * Public, read-only view of the n8n pipeline. Outcomes come straight from
 * the feed — whatever the workflows reported on their last run.
 */

interface Row {
  id: string;
  name: string;
  kind: string;
  engine: string | null;
  status: "live" | "snapshot" | "error" | "queued";
  count: number;
  note: string;
  custom?: boolean;
  url?: string;
}

const QUEUED: Array<Omit<Row, "status" | "count" | "note">> = [
  { id: "snb", name: "SNB (AlAhli)", kind: "credit-card offers", engine: null },
  { id: "riyad", name: "Riyad Bank", kind: "card offers", engine: null },
  { id: "tamara", name: "Tamara", kind: "BNPL merchant deals", engine: null },
  { id: "amazon", name: "Amazon.sa", kind: "bank-code tracking", engine: null },
];

const CHIP: Record<Row["status"], string> = {
  live: "bg-live/15 text-[#0d7a47] border-live/40",
  snapshot: "bg-amber-soft text-[#8a6410] border-amber/50",
  error: "bg-ember-soft text-ember border-ember/40",
  queued: "bg-paper text-ink-faint border-line",
};

const DOT: Record<Row["status"], string> = {
  live: "bg-live text-live",
  snapshot: "bg-amber text-amber",
  error: "bg-ember text-ember",
  queued: "bg-line text-ink-faint",
};

interface Props {
  outcomes: SourceOutcome[];
  custom: CustomSource[];
  onPick: (name: string) => void;
}

export default function SourcesLedger({ outcomes, custom, onPick }: Props) {
  const rows: Row[] = [];

  // feed-reported engines first (alrajhi, jarir, whatever the ingest has seen)
  for (const o of outcomes) {
    rows.push({
      id: o.id,
      name: o.name,
      kind: o.id === "jarir" ? "merchant offers" : "credit-card offers",
      engine: `onlydeals-${o.id}`,
      status: o.status === "queued" ? "queued" : o.status,
      count: o.count,
      note: o.note,
    });
  }

  const seen = new Set(rows.map((r) => r.id));

  // admin-registered sources awaiting a workflow
  for (const c of custom) {
    const id = c.id;
    if (seen.has(id)) continue;
    rows.push({
      id,
      name: c.name,
      kind: c.kind === "bank" ? "credit-card offers" : "merchant offers",
      engine: null,
      status: "queued",
      count: 0,
      note: c.note ?? "registered · awaiting its n8n workflow",
      custom: true,
      url: c.url,
    });
  }

  for (const q of QUEUED) {
    if (!seen.has(q.id) && !rows.some((r) => r.id === q.id)) {
      rows.push({ ...q, status: "queued", count: 0, note: "queued for a source workflow" });
    }
  }

  return (
    <section className="mt-16 sm:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-brick">
            /// source pipeline · read-only
          </p>
          <h2 className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            One engine per source, <span className="text-brick">all on n8n.</span>
          </h2>
        </div>
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-soft">
          Each source is a standalone n8n workflow posting to one ingest endpoint. Scraping is
          managed from the control room and the master scheduler.
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-card">
        {rows.map((r, i) => (
          <div
            key={r.id}
            className={`group flex w-full flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3.5 text-left transition-colors first:border-t-0 sm:flex-nowrap sm:px-5 ${
              r.status === "queued" ? "cursor-pointer hover:bg-tint/60" : ""
            }`}
            onClick={() => r.status === "queued" && onPick(r.name)}
          >
            <span className="w-8 font-mono text-[11px] text-ink-faint">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex min-w-[150px] items-center gap-2 font-display text-[16px] font-bold tracking-tight text-ink">
              {r.status === "live" && (
                <span className={`relative inline-block h-2 w-2 rounded-full ${DOT[r.status]} ping-dot`} />
              )}
              {r.name}
              {r.custom && (
                <span className="rounded-full border border-brick/40 bg-tint px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.14em] text-brick">
                  registered
                </span>
              )}
            </span>
            <span className="hidden font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-faint md:block">
              {r.kind}
            </span>
            <span className="hidden flex-1 truncate text-[12px] text-ink-soft lg:block">
              {r.note}
            </span>
            <span className="ml-auto flex items-center gap-3">
              {r.count > 0 && (
                <span className="num-tabular font-mono text-[11px] font-semibold text-ink">
                  {r.count} offer{r.count === 1 ? "" : "s"}
                </span>
              )}
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-full border border-line p-1.5 text-ink-faint transition-colors hover:border-brick hover:text-brick"
                  aria-label={`Open ${r.name} offers page`}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
              <span className={`rounded-full border px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] ${CHIP[r.status]}`}>
                {r.status === "live" ? "● live" : r.status}
              </span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
