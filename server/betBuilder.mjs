// Deterministic bet-builder + edge-picks logic that uses the in-memory
// Fotmob data (fixtures + historical matches) — no AI gateway required.

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Compute last-N stats for a team from the matches array. */
function teamStats(matches, team) {
  const rows = matches
    .filter((m) => m.home_team === team || m.away_team === team)
    .sort((a, b) => (b.match_date || "").localeCompare(a.match_date || ""))
    .slice(0, 8);
  let gf = 0, ga = 0, btts = 0, over25 = 0, w = 0, d = 0, l = 0;
  for (const m of rows) {
    const isHome = m.home_team === team;
    const our = isHome ? m.ft_home_goals : m.ft_away_goals;
    const opp = isHome ? m.ft_away_goals : m.ft_home_goals;
    gf += our; ga += opp;
    if (our > 0 && opp > 0) btts++;
    if (our + opp > 2) over25++;
    if (our > opp) w++;
    else if (our < opp) l++;
    else d++;
  }
  const n = rows.length || 1;
  return {
    games: rows.length,
    avgGf: gf / n,
    avgGa: ga / n,
    bttsRate: btts / n,
    over25Rate: over25 / n,
    form: { w, d, l },
  };
}

/** Calibrate odds from a probability (0–1) using a bookmaker margin. */
function oddsFromProb(p) {
  const margin = 0.06; // ~6% overround
  const fair = Math.max(1.02, 1 / Math.max(p, 0.02));
  return Math.round((fair / (1 + margin)) * 100) / 100;
}

