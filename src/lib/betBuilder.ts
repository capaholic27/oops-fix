/**
 * Frontend bet builder + edge picks — uses the app's own Dixon-Coles prediction
 * engine and market catalogue to build diverse, well-reasoned bet slips.
 * No AI gateway required; all probabilities come from the in-app model.
 */
import {
  predictMatch,
  computeLeagueAvgGoals,
  type TeamInput,
  type PredictionResult,
} from "@/lib/dixonColes";
import {
  buildPredictionMarkets,
  PREDICTION_MARKETS,
  type MarketInputs,
  type MarketOutcome,
  type PredictionMarket,
} from "@/lib/predictionMarkets";
import {
  getTeamMatchView,
  aggregateStats,
  filterRecentViews,
  type TeamMatchView,
  type Match,
} from "@/lib/matchStats";
import type { Fixture } from "@/hooks/useMatches";

// ── Types matching EdgePage ──
export type BetLeg = {
  match: string;
  market: string;
  odds: number;
  confidence: string;
  reason: string;
  matchDate?: string;
  matchTime?: string;
  league?: string;
  injuryImpact?: string | null;
};
export type BetSlip = {
  slip: BetLeg[];
  combinedOdds: number;
  riskAssessment: string;
  expectedValue: string;
  advice: string;
  stake?: number;
  expectedPayout?: number;
  expectedProfit?: number;
  desiredWin?: number;
};

export type Pick = {
  match: string;
  prediction: string;
  confidence: number;
  market: string;
  reasoning: string;
  edge?: string;
  matchDate?: string;
};
export type ValueAlert = {
  match: string;
  alert: string;
  modelProb: number;
  impliedProb?: number;
  reasoning: string;
  matchDate?: string;
};
export type UndervaluedPick = {
  match: string;
  market: string;
  modelProb: number;
  reasoning: string;
  matchDate?: string;
};
export type EdgeData = {
  bestPicks: Pick[];
  highConfidence: Pick[];
  valueAlerts: ValueAlert[];
  undervalued: UndervaluedPick[];
  summary: string;
};

// ── Helpers ──

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

function oddsFromProb(p: number): number {
  const margin = 0.06;
  const fair = Math.max(1.02, 1 / Math.max(p / 100, 0.02));
  return Math.round((fair / (1 + margin)) * 100) / 100;
}

function confidenceLabel(prob: number): string {
  if (prob >= 70) return "high";
  if (prob >= 55) return "medium";
  return "low";
}

/** Run the prediction pipeline for a single fixture. */
function predictFixture(
  fixture: Fixture,
  allMatches: Match[],
): { prediction: PredictionResult; markets: PredictionMarket[] } | null {
  const homeViews = filterRecentViews(
    allMatches.map((m) => getTeamMatchView(m, fixture.home_team)).filter((v): v is TeamMatchView => v !== null),
  ).slice(-10);
  const awayViews = filterRecentViews(
    allMatches.map((m) => getTeamMatchView(m, fixture.away_team)).filter((v): v is TeamMatchView => v !== null),
  ).slice(-10);

  if (homeViews.length < 3 || awayViews.length < 3) return null;

  const statsHome = aggregateStats(homeViews);
  const statsAway = aggregateStats(awayViews);

  const recent = (vs: TeamMatchView[]) => {
    const last5 = vs.slice(-5);
    return {
      scored: last5.reduce((s, v) => s + v.goalsFor, 0),
      conceded: last5.reduce((s, v) => s + v.goalsAgainst, 0),
      n: last5.length,
    };
  };

  const input = (stats: typeof statsHome, r: ReturnType<typeof recent>): TeamInput => ({
    goalsScored: stats.goalsFor,
    goalsConceded: stats.goalsAgainst,
    matchesPlayed: stats.matchesPlayed,
    recentGoalsScored: r.scored,
    recentGoalsConceded: r.conceded,
    recentMatches: r.n,
  });

  const pred = predictMatch(
    input(statsHome, recent(homeViews)),
    input(statsAway, recent(awayViews)),
    computeLeagueAvgGoals(allMatches),
  );

  const markets = buildPredictionMarkets({
    prediction: pred,
    home: fixture.home_team,
    away: fixture.away_team,
    statsHome,
    statsAway,
    homeViews,
    awayViews,
  }).filter((m) => m.outcomes.length > 0);

  return { prediction: pred, markets };
}

