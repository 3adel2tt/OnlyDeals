import type { Offer } from "../types";
import { alrajhiSnapshot } from "../data/alrajhiSnapshot";

/**
 * Source registry. Each entry is a real scraping target: a URL the crawler
 * actually fetches (via relays), a selector ladder for raw HTML, and an
 * optional snapshot fallback for when every route is blocked.
 *
 * Adding a source = adding an entry here. The engine, board, drawer and
 * ledger all pick it up automatically.
 */

export interface ScraperSource {
  id: string;
  name: string;
  bank: string;
  defaultCard: string;
  url: string;
  htmlLadder: string[];
  fallback?: () => Offer[];
}

export const SCRAPE_SOURCES: ScraperSource[] = [
  {
    id: "alrajhi",
    name: "Al Rajhi Bank",
    bank: "Al Rajhi Bank",
    defaultCard: "All credit tiers",
    url: "https://www.alrajhibank.com.sa/en/personal/cards/credit-cards/card-offers",
    htmlLadder: [
      '[class*="offer" i] [class*="title" i]',
      '[class*="card-offer" i] a',
      '[class*="Campaign" i] h2, [class*="Campaign" i] h3',
      "a[href*='offer' i] img",
    ],
    fallback: alrajhiSnapshot,
  },
  {
    id: "snb",
    name: "SNB (AlAhli)",
    bank: "SNB",
    defaultCard: "SNB credit cards",
    url: "https://www.snb.com.sa/en/personal-banking/cards/credit-cards/card-offers",
    htmlLadder: [
      '[class*="offer" i] [class*="title" i]',
      '[class*="card-offer" i] a',
      '[class*="card" i] [class*="title" i]',
      "a[href*='offer' i]",
    ],
  },
  {
    id: "tamara",
    name: "Tamara",
    bank: "Tamara",
    defaultCard: "Tamara account",
    url: "https://tamara.co/deals",
    htmlLadder: [
      '[class*="deal" i] [class*="title" i]',
      '[class*="DealCard" i] a',
      '[class*="merchant" i] [class*="name" i]',
    ],
  },
];
