import { normalizeTeamName, canonicalTeamKey } from "@/lib/teamNormalize";

export type Match = {
  id: string;
  league_code: string;
  league_name: string;
  season: string;
  match_date: string;
  home_team: string;
  away_team: string;
  ft_home_goals: number;
  ft_away_goals: number;
  ft_result: string;
  ht_home_goals: number;
  ht_away_goals: number;
  ht_result: string;
  home_shots: number;
  away_shots: number;
  home_shots_target: number;
  away_shots_target: number;
  home_fouls: number;
  away_fouls: number;
  home_corners: number;
  away_corners: number;
  home_yellows: number;
  away_yellows: number;
  home_reds: number;
  away_reds: number;
  referee: string | null;
};

export type TeamMatchView = {
  match: Match;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  shotsFor: number;
  shotsAgainst: number;
  shotsOnTargetFor: number;
  shotsOnTargetAgainst: number;
  foulsCommitted: number;
  foulsDrawn: number;
  cornersFor: number;
  cornersAgainst: number;
  yellowCards: number;
  redCards: number;
  opponent: string;
};

export function getTeamMatchView(match: Match, teamName: string): TeamMatchView | null {
  const normalizedTeam = normalizeTeamName(teamName);
  const isHome = normalizeTeamName(match.home_team) === normalizedTeam;
  const isAway = normalizeTeamName(match.away_team) === normalizedTeam;
  if (!isHome && !isAway) return null;

  const goalsFor = isHome ? match.ft_home_goals : match.ft_away_goals;
  const goalsAgainst = isHome ? match.ft_away_goals : match.ft_home_goals;
  const result: "W" | "D" | "L" = goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D";

  return {
    match,
    isHome,
    goalsFor,
    goalsAgainst,
    result,
    shotsFor: isHome ? match.home_shots : match.away_shots,
    shotsAgainst: isHome ? match.away_shots : match.home_shots,
    shotsOnTargetFor: isHome ? match.home_shots_target : match.away_shots_target,
    shotsOnTargetAgainst: isHome ? match.away_shots_target : match.home_shots_target,
    foulsCommitted: isHome ? match.home_fouls : match.away_fouls,
    foulsDrawn: isHome ? match.away_fouls : match.home_fouls,
    cornersFor: isHome ? match.home_corners : match.away_corners,
    cornersAgainst: isHome ? match.away_corners : match.home_corners,
    yellowCards: isHome ? match.home_yellows : match.away_yellows,
    redCards: isHome ? match.home_reds : match.away_reds,
    opponent: normalizeTeamName(isHome ? match.away_team : match.home_team),
  };
}

export type AggregatedStats = {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  avgShotsFor: number;
  avgShotsAgainst: number;
  avgShotsOnTargetFor: number;
  avgShotsOnTargetAgainst: number;
  avgFoulsCommitted: number;
  avgFoulsDrawn: number;
  avgCornersFor: number;
  avgCornersAgainst: number;
  avgYellowCards: number;
  avgRedCards: number;
  cleanSheets: number;
  bttsPercentage: number;
  over25Percentage: number;
  over15Percentage: number;
  winProbability: number;
  formLast5: ("W" | "D" | "L")[];
  tacticalProfile: TacticalProfile;
};

export type TacticalProfile = {
  style: string;
  pressing: number;      // 0-100
  attacking: number;     // 0-100
  defensive: number;     // 0-100
  volatile: number;      // 0-100
  counterAttack: number; // 0-100
  description: string;
};

