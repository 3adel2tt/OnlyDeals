import type { Offer } from "../types";
import { daysLeft } from "../lib/format";

function itemsFrom(offers: Offer[]): string[] {
  if (offers.length === 0)
    return ["ONLYDEALS · SYNCING FEED · ENGINES AL RAJHI + JARIR ON N8N · STAND BY"];
  return offers.map((o) => {
    let exp = "OPEN-ENDED";
    if (o.expiresAt) {
      const d = daysLeft(o.expiresAt);
      exp = d === 0 ? "ENDS TODAY" : d === 1 ? "ENDS TOMORROW" : `${d}D LEFT`;
    }
    return `${o.merchant.toUpperCase()} ${o.discountLabel} · ${exp}`;
  });
}

export default function Ticker({ offers }: { offers: Offer[] }) {
  const items = itemsFrom(offers);
  const half = (
    <>
      {items.map((t, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-4">{t}</span>
          <span className="text-flare/80">◆</span>
        </span>
      ))}
    </>
  );

  return (
    <div className="marquee overflow-hidden border-b border-term-line bg-term py-2 text-ink" aria-hidden="true">
      <div className="marquee-track font-mono text-[11px] tracking-[0.12em]">
        <div className="flex">{half}</div>
        <div className="flex">{half}</div>
      </div>
    </div>
  );
}