/** Generate a pick for a single fixture based on team stats and enabled markets. */
function generatePick(fixture, matches, enabledMarketLabels, riskLevel) {
  const home = fixture.home_team;
  const away = fixture.away_team;
  const homeS = teamStats(matches, home);
  const awayS = teamStats(matches, away);
  const expGoals = (homeS.avgGf + awayS.avgGf + homeS.avgGa + awayS.avgGa) / 2;
  const bttsProb = ((homeS.bttsRate + awayS.bttsRate) / 2);
  const over25Prob = ((homeS.over25Rate + awayS.over25Rate) / 2);

  // Home win probability from form + goal difference
  const homeStrength = homeS.avgGf - awayS.avgGa;
  const awayStrength = awayS.avgGf - homeS.avgGa;
  const homeWinProb = Math.max(0.15, Math.min(0.85, 0.5 + homeStrength * 0.08 + (homeS.form.w - homeS.form.l) * 0.03));
  const awayWinProb = Math.max(0.1, Math.min(0.7, 0.5 + awayStrength * 0.08 + (awayS.form.w - awayS.form.l) * 0.03));

  const has = (label) => enabledMarketLabels.some((em) => em.toLowerCase().includes(label.toLowerCase()));

  // Score candidate markets
  const candidates = [];

  if (has("Over/Under Goals") || has("Goals")) {
    if (expGoals > 2.5) {
      candidates.push({
        market: "Over 2.5 Goals",
        prob: Math.max(0.45, Math.min(0.78, over25Prob)),
        reason: `${home} avg ${(homeS.avgGf + homeS.avgGa).toFixed(1)} goals/game, ${away} avg ${(awayS.avgGf + awayS.avgGa).toFixed(1)} — combined ${(expGoals).toFixed(1)} xG suggests over 2.5.`,
        confidence: over25Prob > 0.6 ? "high" : "medium",
      });
    } else {
      candidates.push({
        market: "Under 2.5 Goals",
        prob: Math.max(0.45, Math.min(0.75, 1 - over25Prob)),
        reason: `${home} avg ${(homeS.avgGf + homeS.avgGa).toFixed(1)} goals/game, ${away} avg ${(awayS.avgGf + awayS.avgGa).toFixed(1)} — low-scoring profile favours under 2.5.`,
        confidence: over25Prob < 0.4 ? "high" : "medium",
      });
    }
  }

  if (has("BTTS") || has("Both Teams")) {
    candidates.push({
      market: bttsProb > 0.5 ? "BTTS Yes" : "BTTS No",
      prob: Math.max(0.45, Math.min(0.72, bttsProb > 0.5 ? bttsProb : 1 - bttsProb)),
      reason: `BTTS hit rate: ${home} ${(homeS.bttsRate * 100).toFixed(0)}%, ${away} ${(awayS.bttsRate * 100).toFixed(0)}% over last 8.`,
      confidence: Math.abs(bttsProb - 0.5) > 0.2 ? "high" : "medium",
    });
  }

  if (has("1X2") || has("Home Win") || has("Result")) {
    if (homeWinProb > awayWinProb) {
      candidates.push({
        market: "Home Win",
        prob: homeWinProb,
        reason: `${home} form ${homeS.form.w}W-${homeS.form.d}D-${homeS.form.l}L, scoring ${(homeS.avgGf).toFixed(1)} goals/game at home.`,
        confidence: homeWinProb > 0.6 ? "high" : "medium",
      });
    } else {
      candidates.push({
        market: "Away Win",
        prob: awayWinProb,
        reason: `${away} form ${awayS.form.w}W-${awayS.form.d}D-${awayS.form.l}L, scoring ${(awayS.avgGf).toFixed(1)} goals/game away.`,
        confidence: awayWinProb > 0.6 ? "high" : "medium",
      });
    }
  }

  if (has("Double Chance")) {
    const dcProb = Math.max(0.6, Math.min(0.9, homeWinProb + (1 - homeWinProb - awayWinProb) * 0.5));
    candidates.push({
      market: homeWinProb > awayWinProb ? "Double Chance 1X" : "Double Chance X2",
      prob: dcProb,
      reason: `Double chance covers draw — safe pick given ${home} ${homeS.form.w}W in last ${homeS.games}.`,
      confidence: "high",
    });
  }

  // Filter to only candidates whose market label matches enabled markets
  const valid = candidates.filter((c) => {
    return enabledMarketLabels.length === 0 ||
      enabledMarketLabels.some((em) => {
        const ml = em.toLowerCase();
        const cl = c.market.toLowerCase();
        return cl.includes(ml.split("(")[0].trim()) || ml.includes(cl.split(" ")[0].trim());
      });
  });

  // Pick the best candidate by risk preference
  const pool = valid.length > 0 ? valid : candidates;
  if (pool.length === 0) return null;

  let pick;
  if (riskLevel === "low") {
    // Highest probability = safest
    pick = pool.sort((a, b) => b.prob - a.prob)[0];
  } else if (riskLevel === "high") {
    // Lower probability = higher odds
    pick = pool.sort((a, b) => a.prob - b.prob)[0];
  } else {
    // Medium: middle of the pack
    pick = pool.sort((a, b) => b.prob - a.prob)[Math.floor(pool.length / 2)] || pool[0];
  }

  const odds = oddsFromProb(pick.prob);

  return {
    match: `${home} vs ${away}`,
    matchDate: fixture.match_date,
    matchTime: fixture.match_time || "",
    league: fixture.league_name,
    market: pick.market,
    odds,
    confidence: pick.confidence,
    reason: pick.reason,
    injuryImpact: null,
  };
}

/** Filter fixtures by date and league. */
function filterFixtures(fixtures, { targetDate, leagueFilter }) {
  const todayStr = today();
  let out = fixtures.filter((f) => f.match_date >= todayStr);

  if (targetDate) {
    out = out.filter((f) => f.match_date === targetDate);
  } else {
    // Next 7 days
    const weekEnd = addDays(7);
    out = out.filter((f) => f.match_date <= weekEnd);
  }

  if (leagueFilter) {
    const lf = leagueFilter.toLowerCase();
    out = out.filter((f) => f.league_name && f.league_name.toLowerCase().includes(lf));
  }

  return out;
}