/** A candidate leg from the prediction markets. */
type Candidate = {
  fixture: Fixture;
  marketId: string;
  marketLabel: string;
  market: PredictionMarket;
  outcome: MarketOutcome;
  odds: number;
  prob: number;
};

/** Collect all candidate legs from a fixture's prediction markets. */
function collectCandidates(
  fixture: Fixture,
  predResult: { prediction: PredictionResult; markets: PredictionMarket[] },
  enabledMarketLabels: string[],
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const market of predResult.markets) {
    // Filter by enabled markets
    if (enabledMarketLabels.length > 0) {
      const enabled = enabledMarketLabels.some(
        (em) => market.label.toLowerCase().includes(em.toLowerCase().split("(")[0].trim()) ||
                em.toLowerCase().includes(market.label.toLowerCase().split("(")[0].trim()),
      );
      if (!enabled) continue;
    }
    for (const outcome of market.outcomes) {
      if (outcome.probability < 30) continue; // skip very low probability outcomes
      candidates.push({
        fixture,
        marketId: market.id,
        marketLabel: market.label,
        market,
        outcome,
        odds: oddsFromProb(outcome.probability),
        prob: outcome.probability,
      });
    }
  }
  return candidates;
}

/** Build a rich reason string from market data. */
function buildReason(market: PredictionMarket, outcome: MarketOutcome, fixture: Fixture): string {
  const parts: string[] = [];
  // Evidence from the model
  if (outcome.evidence) parts.push(outcome.evidence);
  // Why this market is relevant
  if (market.why && !market.why.startsWith("Recorded statistics are missing")) parts.push(market.why);
  // Tip
  if (market.tip) parts.push(market.tip);
  return parts.join(" · ");
}

/** Filter fixtures by date and league. */
function filterFixtures(fixtures: Fixture[], targetDate?: string, leagueFilter?: string): Fixture[] {
  const todayStr = today();
  let out = fixtures.filter((f) => f.match_date >= todayStr);

  if (targetDate) {
    out = out.filter((f) => f.match_date === targetDate);
  } else {
    const weekEnd = addDays(7);
    out = out.filter((f) => f.match_date <= weekEnd);
  }

  if (leagueFilter) {
    const lf = leagueFilter.toLowerCase();
    out = out.filter((f) => f.league_name && f.league_name.toLowerCase().includes(lf));
  }

  return out;
}

// ── Build a bet slip ──

