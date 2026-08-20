import { useEffect } from "react";
import type { Offer } from "../types";
import { CATEGORY_LABEL } from "../types";
import { expiryMeta, formatDate, timeAgo } from "../lib/format";
import {
  ArrowUpRight,
  CalendarIcon,
  CardIcon,
  CloseIcon,
  CopyIcon,
  StarIcon,
  StoreIcon,
} from "./icons";

interface Props {
  offer: Offer;
  scrapedAt: number | null;
  live: boolean;
  cardFollowed: boolean;
  vendorFollowed: boolean;
  onToggleCard: (offer: Offer) => void;
  onToggleVendor: (offer: Offer) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

const TONE_TEXT: Record<string, string> = {
  hot: "text-ember",
  warm: "text-[#a3740c]",
  ok: "text-brick",
  open: "text-ink-faint",
};

export default function OfferModal({
  offer,
  scrapedAt,
  live,
  cardFollowed,
  vendorFollowed,
  onToggleCard,
  onToggleVendor,
  onClose,
  onToast,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const exp = expiryMeta(offer.expiresAt);

  const copyCode = async () => {
    if (!offer.code) return;
    try {
      await navigator.clipboard.writeText(offer.code);
      onToast(`Code ${offer.code} copied to clipboard`);
    } catch {
      onToast(`Code: ${offer.code}`);
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-term/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-pop relative max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-term/70 p-2 text-paper backdrop-blur transition-all hover:rotate-90 hover:bg-ember"
          aria-label="Close details"
        >
          <CloseIcon />
        </button>

        <div className="grid md:grid-cols-[1.05fr_1fr]">
          {/* image side */}
          <div className="relative h-52 sm:h-64 md:h-auto md:min-h-[480px]">
            {offer.image ? (
              <img src={offer.image} alt={offer.merchant} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-tint font-display text-7xl font-extrabold text-brick/30">
                {offer.merchant.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-term/85 via-term/35 to-transparent p-4 pt-12">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-flare">
                {CATEGORY_LABEL[offer.category]} · {offer.bank} · {offer.card}
              </p>
              <h2 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-paper">
                {offer.discountLabel}
                <span className="ml-2 align-middle text-lg font-bold text-paper/85">{offer.merchant}</span>
              </h2>
            </div>
          </div>

          {/* details side */}
          <div className="flex flex-col p-5 sm:p-6">
            <p className="font-display text-[21px] font-bold leading-snug tracking-tight text-ink">
              {offer.headline}
            </p>

            <dl className="mt-5 space-y-3.5 text-[13.5px]">
              <div className="flex items-start gap-3">
                <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <div>
                  <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">Expires</dt>
                  <dd className={`font-semibold ${TONE_TEXT[exp.tone]}`}>
                    {offer.expiresAt ? `${formatDate(offer.expiresAt)} — ${exp.label.toLowerCase()}` : exp.label}
                  </dd>
                </div>
              </div>

              {offer.code && (
                <div className="flex items-start gap-3">
                  <CopyIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                  <div className="flex-1">
                    <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">Promo code</dt>
                    <dd className="mt-1 flex items-center gap-2">
                      <code className="rounded border border-dashed border-brick/50 bg-tint px-2.5 py-1 font-mono text-[13px] font-bold tracking-[0.1em] text-brick">
                        {offer.code}
                      </code>
                      <button
                        onClick={copyCode}
                        className="rounded-full bg-ink px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-paper transition-colors hover:bg-brick"
                      >
                        Copy
                      </button>
                    </dd>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <CardIcon className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <div>
                  <dt className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">Eligible cards</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {offer.cards.map((c) => (
                      <span key={c} className="rounded-full border border-line bg-paper px-2.5 py-0.5 text-[12px] font-medium text-ink-soft">
                        {c}
                      </span>
                    ))}
                  </dd>
                </div>
              </div>
            </dl>

            {/* follow actions */}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                onClick={() => onToggleCard(offer)}
                className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-all active:scale-95 ${
                  cardFollowed
                    ? "star-pop border-amber bg-amber text-ink"
                    : "border-line bg-paper text-ink-soft hover:border-amber hover:text-ink"
                }`}
              >
                <StarIcon filled={cardFollowed} className="h-3.5 w-3.5" />
                {cardFollowed ? "Following card" : "Follow card"}
              </button>
              <button
                onClick={() => onToggleVendor(offer)}
                className={`flex items-center justify-center gap-1.5 rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition-all active:scale-95 ${
                  vendorFollowed
                    ? "star-pop border-amber bg-amber text-ink"
                    : "border-line bg-paper text-ink-soft hover:border-amber hover:text-ink"
                }`}
              >
                {vendorFollowed ? (
                  <StarIcon filled className="h-3.5 w-3.5" />
                ) : (
                  <StoreIcon className="h-3.5 w-3.5" />
                )}
                {vendorFollowed ? "Following vendor" : "Follow vendor"}
              </button>
            </div>

            <div className="mt-5 rounded-lg border border-line bg-paper/70 p-3.5">
              <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-ink-faint">Fine print</p>
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                {offer.terms.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-amber" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-line pt-4">
              <a
                href={offer.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-1 items-center justify-center gap-2 rounded-full bg-brick px-5 py-2.5 font-mono text-[11.5px] font-medium uppercase tracking-[0.14em] text-paper transition-all hover:bg-ink active:scale-[0.98]"
              >
                Open offer page
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            </div>
            <p className="mt-2.5 text-center font-mono text-[9.5px] tracking-[0.1em] text-ink-faint">
              {live ? "PARSED LIVE" : "SNAPSHOT"} · SCRAPED {scrapedAt ? timeAgo(scrapedAt).toUpperCase() : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
