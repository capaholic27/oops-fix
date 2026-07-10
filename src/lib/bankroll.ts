// Bankroll manager — realistic, Kelly-based stake sizing so users protect
// capital and only push size when the model has a genuine edge.
//
// Målet: en kontrollerad spelstruktur där varje insats följer en tydlig plan
// istället för att baseras på känsla.

export type BankrollState = {
  /** Total bankroll in the user's currency (SEK by default). */
  bankroll: number;
  /** Currency label, purely cosmetic. */
  currency: string;
  /** Base unit percent per bet, e.g. 1 = 1% of bankroll. */
  unitPct: number;
  /** Hard cap on a single stake as % of bankroll, e.g. 3 = 3%. */
  maxStakePct: number;
  /** Kelly fraction, e.g. 0.25 = quarter Kelly. */
  kellyFraction: number;
  /** Max daily risk as % of bankroll, e.g. 5 = 5%. */
  dailyRiskPct: number;
  /** Minimum model edge % required to place a bet at all. */
  minEdgePct: number;
  /** ISO date -> risked amount that day. */
  dailyRisked: Record<string, number>;
  /** Simple staked/settled log for the last N bets. */
  log: BankrollLogEntry[];
};

export type BankrollLogEntry = {
  id: string;
  date: string;
  match: string;
  market: string;
  odds: number;
  stake: number;
  edgePct: number;
  result?: "win" | "loss" | "push" | "pending";
  pnl?: number;
};

const KEY = "fe_bankroll_v1";

const DEFAULT_STATE: BankrollState = {
  bankroll: 5000,
  currency: "kr",
  unitPct: 1,
  maxStakePct: 3,
  kellyFraction: 0.25,
  dailyRiskPct: 5,
  minEdgePct: 3,
  dailyRisked: {},
  log: [],
};

export function loadBankroll(): BankrollState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveBankroll(s: BankrollState): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event("bankroll-changed")); } catch { /* ignore */ }
}

/* ─── Kelly / stake sizing ─── */

export type StakeRecommendation = {
  /** Recommended stake in currency units, already rounded. */
  stake: number;
  /** Verdict: what should the user do? */
  verdict: "bet" | "skip" | "wait";
  /** Model edge percent = (modelProb - impliedProb) * 100. */
  edgePct: number;
  /** Implied probability from the bookmaker odds. */
  impliedProb: number;
  /** Raw Kelly fraction (before applying `kellyFraction`). */
  fullKelly: number;
  /** Fraction of bankroll (0..1) after clamps and daily cap. */
  bankrollFraction: number;
  /** Expected value in currency for the recommended stake. */
  expectedValue: number;
  /** Human-readable reason label. */
  reason: string;
};

/**
 * Recommend a stake based on:
 *   – fractional Kelly (default 0.25×)
 *   – capped by unit and max-stake percent
 *   – capped by remaining daily risk budget
 *   – vetoed entirely if edge < minEdgePct or odds ≤ 1.01
 */
export function recommendStake(
  state: BankrollState,
  modelProb: number,          // 0..1
  odds: number,               // decimal e.g. 2.10
  dateISO: string = new Date().toISOString().slice(0, 10),
): StakeRecommendation {
  const implied = 1 / Math.max(1.01, odds);
  const edgePct = (modelProb - implied) * 100;

  const base = {
    edgePct,
    impliedProb: implied,
    fullKelly: 0,
    bankrollFraction: 0,
    expectedValue: 0,
    stake: 0,
  };

  if (odds <= 1.01 || modelProb <= 0.02 || modelProb >= 0.99) {
    return { ...base, verdict: "skip", reason: "Odds/probability out of usable range" };
  }
  if (edgePct < state.minEdgePct) {
    return { ...base, verdict: "skip", reason: `No edge (need +${state.minEdgePct}%, model ${edgePct.toFixed(1)}%)` };
  }

  // Kelly: f* = (bp - q) / b   where b = odds-1, p = prob, q = 1-p
  const b = odds - 1;
  const p = modelProb;
  const q = 1 - p;
  const fullKelly = Math.max(0, (b * p - q) / b);
  let fraction = fullKelly * state.kellyFraction;

  // Clamp by unit and hard cap
  const unitFrac = state.unitPct / 100;
  const capFrac  = state.maxStakePct / 100;
  fraction = Math.min(fraction, capFrac);
  // Never smaller than a fifth of the unit if we decided to bet — keeps
  // micro-edges from generating spammy 0.02 SEK stakes.
  fraction = Math.max(fraction, unitFrac * 0.2);
  fraction = Math.min(fraction, capFrac);

  // Daily risk cap
  const alreadyRisked = state.dailyRisked[dateISO] ?? 0;
  const dailyBudget   = state.bankroll * (state.dailyRiskPct / 100);
  const remaining     = Math.max(0, dailyBudget - alreadyRisked);
  if (remaining <= 0) {
    return { ...base, fullKelly, verdict: "wait", reason: "Daily risk budget reached — wait for tomorrow" };
  }

  let stake = Math.min(state.bankroll * fraction, remaining);
  // Round to nearest 5 units for realistic ticket sizes
  stake = Math.max(1, Math.round(stake / 5) * 5);

  const ev = stake * (p * (odds - 1) - q);

  return {
    ...base,
    fullKelly,
    bankrollFraction: stake / state.bankroll,
    expectedValue: ev,
    stake,
    verdict: "bet",
    reason: `Edge ${edgePct.toFixed(1)}% · Kelly ${(fullKelly * 100).toFixed(1)}% · sized at ${state.kellyFraction}×`,
  };
}

/* ─── Log helpers ─── */

export function logBet(state: BankrollState, entry: Omit<BankrollLogEntry, "id" | "date" | "result">): BankrollState {
  const today = new Date().toISOString().slice(0, 10);
  const next: BankrollState = {
    ...state,
    dailyRisked: { ...state.dailyRisked, [today]: (state.dailyRisked[today] ?? 0) + entry.stake },
    log: [
      { id: crypto.randomUUID(), date: new Date().toISOString(), result: "pending" as const, ...entry },
      ...state.log,
    ].slice(0, 100),
  };
  saveBankroll(next);
  return next;
}

export function settleBet(state: BankrollState, id: string, result: "win" | "loss" | "push"): BankrollState {
  const log = state.log.map(l => {
    if (l.id !== id || l.result !== "pending") return l;
    const pnl = result === "win" ? l.stake * (l.odds - 1) : result === "loss" ? -l.stake : 0;
    return { ...l, result, pnl };
  });
  const settled = log.find(l => l.id === id);
  const bankroll = settled?.pnl !== undefined ? state.bankroll + settled.pnl : state.bankroll;
  const next = { ...state, log, bankroll };
  saveBankroll(next);
  return next;
}
