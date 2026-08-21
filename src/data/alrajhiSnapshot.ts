import type { Offer } from "../types";
import { daysFromNow, minutesAgo } from "../lib/format";

const IMG = {
  dining:
    "https://image.qwenlm.ai/generated-images/886f1313-1141-4360-9a64-49890c8616b1/_result.png",
  coffee:
    "https://image.qwenlm.ai/generated-images/5f74c6ab-e3cd-426c-b353-2fad2e10eea4/_result.png",
  online:
    "https://image.qwenlm.ai/generated-images/3bba7d71-ddb7-4b19-ab2c-290cba416e83/_result.png",
  electronics:
    "https://image.qwenlm.ai/generated-images/b234c9bf-74b2-4f4e-9c88-280e71fea217/_result.png",
  fashion:
    "https://image.qwenlm.ai/generated-images/4ee02960-1b3d-462f-a35a-a7e7d3760660/_result.png",
  travel:
    "https://image.qwenlm.ai/generated-images/27d51f9e-4cb8-4c9e-90b6-d3c17c4dc2c5/_result.png",
  hotels:
    "https://image.qwenlm.ai/generated-images/398a1047-c78e-42e6-a263-317b5558da91/_result.png",
  fuel: "https://image.qwenlm.ai/generated-images/543938cd-51d1-4098-97bc-f2c269e5a7fa/_result.png",
  cinema:
    "https://image.qwenlm.ai/generated-images/63b7bbd4-5a7b-4ae4-bf0b-4d60f55edd59/_result.png",
};

export const SNAPSHOT_TAKEN = minutesAgo(47);

const LINK =
  "https://www.alrajhibank.com.sa/en/personal/cards/credit-cards/card-offers";

const BANK = "Al Rajhi Bank";

/**
 * Bundled seed payload — a frozen copy of the Al Rajhi card-offers page so
 * the board is never empty before the first n8n sync lands. `expiresAt` is
 * stored relative to "now" so countdowns stay meaningful between visits.
 */