/** Build a complete bet slip. */
export function buildBet(state, body) {
  const {
    targetOdds,
    riskLevel = "medium",
    enabledMarkets = [],
    leagueFilter,
    maxLegs,
    targetDate,
    stakeAmount,
    desiredWinAmount,
  } = body;

  // Resolve target odds
  let resolvedTargetOdds = typeof targetOdds === "number" ? targetOdds : undefined;
  if (!resolvedTargetOdds && stakeAmount && desiredWinAmount) {
    const s = Number(stakeAmount);
    const w = Number(desiredWinAmount);
    if (s > 0 && w > 0) resolvedTargetOdds = Number((w / s + 1).toFixed(2));
  }
  if (!resolvedTargetOdds) {
    return { error: "Missing targetOdds (or stake+desiredWin) and riskLevel" };
  }

  // Validate date not in past
  if (targetDate && targetDate < today()) {
    return { error: `Cannot build bets for past dates. Choose ${today()} or later.` };
  }

  let fixtures = filterFixtures(state.fixtures, { targetDate, leagueFilter });

  // Fallback: drop league filter if nothing found
  if (fixtures.length === 0 && leagueFilter) {
    fixtures = filterFixtures(state.fixtures, { targetDate });
  }
  // Fallback: widen to 14 days if specific date had nothing
  if (fixtures.length === 0 && targetDate) {
    const weekEnd = addDays(14);
    fixtures = state.fixtures.filter((f) => f.match_date >= today() && f.match_date <= weekEnd);
    if (leagueFilter) {
      const lf = leagueFilter.toLowerCase();
      fixtures = fixtures.filter((f) => f.league_name && f.league_name.toLowerCase().includes(lf));
    }
  }

  if (fixtures.length === 0) {
    return {
      slip: [],
      combinedOdds: 1,
      riskAssessment: "No upcoming fixtures found for the selected criteria.",
      expectedValue: "N/A",
      advice: "Try a different date or remove the league filter.",
    };
  }

  // Generate picks for all fixtures
  const picks = [];
  for (const fx of fixtures.slice(0, 80)) {
    const pick = generatePick(fx, state.matches, enabledMarkets, riskLevel);
    if (pick) picks.push(pick);
  }

  if (picks.length === 0) {
    return {
      slip: [],
      combinedOdds: 1,
      riskAssessment: "Unable to generate picks from available fixtures.",
      expectedValue: "N/A",
      advice: "Try enabling more market types.",
    };
  }

  // Sort by quality (confidence + odds fit)
  picks.sort((a, b) => {
    const aScore = (a.confidence === "high" ? 3 : a.confidence === "medium" ? 2 : 1);
    const bScore = (b.confidence === "high" ? 3 : b.confidence === "medium" ? 2 : 1);
    return bScore - aScore;
  });

  // Select legs to hit target odds
  const slip = [];
  let combinedOdds = 1;
  const usedMatches = new Set();

  // Determine how many legs we need
  let legCount;
  if (maxLegs) {
    legCount = maxLegs;
  } else {
    // Estimate: try to reach targetOdds with reasonable legs
    const avgOdds = picks.reduce((a, p) => a + p.odds, 0) / picks.length;
    legCount = Math.max(1, Math.min(8, Math.round(Math.log(resolvedTargetOdds) / Math.log(avgOdds))));
  }

  // For low risk, prefer safer (higher prob) picks; for high risk, prefer higher odds
  const sortedPicks = [...picks].sort((a, b) => {
    if (riskLevel === "low") return b.odds - a.odds < 0 ? 1 : -1; // lower odds first
    if (riskLevel === "high") return b.odds - a.odds; // higher odds first
    return 0;
  });

  for (const pick of sortedPicks) {
    if (slip.length >= legCount) break;
    if (usedMatches.has(pick.match)) continue;
    // Ensure market diversity: don't repeat the same market
    if (slip.some((s) => s.market === pick.market)) continue;

    slip.push(pick);
    combinedOdds *= pick.odds;
    usedMatches.add(pick.match);
  }

  // If we haven't hit target odds and have more picks, add more
  if (combinedOdds < resolvedTargetOdds) {
    for (const pick of sortedPicks) {
      if (combinedOdds >= resolvedTargetOdds) break;
      if (usedMatches.has(pick.match)) continue;
      slip.push(pick);
      combinedOdds *= pick.odds;
      usedMatches.add(pick.match);
    }
  }

  // If we exceeded target odds significantly and have flexibility, trim last leg
  if (!maxLegs && slip.length > 1 && combinedOdds / slip[slip.length - 1].odds >= resolvedTargetOdds * 0.8) {
    combinedOdds /= slip[slip.length - 1].odds;
    slip.pop();
  }

  combinedOdds = Math.round(combinedOdds * 100) / 100;

  // Compute stake/payout if provided
  const result = {
    slip,
    combinedOdds,
    riskAssessment: getRiskAssessment(riskLevel, slip.length, combinedOdds),
    expectedValue: getExpectedValue(slip, combinedOdds),
    advice: getAdvice(riskLevel, slip.length, combinedOdds, resolvedTargetOdds, leagueFilter),
  };

  if (stakeAmount && desiredWinAmount) {
    result.stake = Number(stakeAmount);
    result.expectedPayout = Math.round(Number(stakeAmount) * combinedOdds);
    result.expectedProfit = Math.round(Number(stakeAmount) * (combinedOdds - 1));
    result.desiredWin = Number(desiredWinAmount);
  }

  return result;
}

