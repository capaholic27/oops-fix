/**
 * Dixon-Coles Match Prediction Engine
 * Poisson distribution with Dixon-Coles low-score correction
 * + player / psychological / fatigue context multipliers.
 */

// ── Types ──

export type TeamInput = {
  goalsScored: number;
  goalsConceded: number;
  matchesPlayed: number;
  // Optional home/away splits
  homeGoalsScored?: number;
  homeGoalsConceded?: number;
  homeMatches?: number;
  awayGoalsScored?: number;
  awayGoalsConceded?: number;
  awayMatches?: number;
  // Last-5 form
  recentGoalsScored?: number;
  recentGoalsConceded?: number;
  recentMatches?: number;
};

/** Context factors that modify expected goals beyond pure stats */
export type MatchContext = {
  /** Key player returning – rating 0-1 (e.g. 0.9 = world-class) */
  playerReturnRating?: number;
  /** Availability fraction 0-1 (1 = fully fit) */
  playerReturnAvailability?: number;
  /** Key player missing – rating 0-1 */
  missingPlayerRating?: number;
  /** Derby / rivalry flag (0 or 1) */
  rivalryFlag?: number;
  /** Revenge flag – lost previous meeting (0 or 1) */
  revengeFlag?: number;
  /** Match importance 0-1 (0 = dead rubber, 1 = title decider) */
  importance?: number;
  /** Games played in last 7 days (1 = normal, 2+ = congestion) */
  matchesLast7Days?: number;
  /** Strong home crowd (true adds 5 % attack boost) */
  strongCrowd?: boolean;
};

export type PredictionConfig = {
  homeAdvantage: number;
  rho: number;
  maxGoals: number;
  formWeight: number;
  lambdaMin: number;
  lambdaMax: number;
};

export type ScorelineProbability = {
  home: number;
  away: number;
  probability: number;
};

export type PredictionResult = {
  homeWin: number;
  draw: number;
  awayWin: number;
  lambdaHome: number;
  lambdaAway: number;
  topScorelines: ScorelineProbability[];
  scoreMatrix: number[][];
  /** Multiplier breakdowns for transparency */
  contextMultipliers?: { home: ContextBreakdown; away: ContextBreakdown };
};

export type ContextBreakdown = {
  playerReturn: number;
  missingPlayer: number;
  motivation: number;
  importanceAttack: number;
  importanceDefense: number;
  fatigue: number;
  crowd: number;
  totalAttack: number;
  totalDefense: number;
};

const DEFAULT_CONFIG: PredictionConfig = {
  homeAdvantage: 1.2,
  rho: -0.1,
  maxGoals: 5,
  formWeight: 0.3,
  lambdaMin: 0.2,
  lambdaMax: 3.5,
};

