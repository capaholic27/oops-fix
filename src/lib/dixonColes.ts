/**
 * Dixon-Coles Match Prediction Engine
 * Uses Poisson distribution with Dixon-Coles low-score correction.
 */

export type TeamInput = {
  goalsScored: number;       // total goals scored
  goalsConceded: number;     // total goals conceded
  matchesPlayed: number;
  // Optional: home/away splits
  homeGoalsScored?: number;
  homeGoalsConceded?: number;
  homeMatches?: number;
  awayGoalsScored?: number;
  awayGoalsConceded?: number;
  awayMatches?: number;
  // Optional: last-5 form (same shape)
  recentGoalsScored?: number;
  recentGoalsConceded?: number;
  recentMatches?: number;
};

export type PredictionConfig = {
  homeAdvantage: number;  // default 1.2
  rho: number;            // Dixon-Coles correction, default -0.1
  maxGoals: number;       // default 5
  formWeight: number;     // weight for recent form, default 0.3
  lambdaMin: number;      // clamp min, default 0.2
  lambdaMax: number;      // clamp max, default 3.5
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
};

const DEFAULT_CONFIG: PredictionConfig = {
  homeAdvantage: 1.2,
  rho: -0.1,
  maxGoals: 5,
  formWeight: 0.3,
  lambdaMin: 0.2,
  lambdaMax: 3.5,
};

/** Factorial (small n only) */
function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Poisson PMF: P(X=k) = (λ^k * e^-λ) / k! */
function poissonPMF(lambda: number, k: number): number {
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/** Dixon-Coles correction factor τ for low scores */
function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - lambdaHome * lambdaAway * rho;
  }
  if (homeGoals === 1 && awayGoals === 0) {
    return 1 + lambdaAway * rho;
  }
  if (homeGoals === 0 && awayGoals === 1) {
    return 1 + lambdaHome * rho;
  }
  if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  return 1;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Compute blended goals-per-game using season + recent form.
 */
function blendedRate(
  seasonTotal: number,
  seasonMatches: number,
  recentTotal?: number,
  recentMatches?: number,
  formWeight = 0.3,
): number {
  const seasonRate = seasonMatches > 0 ? seasonTotal / seasonMatches : 1;
  if (recentTotal != null && recentMatches != null && recentMatches > 0) {
    const recentRate = recentTotal / recentMatches;
    return (1 - formWeight) * seasonRate + formWeight * recentRate;
  }
  return seasonRate;
}

/**
 * Main prediction function.
 * 
 * @param home - Home team stats
 * @param away - Away team stats
 * @param leagueAvgGoals - League average goals per team per game (typically ~1.3-1.5)
 * @param config - Optional configuration overrides
 */
export function predictMatch(
  home: TeamInput,
  away: TeamInput,
  leagueAvgGoals?: number,
  config?: Partial<PredictionConfig>,
): PredictionResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate league average from both teams if not provided
  const avgGoals = leagueAvgGoals ?? (
    (home.goalsScored + home.goalsConceded + away.goalsScored + away.goalsConceded) /
    (2 * (home.matchesPlayed + away.matchesPlayed)) || 1.3
  );

  // ── Attack & Defense strengths ──
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

  // ── Expected goals (λ) ──
  let lambdaHome = homeAttack * awayDefense * avgGoals * cfg.homeAdvantage;
  let lambdaAway = awayAttack * homeDefense * avgGoals;

  lambdaHome = clamp(lambdaHome, cfg.lambdaMin, cfg.lambdaMax);
  lambdaAway = clamp(lambdaAway, cfg.lambdaMin, cfg.lambdaMax);

  // ── Score matrix with Dixon-Coles correction ──
  const n = cfg.maxGoals + 1;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const pHome = poissonPMF(lambdaHome, i);
      const pAway = poissonPMF(lambdaAway, j);
      const tau = dixonColesTau(i, j, lambdaHome, lambdaAway, cfg.rho);
      matrix[i][j] = pHome * pAway * tau;
    }
  }

  // ── Normalize matrix (tau can make total != 1) ──
  const total = matrix.reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
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
  };
}

/**
 * Compute league average goals per team per game from match data.
 */
export function computeLeagueAvgGoals(
  matches: { ft_home_goals: number; ft_away_goals: number }[],
): number {
  if (matches.length === 0) return 1.3;
  const totalGoals = matches.reduce((s, m) => s + (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0), 0);
  return totalGoals / (2 * matches.length);
}
