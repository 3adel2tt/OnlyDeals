import { useEffect, useMemo, useState } from "react";
import type { BrowseScope, CustomSource, Offer } from "../types";
import { CATEGORY_LABEL } from "../types";
import { cardKey, vendorKey } from "../lib/follows";
import {
  BackIcon,
  BankIcon,
  CardIcon,
  ChevronRightIcon,
  CloseIcon,
  LockIcon,
  SearchIcon,
  StarIcon,
  StoreIcon,
} from "./icons";

interface CardGroup {
  card: string;
  count: number;
  thumbs: string[];
}

interface BankGroup {
  bank: string;
  count: number;
  cards: CardGroup[];
}

interface VendorGroup {
  vendor: string;
  count: number;
  image: string;
  categories: string[];
  registered?: boolean;
}

const QUEUED_BANKS = [
  { name: "SNB (AlAhli)", note: "scraper drafting · source 02" },
  { name: "Riyad Bank", note: "queued · source 03" },
  { name: "Tamara", note: "queued · BNPL deals feed" },
  { name: "Amazon.sa", note: "queued · bank-code tracking" },
];

interface Props {
  open: boolean;
  offers: Offer[];
  custom: CustomSource[];
  active: BrowseScope;
  follows: string[];
  onApply: (scope: BrowseScope) => void;
  onClose: () => void;
  onLocked: (name: string) => void;
  onToggleCard: (bank: string, card: string) => void;
  onToggleVendor: (merchant: string) => void;
}

