import type { FeedProvenance, User } from "../types";
import { timeAgo } from "../lib/format";
import {
  BrandMark,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  StarIcon,
  SunIcon,
  UserIcon,
} from "./icons";

interface Props {
  provenance: FeedProvenance | null;
  lastSync: number | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onBrowse: () => void;
  user: User | null;
  view: "all" | "my";
  followCount: number;
  onToggleView: () => void;
  onSignIn: () => void;
  onLogout: () => void;
}

const PROV_LABEL: Record<FeedProvenance, string> = {
  remote: "LIVE FEED",
  local: "LOCAL PUSH",
  bundled: "SEED DATA",
};

export default function TopBar({
  provenance,
  lastSync,
  theme,
  onToggleTheme,
  onBrowse,
  user,
  view,
  followCount,
  onToggleView,
  onSignIn,
  onLogout,
}: Props) {
  const dotClass = !provenance
    ? "bg-ink-faint text-ink-faint"
    : provenance === "remote"
      ? "bg-live text-live"
      : "bg-amber text-amber";

  const label = provenance
    ? `${PROV_LABEL[provenance]} · ${lastSync ? timeAgo(lastSync).toUpperCase() : ""}`
    : "READING FEED…";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-6">
        <button
          onClick={onBrowse}
          className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft transition-all hover:border-brick hover:text-brick active:scale-[0.96] sm:px-3.5"
          aria-label="Open browse menu"
        >
          <MenuIcon className="h-4 w-4" />
          <span className="hidden lg:inline">Browse</span>
        </button>

        <a href="/" className="flex min-w-0 items-center gap-2.5 text-ink transition-colors hover:text-brick">
          <BrandMark className="h-8 w-8 shrink-0" />
          <span className="leading-none">
            <span className="block font-display text-[19px] font-extrabold tracking-tight text-ink">
              only<span className="text-brick">deals</span>
            </span>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
              n8n-powered offer feed
            </span>
          </span>
        </a>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-soft xl:flex">
            <span className={`relative inline-block h-2 w-2 rounded-full ${dotClass} ping-dot`} />
            {label}
          </span>

          {/* dark mode */}
          <button
            onClick={onToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition-all hover:rotate-12 hover:border-amber hover:text-amber active:scale-90"
          >
            {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
          </button>

          {/* My deals */}
          <button
            onClick={onToggleView}
            title={user ? "Your followed offers" : "Sign in to build your deals list"}
            className={`relative flex items-center gap-1.5 rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-all active:scale-[0.95] ${
              view === "my"
                ? "bg-amber text-card shadow-[0_4px_14px_-4px_color-mix(in_oklab,var(--color-amber)_70%,transparent)]"
                : "border border-line bg-card text-ink-soft hover:border-amber hover:text-ink"
            }`}
          >
            <StarIcon filled={view === "my"} className="h-3.5 w-3.5" />
            <span className="hidden md:inline">My deals</span>
            <span
              className={`num-tabular rounded-full px-1.5 py-px text-[10px] font-bold ${
                view === "my" ? "bg-ink text-paper" : "bg-tint text-brick"
              }`}
            >
              {user ? followCount : "·"}
            </span>
          </button>

          {/* user area */}
          {user ? (
            <div className="flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pl-1 pr-1">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-brick font-display text-[12px] font-extrabold text-card"
                title={user.email ?? user.username}
              >
                {(user.displayName || user.email || "?").slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden leading-none lg:block">
                <span className="block max-w-[110px] truncate text-[12px] font-semibold text-ink">
                  {user.displayName || user.email}
                </span>
                <span className="mt-px block font-mono text-[8.5px] uppercase tracking-[0.18em] text-ink-faint">
                  {user.role}
                </span>
              </span>
              <button
                onClick={onLogout}
                className="rounded-full p-1.5 text-ink-faint transition-colors hover:bg-ember-soft hover:text-ember"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogoutIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper transition-all hover:bg-brick hover:text-card active:scale-[0.96]"
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