export function buildBetSlip(
  fixtures: Fixture[],
  allMatches: Match[],
  params: {
    targetOdds: number;
    riskLevel: "low" | "medium" | "high";
    enabledMarkets: string[];
    leagueFilter?: string;
    maxLegs?: number;
    targetDate?: string;
    stakeAmount?: number;
    desiredWinAmount?: number;
  },
): BetSlip {
  const { targetOdds, riskLevel, enabledMarkets, leagueFilter, maxLegs, targetDate, stakeAmount, desiredWinAmount } = params;

  let filtered = filterFixtures(fixtures, targetDate, leagueFilter);

  // Fallback: drop league filter
  if (filtered.length === 0 && leagueFilter) {
    filtered = filterFixtures(fixtures, targetDate);
  }
  // Fallback: widen to 14 days
  if (filtered.length === 0 && targetDate) {
    const weekEnd = addDays(14);
    filtered = fixtures.filter((f) => f.match_date >= today() && f.match_date <= weekEnd);
    if (leagueFilter) {
      const lf = leagueFilter.toLowerCase();
      filtered = filtered.filter((f) => f.league_name && f.league_name.toLowerCase().includes(lf));
    }
  }

  if (filtered.length === 0) {
    return {
      slip: [],
      combinedOdds: 1,
      riskAssessment: "No upcoming fixtures found for the selected criteria.",
      expectedValue: "N/A",
      advice: "Try a different date or remove the league filter.",
    };
  }

  // Generate all candidates across all fixtures
  const allCandidates: Candidate[] = [];
  for (const fx of filtered.slice(0, 60)) {
    const pred = predictFixture(fx, allMatches);
    if (!pred) continue;
    const cands = collectCandidates(fx, pred, enabledMarkets);
    allCandidates.push(...cands);
  }

  if (allCandidates.length === 0) {
    return {
      slip: [],
      combinedOdds: 1,
      riskAssessment: "Unable to generate picks — insufficient historical data for these teams.",
      expectedValue: "N/A",
      advice: "Try enabling more market types or selecting a different date.",
    };
  }

  // Score and sort candidates based on risk level
  const scored = allCandidates.map((c) => ({
    ...c,
    score: riskLevel === "low"
      ? c.prob + (c.market.confidence === "Strong" ? 10 : c.market.confidence === "Moderate" ? 5 : 0)
      : riskLevel === "high"
        ? (100 - c.prob) * 0.3 + c.odds * 10
        : c.prob * 0.7 + c.odds * 3,
  }));

  scored.sort((a, b) => b.score - a.score);

  // Select legs with market diversity
  const slip: BetLeg[] = [];
  let combinedOdds = 1;
  const usedMatches = new Set<string>();
  const usedMarketCategories = new Set<string>();
  const usedMarketIds = new Set<string>();

  // Determine leg count
  let legCount = maxLegs;
  if (!legCount) {
    const avgOdds = scored.slice(0, 10).reduce((a, c) => a + c.odds, 0) / Math.min(10, scored.length);
    legCount = Math.max(1, Math.min(8, Math.round(Math.log(targetOdds) / Math.log(avgOdds))));
  }

  // First pass: diverse market families
  for (const c of scored) {
    if (slip.length >= legCount) break;
    if (usedMatches.has(c.fixture.home_team + c.fixture.away_team)) continue;
    if (usedMarketCategories.has(c.market.category)) continue;
    if (usedMarketIds.has(c.marketId)) continue;

    slip.push(candidateToLeg(c));
    combinedOdds *= c.odds;
    usedMatches.add(c.fixture.home_team + c.fixture.away_team);
    usedMarketCategories.add(c.market.category);
    usedMarketIds.add(c.marketId);
  }

  const maxTotalLegs = legCount + 2;

  // Second pass: fill remaining legs, allow same category but not same market
  for (const c of scored) {
    if (combinedOdds >= targetOdds) break;
    if (slip.length >= maxTotalLegs) break;
    if (usedMatches.has(c.fixture.home_team + c.fixture.away_team)) continue;
    if (usedMarketIds.has(c.marketId)) continue;

    slip.push(candidateToLeg(c));
    combinedOdds *= c.odds;
    usedMatches.add(c.fixture.home_team + c.fixture.away_team);
    usedMarketIds.add(c.marketId);
  }

  // Third pass: if still below target, add more legs
  for (const c of scored) {
    if (combinedOdds >= targetOdds) break;
    if (slip.length >= maxTotalLegs) break;
    if (usedMatches.has(c.fixture.home_team + c.fixture.away_team)) continue;
    if (usedMarketIds.has(c.marketId)) continue;

    slip.push(candidateToLeg(c));
    combinedOdds *= c.odds;
    usedMatches.add(c.fixture.home_team + c.fixture.away_team);
    usedMarketIds.add(c.marketId);
  }

  combinedOdds = Math.round(combinedOdds * 100) / 100;

  const result: BetSlip = {
    slip,
    combinedOdds,
    riskAssessment: getRiskAssessment(riskLevel, slip.length, combinedOdds),
    expectedValue: getExpectedValue(slip, combinedOdds),
    advice: getAdvice(riskLevel, slip.length, combinedOdds, targetOdds, leagueFilter),
  };

  if (stakeAmount && desiredWinAmount) {
    result.stake = Number(stakeAmount);
    result.expectedPayout = Math.round(Number(stakeAmount) * combinedOdds);
    result.expectedProfit = Math.round(Number(stakeAmount) * (combinedOdds - 1));
    result.desiredWin = Number(desiredWinAmount);
  }

  return result;
}

