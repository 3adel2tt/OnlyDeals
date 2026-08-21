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
  registered?: boolean;
}

interface VendorGroup {
  vendor: string;
  count: number;
  image: string;
  categories: string[];
  registered?: boolean;
}

const QUEUED_BANKS = [
  { name: "SNB (AlAhli)", note: "queued · source workflow pending" },
  { name: "Riyad Bank", note: "queued · source workflow pending" },
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

  useEffect(() => {
    if (open) setDrillBank(null);
  }, [open, tab]);

  const bankGroups = useMemo<BankGroup[]>(() => {
    const banks = new Map<string, Map<string, Offer[]>>();
    for (const o of offers) {
      if (!banks.has(o.bank)) banks.set(o.bank, new Map());
      const cards = banks.get(o.bank)!;
      if (!cards.has(o.card)) cards.set(o.card, []);
      cards.get(o.card)!.push(o);
    }
    const groups: BankGroup[] = Array.from(banks.entries()).map(([bank, cards]) => ({
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

    // admin-registered banks without a workflow yet
    for (const c of custom) {
      if (c.kind === "bank" && !groups.some((g) => g.bank === c.name)) {
        groups.push({ bank: c.name, count: 0, cards: [], registered: true });
      }
    }
    return groups;
  }, [offers, custom]);

  const vendorGroups = useMemo<VendorGroup[]>(() => {
    const map = new Map<string, Offer[]>();
    for (const o of offers) {
      if (!map.has(o.merchant)) map.set(o.merchant, []);
      map.get(o.merchant)!.push(o);
    }
    const groups: VendorGroup[] = Array.from(map.entries())
      .map(([vendor, list]) => ({
        vendor,
        count: list.length,
        image: list.find((o) => o.image)?.image ?? "",
        categories: Array.from(new Set(list.map((o) => CATEGORY_LABEL[o.category]))),
      }))
      .sort((a, b) => b.count - a.count || a.vendor.localeCompare(b.vendor));

    for (const c of custom) {
      if (c.kind === "vendor" && !groups.some((g) => g.vendor === c.name)) {
        groups.push({
          vendor: c.name,
          count: 0,
          image: "",
          categories: [c.category ? CATEGORY_LABEL[c.category] : "queued"],
          registered: true,
        });
      }
    }
    return groups;
  }, [offers, custom]);

  const filteredVendors = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return vendorGroups;
    return vendorGroups.filter(
      (v) =>
        v.vendor.toLowerCase().includes(q) ||
        v.categories.some((c) => c.toLowerCase().includes(q)),
    );
  }, [vendorGroups, vendorQuery]);

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

  const title =
    tab === "banks" ? (drilled ? drilled.bank : "Offers by bank") : "Offers by vendor";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Browse offers">
      <button
        className="fade-in absolute inset-0 bg-term/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close browse menu"
      />

      <aside className="drawer-in absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col border-r border-term-line bg-term text-ink shadow-2xl">
        {/* head */}
        <div className="flex items-center gap-3 border-b border-term-line px-5 pb-4 pt-5">
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.24em] text-dim">
              /// browse onlydeals
            </p>
            <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-full border border-term-line p-2 text-mut transition-all hover:rotate-90 hover:border-ember/60 hover:text-ember"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* mode switch */}
        <div className="mx-5 mt-4 grid grid-cols-2 gap-1 rounded-lg border border-term-line bg-term-2 p-1">
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
                  ? "bg-flare font-semibold text-card shadow-[0_2px_10px_-2px_color-mix(in_oklab,var(--color-flare)_60%,transparent)]"
                  : "text-dim hover:text-ink"
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
                <div
                  key={b.bank}
                  role="button"
                  tabIndex={0}
                  onClick={() => (b.count > 0 ? setDrillBank(b.bank) : onLocked(b.bank))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      b.count > 0 ? setDrillBank(b.bank) : onLocked(b.bank);
                    }
                  }}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className={`row-in group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left transition-all hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                    (active.type === "bank-card" || active.type === "bank") && active.bank === b.bank
                      ? "border-flare/50 bg-flare/10"
                      : b.count === 0
                        ? "border-dashed border-term-line hover:border-amber/50"
                        : "border-term-line bg-term-2 hover:border-flare/40"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-flare/30 bg-flare/10 font-display text-[13px] font-extrabold text-flare">
                    {initials(b.bank)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[14.5px] font-bold tracking-tight">
                      {b.bank}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
                      {b.count > 0 ? (
                        <>
                          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-live text-live ping-dot" />
                          live engine · {b.cards.length} card{b.cards.length === 1 ? "" : "s"}
                        </>
                      ) : (
                        "registered · awaiting workflow"
                      )}
                    </span>
                  </span>
                  {b.count > 0 && (
                    <span className="rounded-full bg-flare/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-flare">
                      {b.count}
                    </span>
                  )}
                  <ChevronRightIcon className="h-3.5 w-3.5 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                </div>
              ))}

              {bankGroups.length === 0 && (
                <p className="px-2 py-6 text-center font-mono text-[11px] text-dim">
                  Waiting for the first feed…
                  <span className="caret ml-1 inline-block h-[11px] w-[6px] translate-y-[1px] bg-flare" />
                </p>
              )}

              <p className="px-2 pb-1 pt-4 font-mono text-[9.5px] uppercase tracking-[0.2em] text-dim">
                ── in the pipeline
              </p>
              {QUEUED_BANKS.filter((q) => !bankGroups.some((b) => b.bank === q.name)).map((b, i) => (
                <button
                  key={b.name}
                  onClick={() => onLocked(b.name)}
                  style={{ animationDelay: `${(i + 2) * 45}ms` }}
                  className="row-in group flex w-full items-center gap-3 rounded-lg border border-dashed border-term-line px-3 py-2.5 text-left opacity-70 transition-all hover:translate-x-1 hover:border-amber/40 hover:opacity-100"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-term-line bg-term-2 font-display text-[11px] font-extrabold text-dim">
                    {initials(b.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[13.5px] font-bold tracking-tight text-mut">
                      {b.name}
                    </span>
                    <span className="block font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
                      {b.note}
                    </span>
                  </span>
                  <span className="rounded-full border border-term-line px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
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
                className="mb-3 flex items-center gap-2 rounded-full border border-term-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-mut transition-colors hover:border-flare/50 hover:text-flare"
              >
                <BackIcon className="h-3 w-3" />
                All banks
              </button>

              <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-dim">
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
                          : "border-term-line bg-term-2 hover:border-flare/40"
                      }`}
                    >
                      <CardIcon className={`h-5 w-5 shrink-0 ${isActive ? "text-flare" : "text-dim group-hover:text-flare"}`} />
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
                            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
                              no imagery yet
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-flare">
                        {c.count} offer{c.count > 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCard(drilled.bank, c.card);
                        }}
                        title={followed ? "Unfollow this card tier" : "Follow this card tier"}
                        aria-label={followed ? "Unfollow card tier" : "Follow card tier"}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                          followed
                            ? "star-pop bg-amber text-card shadow-[0_3px_10px_-2px_color-mix(in_oklab,var(--color-amber)_70%,transparent)]"
                            : "border border-term-line text-dim hover:border-amber/60 hover:text-amber"
                        }`}
                      >
                        <StarIcon filled={followed} className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRightIcon className="h-3.5 w-3.5 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                    </div>
                  );
                })}
              </div>

              <button
                onClick={() => onApply({ type: "bank", bank: drilled.bank })}
                className="mt-3 w-full rounded-lg border border-dashed border-term-line py-2 font-mono text-[9.5px] uppercase tracking-[0.16em] text-dim transition-colors hover:border-amber/40 hover:text-amber"
              >
                view every {drilled.bank} offer →
              </button>
            </div>
          )}

          {/* ------- VENDORS ------- */}
          {tab === "vendors" && (
            <div>
              <div className="relative mb-3">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim" />
                <input
                  value={vendorQuery}
                  onChange={(e) => setVendorQuery(e.target.value)}
                  placeholder="Filter vendors…"
                  className="w-full rounded-lg border border-term-line bg-term-2 py-2 pl-9 pr-3 font-mono text-[11.5px] text-ink placeholder:text-dim focus:border-flare focus:outline-none"
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
                      onClick={() =>
                        v.count > 0
                          ? onApply({ type: "vendor", vendor: v.vendor })
                          : onLocked(v.vendor)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          v.count > 0
                            ? onApply({ type: "vendor", vendor: v.vendor })
                            : onLocked(v.vendor);
                        }
                      }}
                      style={{ animationDelay: `${i * 30}ms` }}
                      className={`row-in group flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all hover:translate-x-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flare ${
                        v.registered && !isActive
                          ? "border-dashed border-term-line hover:border-flare/40"
                          : isActive
                            ? "border-flare/50 bg-flare/10"
                            : "border-term-line bg-term-2 hover:border-flare/40"
                      }`}
                    >
                      {v.image ? (
                        <img
                          src={v.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md border border-term-line object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-term-line bg-term-2 font-display text-[12px] font-extrabold text-dim">
                          {initials(v.vendor)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[14px] font-bold tracking-tight">
                          {v.vendor}
                        </span>
                        <span className="block truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim">
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
                            ? "star-pop bg-amber text-card shadow-[0_3px_10px_-2px_color-mix(in_oklab,var(--color-amber)_70%,transparent)]"
                            : "border border-term-line text-dim hover:border-amber/60 hover:text-amber"
                        }`}
                      >
                        <StarIcon filled={followed} className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRightIcon className="h-3.5 w-3.5 text-dim transition-transform group-hover:translate-x-0.5 group-hover:text-flare" />
                    </div>
                  );
                })}
                {filteredVendors.length === 0 && (
                  <p className="px-2 py-6 text-center font-mono text-[11px] text-dim">
                    No vendors match “{vendorQuery}”.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* foot */}
        <div className="border-t border-term-line px-5 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">
            2 engines live · registry managed from the control room
          </p>
        </div>
      </aside>
    </div>
  );
}
