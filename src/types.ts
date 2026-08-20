export type Category =
  | "dining"
  | "coffee"
  | "online"
  | "electronics"
  | "fashion"
  | "groceries"
  | "travel"
  | "hotels"
  | "fuel"
  | "entertainment";

export interface Offer {
  id: string;
  merchant: string;
  headline: string;
  /** Big sticker label, e.g. "−20%" or "1+1 FREE" */
  discountLabel: string;
  /** Normalised numeric value used for sorting (percent equivalent) */
  value: number;
  kind: "percent" | "cashback" | "bogo" | "installments";
  category: Category;
  /** Issuing bank this offer was scraped from */
  bank: string;
  /** Card tier the offer is attached to */
  card: string;
  image: string;
  cards: string[];
  code?: string;
  link: string;
  /** ISO date or null when the page doesn't publish one */
  expiresAt: string | null;
  terms: string[];
}

export type SourceId = "alrajhi" | "snb" | "riyad" | "tamara" | "amazon" | "noon";

export interface SourceDef {
  id: SourceId;
  name: string;
  kind: string;
  status: "live" | "drafting" | "queued";
  progress: number;
  note: string;
}

export interface LogLine {
  id: number;
  time: string;
  kind: "info" | "ok" | "warn" | "err" | "sys";
  text: string;
}

export interface ScrapeResult {
  offers: Offer[];
  live: boolean;
  note: string;
  scrapedAt: number;
}

export type ScrapeStatus = "idle" | "running" | "done";

export type BrowseScope =
  | { type: "all" }
  | { type: "bank"; bank: string }
  | { type: "bank-card"; bank: string; card: string }
  | { type: "vendor"; vendor: string };

export const CATEGORY_LABEL: Record<Category, string> = {
  dining: "Dining",
  coffee: "Coffee",
  online: "Online",
  electronics: "Electronics",
  fashion: "Fashion",
  groceries: "Groceries",
  travel: "Travel",
  hotels: "Hotels",
  fuel: "Fuel",
  entertainment: "Cinema",
};
