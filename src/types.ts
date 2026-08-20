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
  id: string;
  name: string;
  kind: string;
  status: "live" | "drafting" | "queued" | "registered";
  progress: number;
  note: string;
}

/** A bank or vendor the user registers from the UI. Persisted locally. */
export interface CustomSource {
  id: string;
  kind: "bank" | "vendor";
  name: string;
  url: string;
  note?: string;
  category?: Category;
  createdAt: number;
}

export type Role = "admin" | "member";

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  createdAt: number;
}

/** Internal shape stored in localStorage (never leaves the browser). */
export interface StoredUser extends User {
  hash: string;
}

export interface LogLine {
  id: number;
  time: string;
  kind: "info" | "ok" | "warn" | "err" | "sys";
  text: string;
}

export type SourceStatus = "live" | "snapshot" | "error" | "queued";

/** Per-source outcome reported by the latest n8n run. */
export interface SourceOutcome {
  id: string;
  name: string;
  status: SourceStatus;
  count: number;
  note: string;
  at: number;
}

/** Wire format every n8n source workflow POSTs to the ingest endpoint. */
export interface FeedPayload {
  version: "offer.v1";
  generatedAt: string;
  generator: string;
  sources: SourceOutcome[];
  offers: Offer[];
}

export type FeedProvenance = "remote" | "local" | "bundled";
export type FeedStatus = "idle" | "syncing" | "done";

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
