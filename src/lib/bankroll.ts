// Bankroll manager — simple, transparent stake sizing.
// Three risk profiles map to sensible defaults so users don't have to reason
// about Kelly math. A single "Suggested stake" is derived from the model edge.

export type RiskProfile = "conservative" | "balanced" | "aggressive";

export type BankrollState = {
  bankroll: number;
  currency: string;
  profile: RiskProfile;
  /** Minimum model edge % required to place a bet at all. */
  minEdgePct: number;
  /** ISO date -> risked amount that day. */
  dailyRisked: Record<string, number>;
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

const KEY = "fe_bankroll_v2";

const DEFAULT_STATE: BankrollState = {
  bankroll: 5000,
  currency: "kr",
  profile: "balanced",
  minEdgePct: 3,
  dailyRisked: {},
  log: [],
};

export const PROFILES: Record<RiskProfile, { label: string; unitPct: number; maxStakePct: number; dailyRiskPct: number; kellyFraction: number; description: string }> = {
  conservative: { label: "Conservative", unitPct: 0.5, maxStakePct: 1.5, dailyRiskPct: 3,  kellyFraction: 0.15, description: "Small stakes, long-term survival." },
  balanced:     { label: "Balanced",     unitPct: 1.0, maxStakePct: 3.0, dailyRiskPct: 5,  kellyFraction: 0.25, description: "Recommended. Steady growth." },
  aggressive:   { label: "Aggressive",   unitPct: 2.0, maxStakePct: 5.0, dailyRiskPct: 10, kellyFraction: 0.40, description: "Bigger stakes, bigger swings." },
};

export function loadBankroll(): BankrollState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // migrate v1 if present
      const legacy = localStorage.getItem("fe_bankroll_v1");
      if (legacy) {
        try {
          const p = JSON.parse(legacy);
          return { ...DEFAULT_STATE, bankroll: p.bankroll ?? 5000, currency: p.currency ?? "kr", log: p.log ?? [], dailyRisked: p.dailyRisked ?? {} };
        } catch { /* ignore */ }
      }
      return { ...DEFAULT_STATE };
    }
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

/* ─── Stake sizing ─── */

export type StakeRecommendation = {
  stake: number;
  verdict: "bet" | "skip" | "wait";
  edgePct: number;
  impliedProb: number;
  bankrollFraction: number;
  expectedValue: number;
  reason: string;
};

export function recommendStake(
  state: BankrollState,
  modelProb: number,
  odds: number,
  dateISO: string = new Date().toISOString().slice(0, 10),
): StakeRecommendation {
  const p = PROFILES[state.profile];
  const implied = 1 / Math.max(1.01, odds);
  const edgePct = (modelProb - implied) * 100;
  const base = { edgePct, impliedProb: implied, bankrollFraction: 0, expectedValue: 0, stake: 0 };

  if (odds <= 1.01 || modelProb <= 0.02 || modelProb >= 0.99) {
    return { ...base, verdict: "skip", reason: "Odds or probability out of usable range." };
  }
  if (edgePct < state.minEdgePct) {
    return { ...base, verdict: "skip", reason: `No edge (need +${state.minEdgePct}%, model shows ${edgePct.toFixed(1)}%).` };
  }

  const b = odds - 1;
  const q = 1 - modelProb;
  const fullKelly = Math.max(0, (b * modelProb - q) / b);
  let fraction = fullKelly * p.kellyFraction;
  const unitFrac = p.unitPct / 100;
  const capFrac  = p.maxStakePct / 100;
  fraction = Math.min(Math.max(fraction, unitFrac * 0.25), capFrac);

  const today = state.dailyRisked[dateISO] ?? 0;
  const dailyBudget = state.bankroll * (p.dailyRiskPct / 100);
  const remaining = Math.max(0, dailyBudget - today);
  if (remaining <= 0) {
    return { ...base, verdict: "wait", reason: "Daily risk budget reached — wait for tomorrow." };
  }

  let stake = Math.min(state.bankroll * fraction, remaining);
  stake = Math.max(1, Math.round(stake / 5) * 5);
  const ev = stake * (modelProb * (odds - 1) - q);

  return {
    ...base,
    bankrollFraction: stake / state.bankroll,
    expectedValue: ev,
    stake,
    verdict: "bet",
    reason: `Edge ${edgePct.toFixed(1)}% · ${p.label} profile.`,
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