export default function BrowseDrawer({
  open,
  offers,
  custom,
  active,
  follows,
  onApply,
  onClose,
  onLocked,
  onToggleCard,
  onToggleVendor,
}: Props) {
  const [tab, setTab] = useState<"banks" | "vendors">("banks");
  const [drillBank, setDrillBank] = useState<string | null>(null);
  const [vendorQuery, setVendorQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const bankGroups = useMemo<BankGroup[]>(() => {
    const banks = new Map<string, Map<string, Offer[]>>();
    for (const o of offers) {
      if (!banks.has(o.bank)) banks.set(o.bank, new Map());
      const cards = banks.get(o.bank)!;
      if (!cards.has(o.card)) cards.set(o.card, []);
      cards.get(o.card)!.push(o);
    }
    return Array.from(banks.entries()).map(([bank, cards]) => ({
      bank,
      count: Array.from(cards.values()).reduce((n, list) => n + list.length, 0),
      cards: Array.from(cards.entries())
        .map(([card, list]) => ({
          card,
          count: list.length,
          thumbs: list.map((o) => o.image).filter(Boolean).slice(0, 3),
        }))
        .sort((a, b) => b.count - a.count),
    }));
  }, [offers]);

  const customBanks = useMemo(() => custom.filter((c) => c.kind === "bank"), [custom]);
  const customVendors = useMemo(() => custom.filter((c) => c.kind === "vendor"), [custom]);

  const indexedCount = (name: string) =>
    offers.filter((o) => o.bank === name || o.merchant === name).length;

  const allVendors = useMemo<VendorGroup[]>(() => {
    const map = new Map<string, Offer[]>();
    for (const o of offers) {
      if (!map.has(o.merchant)) map.set(o.merchant, []);
      map.get(o.merchant)!.push(o);
    }
    const rows: VendorGroup[] = Array.from(map.entries())
      .map(([vendor, list]) => ({
        vendor,
        count: list.length,
        image: list.find((o) => o.image)?.image ?? "",
        categories: Array.from(new Set(list.map((o) => CATEGORY_LABEL[o.category]))),
      }))
      .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor));
    for (const r of customVendors) {
      if (!rows.some((v) => v.vendor.toLowerCase() === r.name.toLowerCase())) {
        rows.push({
          vendor: r.name,
          count: 0,
          image: "",
          categories: [r.category ? CATEGORY_LABEL[r.category] : "registered"],
          registered: true,
        });
      }
    }
    return rows;
  }, [offers, customVendors]);

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return allVendors;
    return allVendors.filter(
      (v) =>
        v.vendor.toLowerCase().includes(q) ||
        v.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [allVendors, vendorQuery]);

  if (!open) return null;

  const drilled = drillBank ? bankGroups.find((b) => b.bank === drillBank) : null;

  const initials = (name: string) =>
    name
      .split(/[\s(]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Browse offers">
      <button className="fade-in absolute inset-0 bg-term/55 backdrop-blur-[2px]" onClick={onClose} aria-label="Close browse menu" />

      <aside className="drawer-in absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col border-r border-term-line bg-term text-paper shadow-2xl">
        {/* head */}
        <div className="flex items-center gap-3 border-b border-term-line px-5 pb-4 pt-5">
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-[#8f766f]">
              /// browse onlydeals
            </p>
            <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">
              {tab === "banks" ? (drilled ? drilled.bank : "Offers by bank") : "Offers by vendor"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full border border-term-line p-2 text-[#a9928b] transition-all hover:rotate-90 hover:border-[#f07a5f]/60 hover:text-[#f07a5f]"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* mode switch */}
        <div className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-lg border border-term-line bg-[#120d0c] p-1">
          {(
            [
              { id: "banks", label: "By bank", Icon: BankIcon },
              { id: "vendors", label: "By vendor", Icon: StoreIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all ${
                tab === id
                  ? "bg-flare font-semibold text-[#2b0c08] shadow-[0_2px_10px_-2px_rgba(255,87,71,0.6)]"
                  : "text-[#8f766f] hover:text-paper"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="term-scroll flex-1 overflow-y-auto px-3 py-4">
          {/* ------- BANKS ------- */}
          {tab === "banks" && !drilled && (
            <div className="space-y-1.5">
              {bankGroups.map((b, i) => (
                <button
                  key={b.bank}
                  onClick={() => setDrillBank(b.bank)}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className={`row-in group flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all hover:translate-x-1 ${
                    (active.type === "bank-card" || active.type === "bank") && active.bank === b.bank
                      ? "border-flare/50 bg-flare/10"
                      : "border-term-line bg-[#1f1412] hover:border-flare/40"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[13px] font-extrabold text-flare">
                    {initials(b.bank)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[14.5px] font-bold tracking-tight">
                      {b.bank}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[#8f766f]">
                      <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-live text-live ping-dot" />
                      live source · {b.cards.length} cards
                    </span>
                  </span>
                  <span className="rounded-full bg-flare/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-flare">
                    {b.count}
                  </span>
                  <ChevronRightIcon className="h-3.5 w-3.5 text-[#6b544e] transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                </button>
              ))}

              {offers.length === 0 && (
                <p className="px-2 py-6 text-center font-mono text-[11px] text-[#6b544e]">
                  Waiting for the first scrape pass…
                  <span className="caret ml-1 inline-block h-[11px] w-[6px] translate-y-[1px] bg-flare" />
                </p>
              )}

              {customBanks.length > 0 && (
                <>
                  <p className="px-2 pb-1 pt-4 font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#6b544e]">
                    ── your registry
                  </p>
                  {customBanks.map((c, i) => {
                    const n = indexedCount(c.name);
                    const isActive = active.type === "bank" && active.bank === c.name;
                    return (
                      <button
                        key={c.id}
                        onClick={() => onApply({ type: "bank", bank: c.name })}
                        style={{ animationDelay: `${(i + 1) * 45}ms` }}
                        className={`row-in group flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:translate-x-1 ${
                          isActive
                            ? "border-flare/50 bg-flare/10"
                            : "border-dashed border-term-line bg-transparent hover:border-flare/40"
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-term-line bg-[#1f1412] font-display text-[11px] font-extrabold text-[#8f766f]">
                          {initials(c.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[13.5px] font-bold tracking-tight text-[#d8c8c2]">
                            {c.name}
                          </span>
                          <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b544e]">
                            {n > 0 ? `${n} offers indexed` : "registered · engine pending"}
                          </span>
                        </span>
                        <span className="rounded-full border border-flare/40 bg-flare/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-flare">
                          registered
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              <p className="px-2 pb-1 pt-4 font-mono text-[9.5px] uppercase tracking-[0.2em] text-[#6b544e]">
                ── in the pipeline
              </p>
              {QUEUED_BANKS.map((b, i) => (
                <button
                  key={b.name}
                  onClick={() => onLocked(b.name)}
                  style={{ animationDelay: `${(i + 2) * 45}ms` }}
                  className="row-in group flex w-full items-center gap-3 rounded-lg border border-dashed border-term-line px-3 py-2.5 text-left opacity-70 transition-all hover:translate-x-1 hover:border-amber/40 hover:opacity-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-term-line bg-[#1f1412] font-display text-[11px] font-extrabold text-[#6b544e]">
                    {initials(b.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[13.5px] font-bold tracking-tight text-[#a9928b]">
                      {b.name}
                    </span>
                    <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b544e]">
                      {b.note}
                    </span>
                  </span>
                  <span className="rounded-full border border-term-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b544e]">
                    queued
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* ------- BANK → CARDS ------- */}
          {tab === "banks" && drilled && (
            <div>
              <button
                onClick={() => setDrillBank(null)}
                className="mb-3 flex items-center gap-2 rounded-full border border-term-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[#a9928b] transition-colors hover:border-flare/50 hover:text-flare"
              >
                <BackIcon className="h-3 w-3" />
                All banks
              </button>

              <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#8f766f]">
                {drilled.count} offers across {drilled.cards.length} card tiers — pick a card:
              </p>

              <div className="space-y-1.5">
                {drilled.cards.map((c, i) => {
                  const isActive =
                    active.type === "bank-card" &&
                    active.bank === drilled.bank &&
                    active.card === c.card;
                  const followed = follows.includes(cardKey(drilled.bank, c.card));
                  return (
                    <div
                      key={c.card}
                      role="button"
                      tabIndex={0}
                      onClick={() => onApply({ type: "bank-card", bank: drilled.bank, card: c.card })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onApply({ type: "bank-card", bank: drilled.bank, card: c.card });
                        }
                      }}
                      style={{ animationDelay: `${i * 50}ms` }}
                      className={`row-in group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                        isActive
                          ? "border-flare/50 bg-flare/10"
                          : "border-term-line bg-[#1f1412] hover:border-flare/40"
                      }`}
                    >
                      <CardIcon className={`h-5 w-5 shrink-0 ${isActive ? "text-flare" : "text-[#6b544e] group-hover:text-flare"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[14px] font-bold tracking-tight">
                          {c.card}
                        </span>
                        <span className="mt-1 flex items-center">
                          {c.thumbs.length > 0 ? (
                            <span className="flex -space-x-2">
                              {c.thumbs.map((t, j) => (
                                <img
                                  key={j}
                                  src={t}
                                  alt=""
                                  className="h-6 w-6 rounded-full border-2 border-term object-cover"
                                />
                              ))}
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#6b544e]">
                              no imagery yet
                            </span>
                          )}
                        </span>
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCard(drilled.bank, c.card);
                        }}
                        title={followed ? "Unfollow this card" : "Follow this card tier"}
                        aria-label={followed ? "Unfollow card" : "Follow card"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                          followed
                            ? "star-pop bg-amber text-ink shadow-[0_3px_10px_-2px_rgba(232,185,62,0.8)]"
                            : "border border-term-line text-[#8f766f] hover:border-amber/60 hover:text-amber"
                        }`}
                      >
                        <StarIcon filled={followed} className="h-3.5 w-3.5" />
                      </button>
                      <span className="font-mono text-[10px] font-semibold text-flare">
                        {c.count} offer{c.count > 1 ? "s" : ""}
                      </span>
                      <ChevronRightIcon className="h-3.5 w-3.5 text-[#6b544e] transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => onApply({ type: "bank", bank: drilled.bank })}
                className="mt-3 w-full rounded-lg border border-dashed border-term-line py-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[#6b544e] transition-colors hover:border-amber/40 hover:text-amber"
              >
                view every {drilled.bank} offer →
              </button>
            </div>
          )}

          {/* ------- VENDORS ------- */}
          {tab === "vendors" && (
            <div>
              <div className="relative mb-3">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b544e]" />
                <input
                  value={vendorQuery}
                  onChange={(e) => setVendorQuery(e.target.value)}
                  placeholder="Filter vendors…"
                  className="w-full rounded-lg border border-term-line bg-[#120d0c] py-2 pl-9 pr-3 font-mono text-[11.5px] text-paper placeholder:text-[#6b544e] focus:border-flare/50 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                {filteredVendors.map((v, i) => {
                  const isActive = active.type === "vendor" && active.vendor === v.vendor;
                  const followed = follows.includes(vendorKey(v.vendor));
                  return (
                    <div
                      key={v.vendor}
                      role="button"
                      tabIndex={0}
                      onClick={() => onApply({ type: "vendor", vendor: v.vendor })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onApply({ type: "vendor", vendor: v.vendor });
                        }
                      }}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className={`row-in group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                        v.registered && !isActive
                          ? "border-dashed border-term-line bg-transparent hover:border-flare/40"
                          : isActive
                            ? "border-flare/50 bg-flare/10"
                            : "border-term-line bg-[#1f1412] hover:border-flare/40"
                      }`}
                    >
                      {v.image ? (
                        <img
                          src={v.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md border border-term-line object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-term-line bg-[#120d0c] font-display text-[12px] font-extrabold text-[#6b544e]">
                          {initials(v.vendor)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-display text-[14px] font-bold tracking-tight ${v.registered ? "text-[#d8c8c2]" : ""}`}>
                          {v.vendor}
                        </span>
                        <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#8f766f]">
                          {v.categories.join(" · ")}
                        </span>
                      </span>
                      {v.count > 0 ? (
                        <span className="rounded-full bg-flare/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-flare">
                          {v.count}
                        </span>
                      ) : (
                        <span className="rounded-full border border-flare/40 bg-flare/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-flare">
                          registered
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleVendor(v.vendor);
                        }}
                        title={followed ? "Unfollow this merchant" : "Follow this merchant"}
                        aria-label={followed ? "Unfollow merchant" : "Follow merchant"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                          followed
                            ? "star-pop bg-amber text-ink shadow-[0_3px_10px_-2px_rgba(232,185,62,0.8)]"
                            : "border border-term-line text-[#8f766f] hover:border-amber/60 hover:text-amber"
                        }`}
                      >
                        <StarIcon filled={followed} className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRightIcon className="h-3.5 w-3.5 text-[#6b544e] transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                    </div>
                  );
                })}
                {filteredVendors.length === 0 && (
                  <p className="px-2 py-6 text-center font-mono text-[11px] text-[#6b544e]">
                    No vendors match “{vendorQuery}”.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* foot */}
        <div className="border-t border-term-line px-5 py-3">
          <p className="flex items-center justify-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[#8f766f]">
            <LockIcon className="h-3 w-3 shrink-0" />
            source registry lives in the control room
          </p>
          <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-[#6b544e]">
            {custom.length} registered · schema offer.v1 · fed by n8n
          </p>
        </div>
      </aside>
    </div>
  );
}