function getRiskAssessment(risk, legs, odds) {
  if (risk === "low") return `Low-risk ${legs}-leg slip at ${odds.toFixed(2)}x — focused on high-probability outcomes.`;
  if (risk === "high") return `High-risk ${legs}-leg accumulator at ${odds.toFixed(2)}x — big potential return but each leg must win.`;
  return `Balanced ${legs}-leg slip at ${odds.toFixed(2)}x — mix of safety and value.`;
}

function getExpectedValue(slip, odds) {
  // Simple: average probability of legs
  const avgProb = slip.reduce((a, s) => a + (1 / s.odds), 0) / slip.length;
  const ev = (avgProb * (odds - 1)) - (1 - avgProb);
  return `${(ev * 100).toFixed(1)}% implied edge`;
}

function getAdvice(risk, legs, odds, target, league) {
  if (odds < target * 0.7) {
    return league
      ? `${league} may not have enough fixtures — try adding more leagues or lowering target odds.`
      : "Not enough high-value picks to hit your target. Try widening the date range or adding leagues.";
  }
  if (odds > target * 1.5) {
    return "Combined odds exceed your target — consider reducing legs for a safer slip.";
  }
  return `Slip built at ${odds.toFixed(2)}x — close to your ${target.toFixed(2)}x target. Good to go.`;
}

