import { RadarMark } from "./icons";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-term-line bg-term py-10 text-paper sm:mt-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <RadarMark className="mt-1 h-7 w-7 text-flare" />
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight">OFFRADAR</p>
            <p className="mt-1 max-w-sm text-[12.5px] leading-relaxed text-[#a9928b]">
              A personal scraping experiment. Offers, terms and trademarks belong to their
              issuers — snapshots can lag reality, always confirm on the bank's site before
              you shop.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-3 font-mono text-[11px] tracking-[0.08em] text-[#8f766f] sm:grid-cols-3">
          <div>
            <dt className="uppercase text-[#6b544e]">engine</dt>
            <dd className="mt-0.5 text-paper/90">fetch + DOMParser</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">relay</dt>
            <dd className="mt-0.5 text-paper/90">allorigins</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">fallback</dt>
            <dd className="mt-0.5 text-paper/90">local snapshot</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">sources</dt>
            <dd className="mt-0.5 text-paper/90">1 live · registry open</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">schema</dt>
            <dd className="mt-0.5 text-paper/90">offer.v1</dd>
          </div>
          <div>
            <dt className="uppercase text-[#6b544e]">build</dt>
            <dd className="mt-0.5 text-paper/90">v0.2.0</dd>
          </div>
        </dl>
      </div>
    </footer>
  );
}
