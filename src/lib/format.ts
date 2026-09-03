const DAY = 86_400_000;

export function daysFromNow(n: number): string {
  return new Date(Date.now() + n * DAY).toISOString();
}

export function minutesAgo(n: number): number {
  return Date.now() - n * 60_000;
}

export function daysLeft(iso: string): number {
  // Calendar-based: compare whole days at UTC midnight, so an offer that
  // expires tonight at 20:59:59Z (end of day, Saudi) still counts as "today".
  const a = new Date(iso);
  a.setUTCHours(0, 0, 0, 0);
  const b = new Date();
  b.setUTCHours(0, 0, 0, 0);
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

export interface ExpiryMeta {
  tone: "hot" | "warm" | "ok" | "open";
  label: string;
}

export function expiryMeta(iso: string | null): ExpiryMeta {
  if (!iso) return { tone: "open", label: "No expiry listed" };
  const d = daysLeft(iso);
  if (d < 0) return { tone: "hot", label: "Expired" };
  if (d === 0) return { tone: "hot", label: "Ends today" };
  if (d === 1) return { tone: "hot", label: "Ends tomorrow" };
  if (d <= 3) return { tone: "hot", label: `${d} days left` };
  if (d <= 7) return { tone: "warm", label: `${d} days left` };
  if (d <= 30) return { tone: "ok", label: `${d} days left` };
  return { tone: "ok", label: `${Math.floor(d / 30)} mo left` };
}