/** Generate edge picks for today/tomorrow. */
export function buildEdgePicks(state) {
  const todayStr = today();
  const tomorrowStr = addDays(1);

  const fixtures = state.fixtures.filter(
    (f) => f.match_date >= todayStr && f.match_date <= tomorrowStr,
  );

  if (fixtures.length === 0) {
    return {
      bestPicks: [],
      highConfidence: [],
      valueAlerts: [],
      undervalued: [],
      summary: "No matches scheduled today — fixtures syncing. Check back shortly.",
    };
  }

  const bestPicks = [];
  const highConfidence = [];
  const valueAlerts = [];
  const undervalued = [];

  for (const fx of fixtures.slice(0, 40)) {
    const home = fx.home_team;
    const away = fx.away_team;
    const homeS = teamStats(state.matches, home);
    const awayS = teamStats(state.matches, away);
    const expGoals = (homeS.avgGf + awayS.avgGf + homeS.avgGa + awayS.avgGa) / 2;
    const bttsProb = (homeS.bttsRate + awayS.bttsRate) / 2;
    const over25Prob = (homeS.over25Rate + awayS.over25Rate) / 2;
    const homeWinProb = Math.max(0.15, Math.min(0.85, 0.5 + (homeS.avgGf - awayS.avgGa) * 0.08 + (homeS.form.w - homeS.form.l) * 0.03));

    const matchStr = `${home} vs ${away}`;

    // Best pick: over/under or result
    if (over25Prob > 0.55) {
      bestPicks.push({
        match: matchStr,
        matchDate: fx.match_date,
        prediction: "Over 2.5",
        confidence: Math.round(over25Prob * 100),
        market: "Goals",
        reasoning: `Combined ${(expGoals).toFixed(1)} xG. Over 2.5 hit ${(over25Prob * 100).toFixed(0)}% in recent matches.`,
        edge: `Model ${Math.round(over25Prob * 100)}% vs market ~55%`,
      });
    } else if (homeWinProb > 0.6) {
      bestPicks.push({
        match: matchStr,
        matchDate: fx.match_date,
        prediction: "Home Win",
        confidence: Math.round(homeWinProb * 100),
        market: "1X2",
        reasoning: `${home} ${homeS.form.w}W-${homeS.form.d}D-${homeS.form.l}L, scoring ${homeS.avgGf.toFixed(1)}/game.`,
        edge: `Model ${Math.round(homeWinProb * 100)}% vs implied ~55%`,
      });
    }

    // High confidence
    if (bttsProb > 0.65 || bttsProb < 0.35) {
      const yes = bttsProb > 0.5;
      highConfidence.push({
        match: matchStr,
        matchDate: fx.match_date,
        prediction: yes ? "BTTS Yes" : "BTTS No",
        confidence: Math.round(Math.max(bttsProb, 1 - bttsProb) * 100),
        market: "BTTS",
        reasoning: `BTTS rate: ${home} ${(homeS.bttsRate * 100).toFixed(0)}%, ${away} ${(awayS.bttsRate * 100).toFixed(0)}%.`,
        edge: yes ? "Both scoring consistently" : "At least one side struggles to score",
      });
    }

    // Value alert: home win underpriced
    if (homeWinProb > 0.6) {
      const impliedProb = 1 / oddsFromProb(homeWinProb);
      if (homeWinProb - impliedProb > 0.05) {
        valueAlerts.push({
          match: matchStr,
          matchDate: fx.match_date,
          alert: `${home} win underpriced`,
          modelProb: Math.round(homeWinProb * 100),
          impliedProb: Math.round(impliedProb * 100),
          reasoning: `Model gives ${home} ${(homeWinProb * 100).toFixed(0)}% but market implies ~${(impliedProb * 100).toFixed(0)}%.`,
        });
      }
    }

    // Undervalued
    if (over25Prob > 0.5 && over25Prob < 0.65) {
      undervalued.push({
        match: matchStr,
        matchDate: fx.match_date,
        market: "Over 2.5 Goals",
        modelProb: Math.round(over25Prob * 100),
        reasoning: `Over 2.5 hit ${(over25Prob * 100).toFixed(0)}% recently — overlooked value at standard odds.`,
      });
    }
  }

  // Sort by confidence and limit
  const sortByConf = (a, b) => b.confidence - a.confidence;
  bestPicks.sort(sortByConf);
  highConfidence.sort(sortByConf);
  valueAlerts.sort((a, b) => b.modelProb - a.modelProb);
  undervalued.sort((a, b) => b.modelProb - a.modelProb);

  const summary = bestPicks.length > 0
    ? `${bestPicks.length} top picks found across ${fixtures.length} fixtures today.`
    : `${fixtures.length} fixtures today — generating edge analysis.`;

  return {
    bestPicks: bestPicks.slice(0, 4),
    highConfidence: highConfidence.slice(0, 4),
    valueAlerts: valueAlerts.slice(0, 4),
    undervalued: undervalued.slice(0, 4),
    summary,
  };
}