function candidateToLeg(c: Candidate): BetLeg {
  const conf = confidenceLabel(c.prob);
  return {
    match: `${c.fixture.home_team} vs ${c.fixture.away_team}`,
    market: `${c.marketLabel}: ${c.outcome.label}`,
    odds: c.odds,
    confidence: conf,
    reason: buildReason(c.market, c.outcome, c.fixture),
    matchDate: c.fixture.match_date,
    matchTime: c.fixture.match_time || "",
    league: c.fixture.league_name,
    injuryImpact: null,
  };
}

function getRiskAssessment(risk: string, legs: number, odds: number): string {
  if (risk === "low") return `Low-risk ${legs}-leg slip at ${odds.toFixed(2)}x — focused on high-probability outcomes from the Dixon-Coles model.`;
  if (risk === "high") return `High-risk ${legs}-leg accumulator at ${odds.toFixed(2)}x — each leg must win for a return.`;
  return `Balanced ${legs}-leg slip at ${odds.toFixed(2)}x — diverse markets across different categories.`;
}

function getExpectedValue(slip: BetLeg[], odds: number): string {
  const avgProb = slip.reduce((a, s) => a + (1 / s.odds), 0) / slip.length;
  const ev = (avgProb * (odds - 1)) - (1 - avgProb);
  return `${(ev * 100).toFixed(1)}% implied edge (avg ${(avgProb * 100).toFixed(0)}% leg probability)`;
}

function getAdvice(risk: string, legs: number, odds: number, target: number, league?: string): string {
  if (odds < target * 0.7) {
    return league
      ? `${league} may not have enough fixtures — try adding more leagues or lowering target odds.`
      : "Not enough high-value picks to hit your target. Try widening the date range or adding leagues.";
  }
  if (odds > target * 1.5) {
    return "Combined odds exceed your target — consider reducing legs for a safer slip.";
  }
  return `Slip built at ${odds.toFixed(2)}x with ${legs} diverse market${legs > 1 ? "s" : ""} — close to your ${target.toFixed(2)}x target.`;
}

// ── Swap a single leg ──

export function swapLeg(
  fixtures: Fixture[],
  allMatches: Match[],
  params: {
    rejected: BetLeg;
    existingLegs: BetLeg[];
    riskLevel: "low" | "medium" | "high";
    enabledMarkets: string[];
    leagueFilter?: string;
    targetDate?: string;
  },
): BetLeg | null {
  const { rejected, existingLegs, riskLevel, enabledMarkets, leagueFilter, targetDate } = params;

  let filtered = filterFixtures(fixtures, targetDate, leagueFilter);
  if (filtered.length === 0 && leagueFilter) {
    filtered = filterFixtures(fixtures, targetDate);
  }

  const usedMatches = new Set(existingLegs.map((l) => l.match));
  const usedMarketIds = new Set(existingLegs.map((l) => l.market.split(":")[0].trim().toLowerCase()));

  const allCandidates: Candidate[] = [];
  for (const fx of filtered.slice(0, 60)) {
    // Skip the rejected match
    if (usedMatches.has(`${fx.home_team} vs ${fx.away_team}`)) continue;
    const pred = predictFixture(fx, allMatches);
    if (!pred) continue;
    const cands = collectCandidates(fx, pred, enabledMarkets);
    allCandidates.push(...cands);
  }

  // Prefer different market family from the rejected one
  const rejectedCategory = PREDICTION_MARKETS.find(
    (m) => rejected.market.toLowerCase().includes(m.label.toLowerCase().split("(")[0].trim()),
  )?.category;

  const scored = allCandidates
    .filter((c) => !usedMarketIds.has(c.marketLabel.toLowerCase().split("(")[0].trim()))
    .map((c) => ({
      ...c,
      score: c.prob + (c.market.category !== rejectedCategory ? 10 : 0),
    }))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;
  return candidateToLeg(scored[0]);
}

// ── Build edge picks ──

