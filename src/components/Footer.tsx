import { BrandMark } from "./icons";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-term-line bg-term py-10 text-paper sm:mt-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <BrandMark className="mt-1 h-8 w-8" />
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight">
              only<span className="text-flare">deals</span>
            </p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[#a9928b]">
              A feed-driven deals board. n8n workflows do the scraping; this site only reads
              what they produce. Offers, terms and trademarks belong to their issuers —
              always confirm on the bank's site before you shop.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 font-mono text-[11px] tracking-[0.08em] text-[#8f766f] sm:grid-cols-3">
          <div>
            <dt className="uppercase text-[#6b544e]">engine</dt>
            <dd className="mt-0.5 text-paper/90">n8n workflows</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">ingest</dt>
            <dd className="mt-0.5 text-paper/90">offer.v1 json</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">fallback</dt>
            <dd className="mt-0.5 text-paper/90">bundled seed</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">sources</dt>
            <dd className="mt-0.5 text-paper/90">alrajhi · jarir</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">schema</dt>
            <dd className="mt-0.5 text-paper/90">offer.v1</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">build</dt>
            <dd className="mt-0.5 text-paper/90">v0.5.0</dd>
          </div>
        </dl>
      </div>
    </footer>
  );
}
