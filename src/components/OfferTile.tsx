import type { Offer } from "../types";
import { CATEGORY_LABEL } from "../types";
import { expiryMeta } from "../lib/format";
import { useReveal } from "../hooks/useReveal";
import { ArrowUpRight, CalendarIcon } from "./icons";

interface Props {
  offer: Offer;
  index: number;
  onOpen: (o: Offer) => void;
}

const BADGE: Record<string, string> = {
  hot: "bg-ember text-[#fff6f1]",
  warm: "bg-amber text-ink",
  ok: "bg-term/75 text-paper",
  open: "border border-dashed border-paper/60 bg-term/45 text-paper",
};

const STAMP: Record<Offer["kind"], string> = {
  percent: "bg-lime text-term",
  bogo: "bg-amber text-ink",
  cashback: "bg-lime text-term",
  installments: "border-2 border-term bg-paper text-ink",
};

export default function OfferTile({ offer, index, onOpen }: Props) {
  const { ref, inView } = useReveal<HTMLDivElement>();
  const exp = expiryMeta(offer.expiresAt);
  const rotate = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2"][index % 4];

  return (
    <div
      ref={ref}
      className={`reveal ${inView ? "is-in" : ""}`}
      style={{ transitionDelay: `${(index % 4) * 70}ms` }}
    >
      <button
        onClick={() => onOpen(offer)}
        className="group block w-full overflow-hidden rounded-xl border border-ink/10 bg-card text-left shadow-[0_1px_0_rgba(20,35,27,0.06)] transition-all duration-300 hover:-translate-y-1.5 hover:border-ink/20 hover:shadow-[0_24px_44px_-20px_rgba(20,35,27,0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
        aria-label={`${offer.merchant} — ${offer.headline}. Open details.`}
      >
        {/* photo */}
        <div className="relative aspect-[4/3] overflow-hidden bg-tint">
          {offer.image ? (
            <img
              src={offer.image}
              alt={offer.merchant}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-display text-5xl font-extrabold text-pine/40">
              {offer.merchant.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-term/45 to-transparent" />

          {/* expiry badge */}
          <span
            className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[9.5px] font-medium uppercase tracking-[0.1em] ${BADGE[exp.tone]}`}
          >
            <CalendarIcon className="h-3 w-3" />
            {exp.label}
          </span>

          {/* discount stamp */}
          <span
            className={`absolute -bottom-4 left-3 rounded-md px-2.5 py-1 font-display text-[22px] font-extrabold leading-tight tracking-tight shadow-[0_6px_14px_-6px_rgba(12,23,18,0.5)] transition-transform duration-300 group-hover:scale-105 ${rotate} ${STAMP[offer.kind]}`}
          >
            {offer.discountLabel}
          </span>
        </div>

        {/* body */}
        <div className="p-4 pb-4 pt-5">
          <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.16em]">
            <span className="text-pine">{CATEGORY_LABEL[offer.category]}</span>
            <span className="text-ink-faint">{offer.cards.length} card tier{offer.cards.length > 1 ? "s" : ""}</span>
          </div>

          <h3 className="mt-1.5 font-display text-[19px] font-bold leading-snug tracking-tight text-ink">
            {offer.merchant}
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-soft">
            {offer.headline}
          </p>

          <div className="mt-3.5 flex items-center justify-between border-t border-line pt-3">
            {offer.code ? (
              <span className="rounded border border-dashed border-pine/50 bg-tint/70 px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-[0.08em] text-pine">
                CODE {offer.code}
              </span>
            ) : (
              <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-faint">
                NO CODE NEEDED
              </span>
            )}
            <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft transition-colors group-hover:text-pine">
              Details
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
