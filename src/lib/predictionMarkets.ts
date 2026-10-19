import type { PredictionResult } from "@/lib/dixonColes";
import type { AggregatedStats, TeamMatchView } from "@/lib/matchStats";
import { computePlayerProps } from "@/lib/playerProps";
import type { RealPlayer } from "@/hooks/useTeamPlayers";

export const PREDICTION_MARKETS = [
  { id: "1x2", label: "1X2", category: "Result" },
  { id: "double_chance", label: "Double Chance", category: "Result" },
  { id: "draw_no_bet", label: "Draw No Bet", category: "Result" },
  { id: "over_under_goals", label: "Over/Under Goals", category: "Goals" },
  { id: "btts", label: "BTTS", category: "Goals" },
  { id: "correct_score", label: "Correct Score", category: "Goals" },
  { id: "ht_ft", label: "HT/FT", category: "Goals" },
  { id: "goal_both_halves", label: "Goal Both Halves", category: "Goals" },
  { id: "clean_sheet", label: "Clean Sheet", category: "Goals" },
  { id: "win_to_nil", label: "Win to Nil", category: "Goals" },
  { id: "team_goals", label: "Team Total Goals", category: "Team" },
  { id: "team_corners", label: "Team Corners (Home/Away N+)", category: "Team" },
  { id: "team_cards", label: "Team Cards (Home/Away N+)", category: "Team" },
  { id: "team_shots", label: "Team Shots (Home/Away N+)", category: "Team" },
  { id: "team_fouls", label: "Team Fouls (Home/Away N+)", category: "Team" },
  { id: "corners", label: "Total Corners O/U", category: "Stats" },
  { id: "cards", label: "Total Cards O/U", category: "Stats" },
  { id: "fouls", label: "Total Fouls O/U", category: "Stats" },
  { id: "shots", label: "Total Shots O/U", category: "Stats" },
  { id: "shots_on_target", label: "Shots on Target", category: "Stats" },
  { id: "offsides", label: "Offsides", category: "Stats" },
  { id: "anytime_scorer", label: "Anytime Goalscorer", category: "Players" },
  { id: "first_scorer", label: "First Goalscorer", category: "Players" },
  { id: "player_assist", label: "Player to Assist", category: "Players" },
  { id: "player_shots_on_target", label: "Player Shots on Target", category: "Players" },
  { id: "player_shots", label: "Player Total Shots", category: "Players" },
  { id: "player_fouls", label: "Player Fouls Committed", category: "Players" },
  { id: "player_card", label: "Player to be Carded", category: "Players" },
] as const;

export type MarketId = typeof PREDICTION_MARKETS[number]["id"];
export type MarketOutcome = { label: string; probability: number; evidence: string; odds?: { market: "h2h" | "totals" | "btts"; outcome: string; point?: number } };
export type PredictionMarket = typeof PREDICTION_MARKETS[number] & {
  outcomes: MarketOutcome[];
  confidence: "Limited" | "Moderate" | "Strong" | "Unavailable";
  meaning: string;
  why: string;
  tip: string;
};
export type MarketInputs = {
  prediction: PredictionResult;
  home: string;
  away: string;
  statsHome: AggregatedStats;
  statsAway: AggregatedStats;
  homeViews: TeamMatchView[];
  awayViews: TeamMatchView[];
  squadHome?: RealPlayer[];
  squadAway?: RealPlayer[];
  outHome?: Set<string>;
  outAway?: Set<string>;
};

const meanings: Record<MarketId, string> = {
  "1x2": "Home win, draw or away win after 90 minutes, including stoppage time.",
  double_chance: "Two of the three full-time results are covered by one selection.",
  draw_no_bet: "A draw returns the stake. The displayed chance is conditional on the game not ending in a draw.",
  over_under_goals: "Combined goals scored by both teams above or below the selected line.",
  btts: "Whether both teams score at least one goal in normal time.",
  correct_score: "The exact score at full time. Even the leading scoreline usually has a low chance.",
  ht_ft: "The result at half-time and at full-time must both match the selection.",
  goal_both_halves: "At least one goal must be scored in each half of the match.",
  clean_sheet: "The selected team concedes no goals in normal time.",
  win_to_nil: "The selected team wins while conceding no goals.",
  team_goals: "Goals scored by one team, not the combined match total.",
  team_corners: "Corners won by the selected team at or above a line.",
  team_cards: "Yellow cards received by the selected team. Bookmaker card-counting rules may differ.",
  team_shots: "Total shots attempted by the selected team, including off-target shots.",
  team_fouls: "Fouls committed by the selected team.",
  corners: "Combined corners won by both teams above or below a line.",
  cards: "Combined yellow cards above or below a line. Not booking points.",
  fouls: "Combined fouls committed by both teams above or below a line.",
  shots: "Combined shot attempts by both teams above or below a line.",
  shots_on_target: "Combined on-target shots by both teams above or below a line.",
  offsides: "Offside decisions against both teams.",
  anytime_scorer: "The player scores at any point in normal time.",
  first_scorer: "The player scores the first goal of the match.",
  player_assist: "The player is credited with at least one assist.",
  player_shots_on_target: "The player records at least one shot on target.",
  player_shots: "The player records at least one shot attempt.",
  player_fouls: "The player commits at least one foul.",
  player_card: "The player receives at least one yellow card.",
};

