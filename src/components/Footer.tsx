import { BrandMark } from "./icons";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-term-line bg-term py-10 text-ink sm:mt-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <BrandMark className="mt-1 h-8 w-8 text-ink" />
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight">
              only<span className="text-flare">deals</span>
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-mut">
              A feed-driven deals board. n8n workflows do the scraping into Postgres; this
              site only reads the merged feed. Offers, terms and trademarks belong to their
              issuers — always confirm on the bank's site before you shop.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 font-mono text-[11px] tracking-[0.08em] text-dim sm:grid-cols-3">
          <div>
            <dt className="uppercase text-dim">engine</dt>
            <dd className="mt-0.5 text-ink">n8n + postgres</dd>
          </div>
          <div>
            <dt className="uppercase text-dim">feed</dt>
            <dd className="mt-0.5 text-ink">/onlydeals.json</dd>
          </div>
          <div>
            <dt className="uppercase text-dim">refresh</dt>
            <dd className="mt-0.5 text-ink">every 5 min</dd>
          </div>
          <div>
            <dt className="uppercase text-dim">sources</dt>
            <dd className="mt-0.5 text-ink">alrajhi · jarir</dd>
          </div>
          <div>
            <dt className="uppercase text-dim">schema</dt>
            <dd className="mt-0.5 text-ink">offer.v1</dd>
          </div>
          <div>
            <dt className="uppercase text-dim">build</dt>
            <dd className="mt-0.5 text-ink">v0.6.0</dd>
          </div>
        </dl>
      </div>
    </footer>
  );
}
