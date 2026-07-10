// Swedish-licensed (Spelinspektionen) bookmakers used for odds tracking.
// Odds displayed in the app are derived from our own model probability +
// per-bookmaker margin/bias — labelled clearly as "signals" until a live
// odds feed is connected.

export type Bookmaker = {
  id: string;
  name: string;
  short: string;
  domain: string;         // used to fetch a favicon-quality logo
  brand: string;          // hex, for the accent pill
  /** Overround (bookmaker margin) baseline, e.g. 1.06 = 6% margin */
  margin: number;
  /** Slight bias toward home/away/draw pricing (0 = neutral, ±0.03 typical) */
  homeBias: number;
  awayBias: number;
};

export const SE_BOOKMAKERS: Bookmaker[] = [
  { id: "svenskaspel", name: "Svenska Spel Sport",  short: "Svenska Spel", domain: "svenskaspel.se",  brand: "#FFCB05", margin: 1.075, homeBias:  0.010, awayBias:  0.000 },
  { id: "atg",          name: "ATG",                short: "ATG",          domain: "atg.se",           brand: "#0055A4", margin: 1.070, homeBias:  0.000, awayBias:  0.005 },
  { id: "unibet",       name: "Unibet",             short: "Unibet",       domain: "unibet.se",        brand: "#14805E", margin: 1.055, homeBias:  0.005, awayBias:  0.010 },
  { id: "betsson",      name: "Betsson",            short: "Betsson",      domain: "betsson.com",      brand: "#F27A1A", margin: 1.060, homeBias:  0.000, awayBias:  0.000 },
  { id: "leovegas",     name: "LeoVegas Sport",     short: "LeoVegas",     domain: "leovegas.com",     brand: "#E11A26", margin: 1.062, homeBias:  0.005, awayBias: -0.005 },
  { id: "casumo",       name: "Casumo",             short: "Casumo",       domain: "casumo.com",       brand: "#8A2BE2", margin: 1.068, homeBias: -0.005, awayBias:  0.010 },
  { id: "betway",       name: "Betway",             short: "Betway",       domain: "betway.se",        brand: "#00A950", margin: 1.058, homeBias:  0.010, awayBias:  0.000 },
  { id: "mrgreen",      name: "Mr Green",           short: "Mr Green",     domain: "mrgreen.com",      brand: "#0F9D58", margin: 1.065, homeBias:  0.000, awayBias:  0.005 },
  { id: "comeon",       name: "ComeOn!",            short: "ComeOn",       domain: "comeon.com",       brand: "#F2A93B", margin: 1.070, homeBias: -0.005, awayBias:  0.010 },
  { id: "expekt",       name: "Expekt",             short: "Expekt",       domain: "expekt.com",       brand: "#009B48", margin: 1.062, homeBias:  0.005, awayBias:  0.005 },
];

export function bookmakerLogo(b: Bookmaker): string {
  // Fast, reliable, cached — same trick we use for league fallbacks.
  return `https://www.google.com/s2/favicons?domain=${b.domain}&sz=64`;
}

/* ─── odds derivation ─── */

function seededJitter(seed: string): number {
  // Deterministic tiny drift ±0.5% so two bookmakers on the same market
  // never show the exact same price.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const x = ((h >>> 0) % 1000) / 1000; // 0..1
  return (x - 0.5) * 0.01;             // ±0.005
}

/**
 * Given a fair model probability p (0..1) and a bookmaker's margin/bias,
 * return the price they would post for that outcome.
 */
export function priceFor(
  b: Bookmaker,
  fairProb: number,
  side: "home" | "draw" | "away" | "generic",
  seed: string,
): number {
  const p = Math.min(0.985, Math.max(0.015, fairProb));
  const bias = side === "home" ? b.homeBias : side === "away" ? b.awayBias : 0;
  // Overround: inflate implied prob by margin, then subtract bias in prob space
  const impliedProb = Math.min(0.99, p * b.margin - bias + seededJitter(seed + b.id));
  const odds = 1 / Math.max(0.01, impliedProb);
  // Round to 2 dp like all Swedish sites do
  return Math.round(odds * 100) / 100;
}

/** Best (highest) odds across an active bookmaker subset. */
export function bestOdds(
  bookmakers: Bookmaker[],
  fairProb: number,
  side: "home" | "draw" | "away" | "generic",
  seed: string,
): { odds: number; bookmaker: Bookmaker } | null {
  if (!bookmakers.length) return null;
  let best = { odds: 0, bookmaker: bookmakers[0] };
  for (const b of bookmakers) {
    const o = priceFor(b, fairProb, side, seed);
    if (o > best.odds) best = { odds: o, bookmaker: b };
  }
  return best;
}

/* ─── active bookmaker preference (localStorage) ─── */

const KEY = "fe_active_bookmakers_v1";

export function loadActiveBookmakerIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return SE_BOOKMAKERS.map(b => b.id);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* ignore */ }
  return SE_BOOKMAKERS.map(b => b.id);
}

export function saveActiveBookmakerIds(ids: string[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event("bookmakers-changed")); } catch { /* ignore */ }
}

export function getActiveBookmakers(): Bookmaker[] {
  const ids = new Set(loadActiveBookmakerIds());
  return SE_BOOKMAKERS.filter(b => ids.has(b.id));
}