// ── Helpers ──

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPMF(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

function dixonColesTau(
  hg: number, ag: number, lh: number, la: number, rho: number,
): number {
  if (hg === 0 && ag === 0) return 1 - lh * la * rho;
  if (hg === 1 && ag === 0) return 1 + la * rho;
  if (hg === 0 && ag === 1) return 1 + lh * rho;
  if (hg === 1 && ag === 1) return 1 - rho;
  return 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function blendedRate(
  seasonTotal: number, seasonMatches: number,
  recentTotal?: number, recentMatches?: number, formWeight = 0.3,
): number {
  const seasonRate = seasonMatches > 0 ? seasonTotal / seasonMatches : 1;
  if (recentTotal != null && recentMatches != null && recentMatches > 0) {
    const recentRate = recentTotal / recentMatches;
    return (1 - formWeight) * seasonRate + formWeight * recentRate;
  }
  return seasonRate;
}

// ── Context multiplier calculation ──

function computeContext(ctx?: MatchContext): ContextBreakdown {
  if (!ctx) {
    return {
      playerReturn: 1, missingPlayer: 1, motivation: 1,
      importanceAttack: 1, importanceDefense: 1,
      fatigue: 1, crowd: 1, totalAttack: 1, totalDefense: 1,
    };
  }

  // Player return: impact = 1 + (rating * availability * 0.1)
  const playerReturn = 1 + ((ctx.playerReturnRating ?? 0) * (ctx.playerReturnAvailability ?? 0) * 0.1);

  // Missing player: loss = 1 - (rating * 0.15)
  const missingPlayer = 1 - ((ctx.missingPlayerRating ?? 0) * 0.15);

  // Motivation: 1 + 0.05*rivalry + 0.03*revenge
  const motivation = 1 + (0.05 * (ctx.rivalryFlag ?? 0)) + (0.03 * (ctx.revengeFlag ?? 0));

  // Importance: attack boost & defense risk
  const imp = ctx.importance ?? 0;
  const importanceAttack = 1 + (0.1 * imp);
  const importanceDefense = 1 + (0.05 * imp);

  // Fatigue: max(0.8, 1 - 0.05 * (matches_last_7 - 1))
  const matchesLast7 = ctx.matchesLast7Days ?? 1;
  const fatigue = Math.max(0.8, 1 - 0.05 * (matchesLast7 - 1));

  // Crowd: 1.05 for strong home
  const crowd = ctx.strongCrowd ? 1.05 : 1;

  // Combine attack factors (clamped 0.6–1.6)
  const rawAttack = playerReturn * missingPlayer * motivation * importanceAttack * fatigue * crowd;
  const totalAttack = clamp(rawAttack, 0.6, 1.6);

  // Combine defense factors (opponent defense risk) — clamped same
  const rawDefense = missingPlayer * importanceDefense * fatigue;
  const totalDefense = clamp(rawDefense, 0.6, 1.6);

  return {
    playerReturn, missingPlayer, motivation,
    importanceAttack, importanceDefense,
    fatigue, crowd, totalAttack, totalDefense,
  };
}

// ── Auto-infer context from stats ──

/** Derive reasonable context values from available team stats */
export function inferContext(
  team: TeamInput,
  opponent: TeamInput,
  isHome: boolean,
): MatchContext {
  const gfPerGame = team.matchesPlayed > 0 ? team.goalsScored / team.matchesPlayed : 1;
  const gaPerGame = team.matchesPlayed > 0 ? team.goalsConceded / team.matchesPlayed : 1;
  const oppGfPerGame = opponent.matchesPlayed > 0 ? opponent.goalsScored / opponent.matchesPlayed : 1;

  // Importance: closer teams in strength → higher importance
  const strengthDiff = Math.abs(gfPerGame - oppGfPerGame);
  const importance = clamp(1 - strengthDiff / 2, 0, 1);

  // Crowd effect for home team
  const strongCrowd = isHome;

  // Fatigue proxy: more matches → more likely congested
  const matchesLast7 = team.matchesPlayed > 20 ? 2 : 1;

  // Motivation: if team concedes more than scores → revenge/fight mode
  const revengeFlag = gaPerGame > gfPerGame ? 1 : 0;

  return {
    importance,
    strongCrowd,
    matchesLast7Days: matchesLast7,
    revengeFlag,
    rivalryFlag: 0,
  };
}

// ── Main prediction ──

export function predictMatch(
  home: TeamInput,
  away: TeamInput,
  leagueAvgGoals?: number,
  config?: Partial<PredictionConfig>,
  homeContext?: MatchContext,
  awayContext?: MatchContext,
): PredictionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const avgGoals = leagueAvgGoals ?? (
    (home.goalsScored + home.goalsConceded + away.goalsScored + away.goalsConceded) /
    (2 * (home.matchesPlayed + away.matchesPlayed)) || 1.3
  );

  // Attack & Defense strengths
  const homeAttack = blendedRate(
    home.goalsScored, home.matchesPlayed,
    home.recentGoalsScored, home.recentMatches, cfg.formWeight,
  ) / avgGoals;

  const homeDefense = blendedRate(
    home.goalsConceded, home.matchesPlayed,
    home.recentGoalsConceded, home.recentMatches, cfg.formWeight,
  ) / avgGoals;

  const awayAttack = blendedRate(
    away.goalsScored, away.matchesPlayed,
    away.recentGoalsScored, away.recentMatches, cfg.formWeight,
  ) / avgGoals;

  const awayDefense = blendedRate(
    away.goalsConceded, away.matchesPlayed,
    away.recentGoalsConceded, away.recentMatches, cfg.formWeight,
  ) / avgGoals;

  // Context multipliers (auto-infer if not provided)
  const hCtx = computeContext(homeContext ?? inferContext(home, away, true));
  const aCtx = computeContext(awayContext ?? inferContext(away, home, false));

  // Expected goals with context
  // lambda_home = base * attack_factors_home * defense_factors_away
  let lambdaHome = homeAttack * awayDefense * avgGoals * cfg.homeAdvantage * hCtx.totalAttack * aCtx.totalDefense;
  let lambdaAway = awayAttack * homeDefense * avgGoals * aCtx.totalAttack * hCtx.totalDefense;

  lambdaHome = clamp(lambdaHome, cfg.lambdaMin, cfg.lambdaMax);
  lambdaAway = clamp(lambdaAway, cfg.lambdaMin, cfg.lambdaMax);

  // Score matrix
  const n = cfg.maxGoals + 1;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const tau = dixonColesTau(i, j, lambdaHome, lambdaAway, cfg.rho);
      matrix[i][j] = poissonPMF(lambdaHome, i) * poissonPMF(lambdaAway, j) * tau;
    }
  }

  const total = matrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

  let homeWin = 0, draw = 0, awayWin = 0;
  const scorelines: ScorelineProbability[] = [];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const p = matrix[i][j] / total;
      matrix[i][j] = p;
      scorelines.push({ home: i, away: j, probability: p });
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
    }
  }

  scorelines.sort((a, b) => b.probability - a.probability);

  return {
    homeWin: homeWin * 100,
    draw: draw * 100,
    awayWin: awayWin * 100,
    lambdaHome,
    lambdaAway,
    topScorelines: scorelines.slice(0, 5),
    scoreMatrix: matrix,
    contextMultipliers: { home: hCtx, away: aCtx },
  };
}

export function computeLeagueAvgGoals(
  matches: { ft_home_goals: number; ft_away_goals: number }[],
): number {
  if (matches.length === 0) return 1.3;
  const totalGoals = matches.reduce((s, m) => s + (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0), 0);
  return totalGoals / (2 * matches.length);
}
