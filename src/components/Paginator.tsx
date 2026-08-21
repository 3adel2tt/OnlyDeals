import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

export type ViewMode = "pages" | "infinite";
export const PAGE_SIZES = [24, 48, 96] as const;

interface Props {
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  pageSize: number;
  onPageSize: (n: number) => void;
  page: number;
  totalPages: number;
  onPage: (n: number) => void;
  totalItems: number;
}

/** Compact windowed page list: 1 … n-1 n n+1 … last */
function pageWindow(page: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: Array<number | "…"> = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(total - 1, page + 1);
  if (lo > 2) out.push("…");
  for (let p = lo; p <= hi; p++) out.push(p);
  if (hi < total - 1) out.push("…");
  out.push(total);
  return out;
}

export default function Paginator({
  viewMode,
  onViewMode,
  pageSize,
  onPageSize,
  page,
  totalPages,
  onPage,
  totalItems,
}: Props) {
  return (
    <div className="mt-8 flex flex-col items-center gap-4">
      {/* view toggle + page size */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="flex rounded-full border border-line bg-card p-1">
          {(
            [
              { id: "pages", label: "Pages" },
              { id: "infinite", label: "Infinite scroll" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => onViewMode(m.id)}
              className={`rounded-full px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] transition-all ${
                viewMode === m.id
                  ? "bg-ink text-paper shadow-sm"
                  : "text-ink-faint hover:text-ink"
              }`}
              aria-pressed={viewMode === m.id}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
          Per page
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="cursor-pointer rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[11px] text-ink focus:border-brick focus:outline-none"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* numbered pages (pages mode only) */}
      {viewMode === "pages" && totalPages > 1 && (
        <nav className="fade-in flex items-center gap-1.5" aria-label="Pagination">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition-all hover:border-brick hover:text-brick active:scale-90 disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink-soft"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
          </button>

          {pageWindow(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-1 font-mono text-[12px] text-ink-faint">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
                className={`num-tabular h-9 min-w-9 rounded-full px-2.5 font-mono text-[12px] font-semibold transition-all active:scale-90 ${
                  p === page
                    ? "bg-brick text-card shadow-[0_4px_14px_-4px_color-mix(in_oklab,var(--color-brick)_70%,transparent)]"
                    : "border border-line bg-card text-ink-soft hover:border-brick hover:text-brick"
                }`}
              >
                {p}
              </button>
            ),
          )}

          <button
            onClick={() => onPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition-all hover:border-brick hover:text-brick active:scale-90 disabled:opacity-35 disabled:hover:border-line disabled:hover:text-ink-soft"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </nav>
      )}

      <p className="num-tabular font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
        {totalItems} deal{totalItems === 1 ? "" : "s"}
        {viewMode === "pages" && totalPages > 0 ? ` · page ${page}/${totalPages}` : " · scroll to load more"}
      </p>
    </div>
  );
}