export function buildEdgePicks(
  fixtures: Fixture[],
  allMatches: Match[],
): EdgeData {
  const todayStr = today();
  const tomorrowStr = addDays(1);

  const todayFixtures = fixtures.filter(
    (f) => f.match_date >= todayStr && f.match_date <= tomorrowStr,
  );

  if (todayFixtures.length === 0) {
    return {
      bestPicks: [],
      highConfidence: [],
      valueAlerts: [],
      undervalued: [],
      summary: "No matches scheduled today — fixtures syncing. Check back shortly.",
    };
  }

  const bestPicks: Pick[] = [];
  const highConfidence: Pick[] = [];
  const valueAlerts: ValueAlert[] = [];
  const undervalued: UndervaluedPick[] = [];

  for (const fx of todayFixtures.slice(0, 50)) {
    const pred = predictFixture(fx, allMatches);
    if (!pred) continue;

    const matchStr = `${fx.home_team} vs ${fx.away_team}`;
    const p = pred.prediction;

    // Best picks: highest probability outcomes across markets
    const topOutcomes: { market: string; label: string; prob: number; evidence: string; market_why: string }[] = [];
    for (const market of pred.markets) {
      for (const outcome of market.outcomes) {
        if (outcome.probability >= 60) {
          topOutcomes.push({
            market: market.label,
            label: outcome.label,
            prob: outcome.probability,
            evidence: outcome.evidence,
            market_why: market.why,
          });
        }
      }
    }
    topOutcomes.sort((a, b) => b.prob - a.prob);

    if (topOutcomes.length > 0) {
      const top = topOutcomes[0];
      bestPicks.push({
        match: matchStr,
        matchDate: fx.match_date,
        prediction: top.label,
        confidence: Math.round(top.prob),
        market: top.market,
        reasoning: top.evidence + (top.market_why ? ` · ${top.market_why}` : ""),
        edge: `Model ${Math.round(top.prob)}% → odds ${oddsFromProb(top.prob).toFixed(2)}`,
      });
    }

    // High confidence: >70% probability
    for (const o of topOutcomes.filter((o) => o.prob >= 70)) {
      highConfidence.push({
        match: matchStr,
        matchDate: fx.match_date,
        prediction: o.label,
        confidence: Math.round(o.prob),
        market: o.market,
        reasoning: o.evidence + (o.market_why ? ` · ${o.market_why}` : ""),
        edge: `Model ${Math.round(o.prob)}%`,
      });
    }

    // Value alerts: model probability significantly higher than implied
    for (const market of pred.markets) {
      for (const outcome of market.outcomes) {
        if (outcome.probability >= 55 && outcome.probability <= 70) {
          const implied = 1 / oddsFromProb(outcome.probability) * 100;
          if (outcome.probability - implied > 5) {
            valueAlerts.push({
              match: matchStr,
              matchDate: fx.match_date,
              alert: `${market.label}: ${outcome.label} underpriced`,
              modelProb: Math.round(outcome.probability),
              impliedProb: Math.round(implied),
              reasoning: outcome.evidence + ` · Model ${Math.round(outcome.probability)}% vs market ~${Math.round(implied)}%`,
            });
          }
        }
      }
    }

    // Undervalued: strong model backing in secondary markets
    for (const market of pred.markets) {
      if (["Result", "Goals"].includes(market.category)) continue; // focus on non-obvious markets
      for (const outcome of market.outcomes) {
        if (outcome.probability >= 60) {
          undervalued.push({
            match: matchStr,
            matchDate: fx.match_date,
            market: `${market.label}: ${outcome.label}`,
            modelProb: Math.round(outcome.probability),
            reasoning: outcome.evidence + ` · ${market.why}`,
          });
        }
      }
    }
  }

  // Sort and limit
  const sortByConf = (a: Pick, b: Pick) => b.confidence - a.confidence;
  bestPicks.sort(sortByConf);
  highConfidence.sort(sortByConf);
  valueAlerts.sort((a, b) => b.modelProb - a.modelProb);
  undervalued.sort((a, b) => b.modelProb - a.modelProb);

  const summary = bestPicks.length > 0
    ? `${bestPicks.length} top picks found across ${todayFixtures.length} fixtures today — powered by Dixon-Coles xG model.`
    : `${todayFixtures.length} fixtures today — generating edge analysis.`;

  return {
    bestPicks: bestPicks.slice(0, 4),
    highConfidence: highConfidence.slice(0, 4),
    valueAlerts: valueAlerts.slice(0, 4),
    undervalued: undervalued.slice(0, 4),
    summary,
  };
}
