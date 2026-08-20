import type { Offer } from "../types";

/**
 * Per-user follow list. Keys are plain strings so they're trivially
 * serialisable and comparable:
 *   card::Al Rajhi Bank::Visa Infinite
 *   vendor::Barn's Coffee
 */

export const cardKey = (bank: string, card: string) => `card::${bank}::${card}`;
export const vendorKey = (merchant: string) => `vendor::${merchant}`;

const storageKey = (userId: string) => `onlydeals:follows:${userId}`;

export function getFollows(userId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setFollows(userId: string, follows: string[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(follows));
  } catch {
    /* ignore */
  }
}

export function toggleFollow(userId: string, follow: string): string[] {
  const cur = getFollows(userId);
  const next = cur.includes(follow)
    ? cur.filter((f) => f !== follow)
    : [...cur, follow];
  setFollows(userId, next);
  return next;
}

export function isFollowed(follow: string, follows: string[]): boolean {
  return follows.includes(follow);
}

export function offerFollowed(offer: Offer, follows: string[]): boolean {
  return (
    follows.includes(cardKey(offer.bank, offer.card)) ||
    follows.includes(vendorKey(offer.merchant))
  );
}

export function describeFollow(key: string): string {
  if (key.startsWith("card::")) {
    const [, bank, card] = key.split("::");
    return `${card} (${bank})`;
  }
  return key.replace("vendor::", "");
}
