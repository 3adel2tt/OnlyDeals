import type { ScrapeStatus } from "../types";
import { timeAgo } from "../lib/format";
import { MenuIcon, RadarMark, RefreshIcon } from "./icons";

interface Props {
  status: ScrapeStatus;
  live: boolean;
  scrapedAt: number | null;
  onRescrape: () => void;
  onBrowse: () => void;
}

export default function TopBar({ status, live, scrapedAt, onRescrape, onBrowse }: Props) {
  const running = status === "running";

  const dotClass = running
    ? "bg-amber text-amber"
    : status === "done"
      ? live
        ? "bg-live text-live"
        : "bg-amber text-amber"
      : "bg-ink-faint text-ink-faint";

  const label = running
    ? "SCRAPING…"
    : status === "done"
      ? `${live ? "LIVE" : "SNAPSHOT"} · ${scrapedAt ? timeAgo(scrapedAt).toUpperCase() : ""}`
      : "STANDBY";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
        <button
          onClick={onBrowse}
          className="flex items-center gap-2 rounded-full border border-line bg-card px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft transition-all hover:border-brick hover:text-brick active:scale-[0.96]"
          aria-label="Open browse menu"
        >
          <MenuIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Browse</span>
        </button>
        <a href="#top" className="flex items-center gap-2.5 text-brick">
          <RadarMark active={running} className="h-8 w-8" />
          <span className="leading-none">
            <span className="block font-display text-lg font-extrabold tracking-tight text-ink">
              OFFRADAR
            </span>
            <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.22em] text-ink-faint">
              bank offer scraper
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft sm:flex">
            <span className={`relative inline-block h-2 w-2 rounded-full ${dotClass} ${running || status === "done" ? "ping-dot" : ""}`} />
            {label}
          </span>

          <button
            onClick={onRescrape}
            disabled={running}
            className="group flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-paper transition-all hover:bg-brick active:scale-[0.97] disabled:opacity-60"
          >
            <RefreshIcon className={`h-3.5 w-3.5 ${running ? "spin" : "transition-transform duration-500 group-hover:rotate-180"}`} />
            <span className="hidden sm:inline">{running ? "Running pass" : "Re-scrape"}</span>
            <span className="sm:hidden">{running ? "…" : "Scan"}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