/** All goal markets use the SAME normalized Dixon-Coles matrix as the headline. */
export function buildPredictionMarkets(input: MarketInputs): PredictionMarket[] {
  const { prediction: p, home, away, statsHome, statsAway, homeViews, awayViews } = input;
  const byId = new Map<MarketId, MarketOutcome[]>();
  const samples = new Map<MarketId, number>();
  const sum = (condition: (h: number, a: number) => boolean) => p.scoreMatrix.reduce((total, row, h) => total + row.reduce((s, prob, a) => s + (condition(h, a) ? prob * 100 : 0), 0), 0);
  const evidence = `${home} ${p.lambdaHome.toFixed(2)} xG · ${away} ${p.lambdaAway.toFixed(2)} xG`;
  const outcome = (label: string, probability: number): MarketOutcome => ({ label, probability, evidence });
  const set = (id: MarketId, outcomes: MarketOutcome[], n = Math.min(statsHome.matchesPlayed, statsAway.matchesPlayed)) => { byId.set(id, outcomes); samples.set(id, n); };
  set("1x2", [
    { ...outcome(home, p.homeWin), odds: { market: "h2h", outcome: home } },
    { ...outcome("Draw", p.draw), odds: { market: "h2h", outcome: "Draw" } },
    { ...outcome(away, p.awayWin), odds: { market: "h2h", outcome: away } },
  ]);
  set("double_chance", [outcome(`${home} or draw`, p.homeWin + p.draw), outcome(`${away} or draw`, p.awayWin + p.draw), outcome("Either team wins", p.homeWin + p.awayWin)]);
  const decisive = p.homeWin + p.awayWin;
  set("draw_no_bet", decisive > 0 ? [outcome(home, p.homeWin / decisive * 100), outcome(away, p.awayWin / decisive * 100)] : []);
  set("over_under_goals", [1.5, 2.5, 3.5, 4.5].flatMap(line => {
    const over = sum((h, a) => h + a > line);
    return ["Over", "Under"].map(side => ({ ...outcome(`${side} ${line}`, side === "Over" ? over : 100 - over), odds: { market: "totals" as const, outcome: side, point: line } }));
  }));
  const btts = sum((h, a) => h > 0 && a > 0);
  set("btts", ["Yes", "No"].map(side => ({ ...outcome(side, side === "Yes" ? btts : 100 - btts), odds: { market: "btts" as const, outcome: side } })));
  set("correct_score", p.topScorelines.map(s => outcome(`${s.home}–${s.away}`, s.probability * 100)));
  set("clean_sheet", [outcome(home, sum((_h, a) => a === 0)), outcome(away, sum(h => h === 0))]);
  set("win_to_nil", [outcome(home, sum((h, a) => h > 0 && a === 0)), outcome(away, sum((h, a) => a > 0 && h === 0))]);
  set("team_goals", [1, 2, 3].flatMap(line => [outcome(`${home} ${line}+`, sum(h => h >= line)), outcome(`${away} ${line}+`, sum((_h, a) => a >= line))]));

  // Empirical frequency estimates: zero-filled unsupported feeds are not evidence.
  const statMarkets = [
    { team: "team_corners", total: "corners", read: (v: TeamMatchView) => v.cornersFor, opponent: (v: TeamMatchView) => v.cornersAgainst, line: 9.5, teamLine: 5 },
    { team: "team_cards", total: "cards", read: (v: TeamMatchView) => v.yellowCards, opponent: (v: TeamMatchView) => v.isHome ? v.match.away_yellows : v.match.home_yellows, line: 3.5, teamLine: 2 },
    { team: "team_shots", total: "shots", read: (v: TeamMatchView) => v.shotsFor, opponent: (v: TeamMatchView) => v.shotsAgainst, line: 23.5, teamLine: 10 },
    { team: "team_fouls", total: "fouls", read: (v: TeamMatchView) => v.foulsCommitted, opponent: (v: TeamMatchView) => v.foulsDrawn, line: 23.5, teamLine: 10 },
    { team: null, total: "shots_on_target", read: (v: TeamMatchView) => v.shotsOnTargetFor, opponent: (v: TeamMatchView) => v.shotsOnTargetAgainst, line: 7.5, teamLine: 3 },
  ] as const;
  for (const metric of statMarkets) {
    // Need recorded non-zero observations in BOTH teams' samples; unsupported == unavailable.
    if (!homeViews.some(v => metric.read(v) > 0) || !awayViews.some(v => metric.read(v) > 0)) continue;
    const hist = (views: TeamMatchView[], team: string): MarketOutcome => ({
      label: `${team} ${metric.teamLine}+`,
      probability: views.filter(v => metric.read(v) >= metric.teamLine).length / views.length * 100,
      evidence: `${views.filter(v => metric.read(v) >= metric.teamLine).length}/${views.length} recent matches · Historical frequency`,
    });
    if (metric.team) set(metric.team, [hist(homeViews, home), hist(awayViews, away)]);
    const unique = [...new Map([...homeViews, ...awayViews].map(v => [v.match.id, v])).values()];
    const over = unique.filter(v => metric.read(v) + metric.opponent(v) > metric.line).length;
    set(metric.total, [
      { label: `Over ${metric.line}`, probability: over / unique.length * 100, evidence: `${over}/${unique.length} recent matches · Historical frequency` },
      { label: `Under ${metric.line}`, probability: (unique.length - over) / unique.length * 100, evidence: `${unique.length - over}/${unique.length} recent matches · Historical frequency` },
    ]);
  }

  const squads = [
    { players: input.squadHome ?? [], team: home, lambda: p.lambdaHome, out: input.outHome ?? new Set<string>() },
    { players: input.squadAway ?? [], team: away, lambda: p.lambdaAway, out: input.outAway ?? new Set<string>() },
  ];
  const props = squads.flatMap(s => computePlayerProps(s.players, s.team, s.lambda, s.out));
  for (const [id, key] of [["anytime_scorer", "anytimeScorer"], ["player_assist", "assist"], ["player_card", "yellowCard"]] as const) {
    const entries = props.filter(prop => prop[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 6);
    set(id, entries.map(prop => ({ label: `${prop.player} · ${prop.team}`, probability: prop[key], evidence: "Player season rates · Assumes an appearance, not a confirmed starting lineup" })), 0);
  }
  for (const [id, key] of [["player_shots", "shots"], ["player_shots_on_target", "shotsOnTarget"], ["player_fouls", "fouls"]] as const) {
    const entries = squads.flatMap(s => s.players.filter(player => !s.out.has(player.name) && player.appearances > 0 && player[key] > 0).map(player => ({
      label: `${player.name} 1+ · ${s.team}`,
      probability: (1 - Math.exp(-player[key] / player.appearances)) * 100,
      evidence: `${(player[key] / player.appearances).toFixed(2)} per appearance · Poisson estimate, minutes not confirmed`,
    }))).sort((a, b) => b.probability - a.probability).slice(0, 6);
    set(id, entries, 0);
  }
  return PREDICTION_MARKETS.map(market => {
    const outcomes = byId.get(market.id) ?? [];
    const n = samples.get(market.id) ?? 0;
    const unavailable = market.id === "offsides" ? "Offside data is not available in the current match feed."
      : ["ht_ft", "goal_both_halves"].includes(market.id) ? "A calibrated half-by-half model is not available. Full-time xG cannot price this market reliably."
      : market.id === "first_scorer" ? "Goal-order and expected-minute data are needed; anytime scorer probability is not first scorer probability."
      : market.category === "Players" ? "No eligible player has recorded data for this market. Check player availability or try another team."
      : "Recorded statistics are missing for one or both teams. No estimate is produced from zero-filled data.";
    return {
      ...market, outcomes,
      confidence: outcomes.length === 0 ? "Unavailable" : market.category === "Players" || n < 8 ? "Limited" : n < 20 ? "Moderate" : "Strong",
      meaning: meanings[market.id],
      why: outcomes.length === 0 ? unavailable : market.category === "Players" ? "Season player rates combined with projected team goals or a per-appearance Poisson estimate. Selected unavailable players are excluded."
        : market.category === "Stats" || market.id.startsWith("team_") && market.id !== "team_goals" ? "Observed recent-match frequencies, not a calibrated forecast. Opponent strength and changes in lineup can alter the outcome."
        : `The same Dixon-Coles score distribution as the main prediction, adjusted for selected player absences. ${n} recent matches per team at most.`,
      tip: market.id === "draw_no_bet" ? `Draw refund chance: ${p.draw.toFixed(1)}%. Compare bookmaker settlement rules; this is not a full-time win probability.`
        : "Chance is an estimated outcome probability, not a guarantee. Confidence reflects data support, not win certainty. Compare real bookmaker prices and settlement rules; no price means no proven betting value.",
    };
  });
}