export function aggregateStats(views: TeamMatchView[]): AggregatedStats {
  const n = views.length;
  if (n === 0) {
    return {
      matchesPlayed: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0,
      avgShotsFor: 0, avgShotsAgainst: 0,
      avgShotsOnTargetFor: 0, avgShotsOnTargetAgainst: 0,
      avgFoulsCommitted: 0, avgFoulsDrawn: 0,
      avgCornersFor: 0, avgCornersAgainst: 0,
      avgYellowCards: 0, avgRedCards: 0,
      cleanSheets: 0, bttsPercentage: 0,
      over25Percentage: 0, over15Percentage: 0,
      winProbability: 0, formLast5: [],
      tacticalProfile: { style: "Unknown", pressing: 0, attacking: 0, defensive: 0, volatile: 0, counterAttack: 0, description: "No data" },
    };
  }

  const wins = views.filter(v => v.result === "W").length;
  const draws = views.filter(v => v.result === "D").length;
  const losses = views.filter(v => v.result === "L").length;

  const totalGF = views.reduce((s, v) => s + v.goalsFor, 0);
  const totalGA = views.reduce((s, v) => s + v.goalsAgainst, 0);
  const totalShotsFor = views.reduce((s, v) => s + v.shotsFor, 0);
  const totalShotsAgainst = views.reduce((s, v) => s + v.shotsAgainst, 0);
  const totalSOTFor = views.reduce((s, v) => s + v.shotsOnTargetFor, 0);
  const totalSOTAgainst = views.reduce((s, v) => s + v.shotsOnTargetAgainst, 0);
  const totalFoulsCommitted = views.reduce((s, v) => s + v.foulsCommitted, 0);
  const totalFoulsDrawn = views.reduce((s, v) => s + v.foulsDrawn, 0);
  const totalCornersFor = views.reduce((s, v) => s + v.cornersFor, 0);
  const totalCornersAgainst = views.reduce((s, v) => s + v.cornersAgainst, 0);
  const totalYellows = views.reduce((s, v) => s + v.yellowCards, 0);
  const totalReds = views.reduce((s, v) => s + v.redCards, 0);

  const cleanSheets = views.filter(v => v.goalsAgainst === 0).length;
  const bttsCount = views.filter(v => v.goalsFor > 0 && v.goalsAgainst > 0).length;
  const over25Count = views.filter(v => v.goalsFor + v.goalsAgainst > 2).length;
  const over15Count = views.filter(v => v.goalsFor + v.goalsAgainst > 1).length;

  const formLast5 = views.slice(-5).map(v => v.result);

  // Tactical profiling
  const avgShotsFor = totalShotsFor / n;
  const avgShotsAgainst = totalShotsAgainst / n;
  const avgFoulsCommitted = totalFoulsCommitted / n;
  const avgCornersFor = totalCornersFor / n;
  const avgGF = totalGF / n;
  const avgGA = totalGA / n;

  // Pressing: high fouls + high shots = pressing team
  const pressing = Math.min(100, Math.round((avgFoulsCommitted / 16) * 50 + (avgShotsFor / 18) * 50));
  // Attacking: high shots, high goals scored, high corners
  const attacking = Math.min(100, Math.round((avgShotsFor / 18) * 40 + (avgGF / 2.5) * 35 + (avgCornersFor / 8) * 25));
  // Defensive: low goals conceded, high clean sheet ratio, low shots against
  const defensive = Math.min(100, Math.round((1 - avgGA / 2.5) * 40 + (cleanSheets / n) * 35 + (1 - avgShotsAgainst / 16) * 25));
  // Volatile: high combined goals, inconsistent results
  const resultVariance = views.length >= 3 ? calculateVariance(views.map(v => v.result === "W" ? 3 : v.result === "D" ? 1 : 0)) : 0;
  const volatile = Math.min(100, Math.round(((avgGF + avgGA) / 4) * 50 + (resultVariance / 2) * 50));
  // Counter-attack: low possession proxy (fewer shots but efficient SOT ratio)
  const sotRatio = totalShotsFor > 0 ? totalSOTFor / totalShotsFor : 0;
  const counterAttack = Math.min(100, Math.round((1 - avgShotsFor / 18) * 40 + sotRatio * 60));

  let style = "Balanced";
  const scores = { Pressing: pressing, Attacking: attacking, Defensive: defensive, "Counter-Attacking": counterAttack };
  const topStyle = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  style = topStyle[0];

  let description = "";
  if (pressing > 65) description += "High-press team. ";
  if (attacking > 70) description += "Very attack-minded. ";
  if (defensive > 70) description += "Solid defensively. ";
  if (volatile > 60) description += "Results can swing either way. ";
  if (counterAttack > 60) description += "Efficient on the counter. ";
  if (!description) description = "Balanced approach across all phases.";

  return {
    matchesPlayed: n,
    wins, draws, losses,
    goalsFor: totalGF,
    goalsAgainst: totalGA,
    avgShotsFor,
    avgShotsAgainst,
    avgShotsOnTargetFor: totalSOTFor / n,
    avgShotsOnTargetAgainst: totalSOTAgainst / n,
    avgFoulsCommitted,
    avgFoulsDrawn: totalFoulsDrawn / n,
    avgCornersFor,
    avgCornersAgainst: totalCornersAgainst / n,
    avgYellowCards: totalYellows / n,
    avgRedCards: totalReds / n,
    cleanSheets,
    bttsPercentage: (bttsCount / n) * 100,
    over25Percentage: (over25Count / n) * 100,
    over15Percentage: (over15Count / n) * 100,
    winProbability: (wins / n) * 100,
    formLast5,
    tacticalProfile: { style, pressing, attacking, defensive, volatile, counterAttack, description },
  };
}

