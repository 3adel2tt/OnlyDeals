import type { FeedProvenance } from "../types";
import { BrandMark } from "./icons";
import { PROVENANCE_NOTE } from "../lib/feed";
import { timeAgo } from "../lib/format";

interface Props {
  provenance: FeedProvenance | null;
  lastSync: number | null;
}

export default function Footer({ provenance, lastSync }: Props) {
  return (
    <footer className="border-t border-term-line bg-term">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-7 w-7 text-ink" />
              <span className="font-display text-lg font-extrabold tracking-tight text-ink">
                onlydeals
              </span>
            </div>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-mut">
              No offer on this board was posted by hand. Everything is scraped from bank
              card-offer pages by n8n workflows, normalised into{" "}
              <code className="rounded bg-term-2 px-1 py-0.5 font-mono text-[10.5px] text-ember">
                offer.v1
              </code>{" "}
              and served by one feed.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
              {provenance ? PROVENANCE_NOTE[provenance] : "feed unresolved"}
              {lastSync ? ` · pulled ${timeAgo(lastSync)}` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 font-mono text-[11px] uppercase tracking-[0.14em] sm:grid-cols-3">
            <div>
              <p className="mb-3 text-dim">Pipeline</p>
              <ul className="space-y-2">
                <li>
                  <a href="/onlydeals.json" className="text-ink-soft transition-colors hover:text-flare">
                    /onlydeals.json
                  </a>
                </li>
                <li>
                  <a
                    href="/workflows/manifest.json"
                    className="text-ink-soft transition-colors hover:text-flare"
                  >
                    n8n workflows
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-dim">Engines</p>
              <ul className="space-y-2 text-ink-soft">
                <li>onlydeals-alrajhi</li>
                <li>onlydeals-jarir</li>
                <li className="text-dim">master-scheduler</li>
              </ul>
            </div>
            <div>
              <p className="mb-3 text-dim">Ops</p>
              <ul className="space-y-2">
                <li>
                  <a href="#/admin" className="text-ink-soft transition-colors hover:text-flare">
                    Control room ↗
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-term-line pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            onlydeals · deals belong to their banks — this is a mirror, not a store
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
            expiry labels run on Saudi calendar days
          </p>
        </div>
      </div>
    </footer>
  );
}