export function alrajhiSnapshot(): Offer[] {
  return [
    {
      id: "arj-01",
      merchant: "The Chefz",
      headline: "20% off fine-dining orders for premium card holders",
      discountLabel: "−20%",
      value: 20,
      kind: "percent",
      category: "dining",
      image: IMG.dining,
      cards: ["Visa Infinite", "World Elite Mastercard"],
      code: "CHEFZ20",
      link: LINK,
      expiresAt: daysFromNow(5),
      bank: BANK,
      card: "Visa Infinite",
      terms: [
        "Valid on the The Chefz app and website.",
        "Minimum order SAR 150 · maximum discount SAR 200.",
        "Cannot be combined with other promo codes.",
      ],
    },
    {
      id: "arj-02",
      merchant: "Barn's Coffee",
      headline: "Buy one get one free on all signature drinks, every Friday",
      discountLabel: "1+1 FREE",
      value: 50,
      kind: "bogo",
      category: "coffee",
      image: IMG.coffee,
      cards: ["All Al Rajhi credit cards"],
      link: LINK,
      expiresAt: daysFromNow(30),
      bank: BANK,
      card: "Classic Visa",
      terms: [
        "Fridays only, in-branch purchases.",
        "Free item must be of equal or lesser value.",
      ],
    },
    {
      id: "arj-03",
      merchant: "Amazon.sa",
      headline: "15% off first purchase with an Al Rajhi card",
      discountLabel: "−15%",
      value: 15,
      kind: "percent",
      category: "online",
      image: IMG.online,
      cards: ["All Al Rajhi credit cards"],
      code: "ARJ15",
      link: LINK,
      expiresAt: daysFromNow(12),
      bank: BANK,
      card: "Titanium Plus",
      terms: [
        "First order only · maximum discount SAR 100.",
        "Excludes digital goods and marketplace sellers outside KSA.",
      ],
    },
    {
      id: "arj-04",
      merchant: "Extra",
      headline: "0% installments for 12 months on electronics above SAR 1,000",
      discountLabel: "0% ×12",
      value: 12,
      kind: "installments",
      category: "electronics",
      image: IMG.electronics,
      cards: ["Signature Visa", "Titanium Plus"],
      link: LINK,
      expiresAt: daysFromNow(45),
      bank: BANK,
      card: "Signature Visa",
      terms: [
        "In-store and online · minimum transaction SAR 1,000.",
        "Early settlement may incur a fee per bank schedule.",
      ],
    },
    {
      id: "arj-05",
      merchant: "Namshi",
      headline: "25% off fashion week for Signature and Infinite holders",
      discountLabel: "−25%",
      value: 25,
      kind: "percent",
      category: "fashion",
      image: IMG.fashion,
      cards: ["Visa Infinite", "Signature Visa"],
      code: "NAMSHI25",
      link: LINK,
      expiresAt: daysFromNow(3),
      bank: BANK,
      card: "Signature Visa",
      terms: ["Maximum discount SAR 250 per customer.", "Sale items excluded."],
    },
    {
      id: "arj-06",
      merchant: "Danube",
      headline: "5% cashback on groceries, capped at SAR 75 per month",
      discountLabel: "5% BACK",
      value: 5,
      kind: "cashback",
      category: "groceries",
      image: IMG.online,
      cards: ["All Al Rajhi credit cards"],
      link: LINK,
      expiresAt: null,
      bank: BANK,
      card: "Classic Visa",
      terms: [
        "Cashback posts within 30 days of statement close.",
        "Danube app and physical branches both qualify.",
      ],
    },
    {
      id: "arj-07",
      merchant: "Emirates",
      headline: "10% off economy fares when booking with Visa Infinite",
      discountLabel: "−10%",
      value: 10,
      kind: "percent",
      category: "travel",
      image: IMG.travel,
      cards: ["Visa Infinite"],
      code: "EMIRATES10",
      link: LINK,
      expiresAt: daysFromNow(21),
      bank: BANK,
      card: "Visa Infinite",
      terms: [
        "Economy fares only · blackout dates apply.",
        "Book via the Emirates website, paid in full with the card.",
      ],
    },
    {
      id: "arj-08",
      merchant: "Rotana",
      headline: "Second night free at participating Rotana hotels",
      discountLabel: "1+1 NIGHT",
      value: 50,
      kind: "bogo",
      category: "hotels",
      image: IMG.hotels,
      cards: ["World Elite Mastercard", "Visa Infinite"],
      link: LINK,
      expiresAt: daysFromNow(60),
      bank: BANK,
      card: "World Elite Mastercard",
      terms: [
        "Subject to availability · prepaid, non-refundable bookings.",
        "Maximum one free night per stay.",
      ],
    },
    {
      id: "arj-09",
      merchant: "Petromin",
      headline: "SAR 20 off fuel & oil change bundles every month",
      discountLabel: "−SAR 20",
      value: 8,
      kind: "cashback",
      category: "fuel",
      image: IMG.fuel,
      cards: ["All Al Rajhi credit cards"],
      link: LINK,
      expiresAt: daysFromNow(90),
      bank: BANK,
      card: "Titanium Plus",
      terms: ["One redemption per card per month.", "Express branches only."],
    },
    {
      id: "arj-10",
      merchant: "VOX Cinemas",
      headline: "Buy one ticket get one free on Tuesdays",
      discountLabel: "1+1 FREE",
      value: 50,
      kind: "bogo",
      category: "entertainment",
      image: IMG.cinema,
      cards: ["All Al Rajhi credit cards"],
      link: LINK,
      expiresAt: daysFromNow(14),
      bank: BANK,
      card: "Classic Visa",
      terms: ["Standard 2D screenings only.", "Not valid on premieres or MAX screens."],
    },
  ];
}