function calculateVariance(numbers: number[]): number {
  const mean = numbers.reduce((s, n) => s + n, 0) / numbers.length;
  return numbers.reduce((s, n) => s + (n - mean) ** 2, 0) / numbers.length;
}

// Get unique team names from matches (normalized + dedup by canonical key,
// keeping the longest/most-complete display variant for each club).
export function getUniqueTeams(matches: Match[]): string[] {
  const byKey = new Map<string, string>();
  const consider = (raw: string) => {
    const display = normalizeTeamName(raw);
    const key = canonicalTeamKey(display);
    if (!key) return;
    const prev = byKey.get(key);
    if (!prev || display.length > prev.length) byKey.set(key, display);
  };
  matches.forEach(m => { consider(m.home_team); consider(m.away_team); });
  return Array.from(byKey.values()).sort();
}

// Get unique leagues
export function getUniqueLeagues(matches: Match[]): { code: string; name: string }[] {
  const map = new Map<string, string>();
  matches.forEach(m => map.set(m.league_code, m.league_name));
  return Array.from(map.entries()).map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
}

// Aggregate evaluation for a specific upcoming matchup context
export type MatchupEvaluation = {
  teamAStyle: TacticalProfile;
  teamBStyle: TacticalProfile;
  prediction: string;
};

export function evaluateMatchup(
  teamAViews: TeamMatchView[],
  teamBViews: TeamMatchView[],
  teamAName: string,
  teamBName: string,
  aggregateContext?: { teamALeadGoals: number; teamBLeadGoals: number }
): MatchupEvaluation {
  const statsA = aggregateStats(teamAViews);
  const statsB = aggregateStats(teamBViews);

  let prediction = "";

  if (aggregateContext) {
    const diff = aggregateContext.teamALeadGoals - aggregateContext.teamBLeadGoals;
    if (diff > 2) {
      prediction = `${teamAName} has a commanding lead. ${teamBName} will likely press hard and attack aggressively this leg. Expect high pressing, fouls, and cards from ${teamBName}.`;
    } else if (diff > 0) {
      prediction = `${teamAName} leads on aggregate. ${teamBName} needs goals — expect attacking pressure and an open game. ${teamAName} may sit deeper and counter.`;
    } else if (diff === 0) {
      prediction = `Level on aggregate — both teams will be cautious early but increasingly desperate. Expect a tactical battle.`;
    } else if (diff > -2) {
      prediction = `${teamBName} leads on aggregate. ${teamAName} needs goals — expect high press and attacking intent from ${teamAName}. Could be volatile.`;
    } else {
      prediction = `${teamBName} has a commanding lead. ${teamAName} must go all-out attack. Expect a chaotic, high-foul, high-card game.`;
    }
  } else {
    if (statsA.winProbability > statsB.winProbability + 15) {
      prediction = `${teamAName} are clear favorites. ${teamBName} may sit deep and counter.`;
    } else if (statsB.winProbability > statsA.winProbability + 15) {
      prediction = `${teamBName} are clear favorites. ${teamAName} may defend and counter.`;
    } else {
      prediction = `Close matchup. Expect a competitive, tactical game.`;
    }
  }

  return {
    teamAStyle: statsA.tacticalProfile,
    teamBStyle: statsB.tacticalProfile,
    prediction,
  };
}
