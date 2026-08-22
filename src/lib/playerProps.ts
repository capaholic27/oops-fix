/**
 * Player-level prediction helpers.
 *
 * Two jobs:
 *  1. Turn a squad + a list of unavailable players into attack/defense
 *     multipliers that feed the Dixon-Coles context model.
 *  2. Derive player prop probabilities (anytime scorer, assist, card,
 *     foul-prone) from per-90 rates and the team's projected xG.
 */

import type { RealPlayer } from "@/hooks/useTeamPlayers";

export type PredictionMode = "full" | "players" | "both";

export type LineupImpact = {
  /** Multiplier applied to the team's expected goals (≤ 1 when attackers are out) */
  attackMultiplier: number;
  /** Multiplier applied to the OPPONENT's expected goals (≥ 1 when defenders are out) */
  concedeMultiplier: number;
  /** 0-1 rating of the biggest missing contributor, for the AI context block */
  missingRating: number;
  /** Human-readable summary lines */
  notes: string[];
};

const ATTACK_POS = ["f", "st", "cf", "lw", "rw", "w", "am", "fw", "attacker", "forward"];
const DEF_POS = ["d", "cb", "lb", "rb", "wb", "def", "defender", "gk", "g", "keeper", "goalkeeper"];

function isAttacker(pos: string | null): boolean {
  const p = (pos || "").toLowerCase();
  return ATTACK_POS.some((k) => p === k || p.includes(k));
}

function isDefensive(pos: string | null): boolean {
  const p = (pos || "").toLowerCase();
  return DEF_POS.some((k) => p === k || p.includes(k));
}

/** Share of the squad's goal involvements owned by each player (0-1). */
export function goalShare(players: RealPlayer[]): Map<string, number> {
  const weight = (p: RealPlayer) => p.goals + 0.5 * p.assists;
  const total = players.reduce((s, p) => s + weight(p), 0);
  const map = new Map<string, number>();
  for (const p of players) map.set(p.name, total > 0 ? weight(p) / total : 0);
  return map;
}

/**
 * Impact of an unavailable list on the team's projected goals.
 * Attack loss scales with the missing players' share of goal involvements;
 * defensive absences leak goals at a flat per-player rate.
 */
export function computeLineupImpact(
  players: RealPlayer[],
  unavailable: Set<string>,
): LineupImpact {
  if (players.length === 0 || unavailable.size === 0) {
    return { attackMultiplier: 1, concedeMultiplier: 1, missingRating: 0, notes: [] };
  }

  const shares = goalShare(players);
  const out = players.filter((p) => unavailable.has(p.name));

  let lostShare = 0;
  let defOut = 0;
  const notes: string[] = [];

  for (const p of out) {
    const share = shares.get(p.name) ?? 0;
    if (isDefensive(p.position)) defOut += 1;
    else lostShare += share;
    if (isAttacker(p.position) || share > 0.12) {
      notes.push(`${p.name} out — ${(share * 100).toFixed(0)}% of goal involvements`);
    } else {
      notes.push(`${p.name} (${p.position || "squad"}) unavailable`);
    }
  }

  // A team never loses more than ~45 % of its output, even if the whole front line is out.
  const attackMultiplier = clamp(1 - 0.75 * Math.min(lostShare, 0.6), 0.55, 1);
  const concedeMultiplier = clamp(1 + 0.06 * defOut, 1, 1.3);

  const biggest = out.reduce((m, p) => Math.max(m, shares.get(p.name) ?? 0), 0);

  return {
    attackMultiplier,
    concedeMultiplier,
    missingRating: clamp(biggest * 1.6, 0, 1),
    notes,
  };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export type PlayerProp = {
  player: string;
  team: string;
  photo: string | null;
  position: string | null;
  /** Probability 0-100 */
  anytimeScorer: number;
  assist: number;
  scoreOrAssist: number;
  yellowCard: number;
  /** Fouls expected in the match — drives the "likely to be warned" call */
  expectedFouls: number;
};

/**
 * Player props from per-appearance rates scaled to the team's projected xG.
 * Poisson: P(at least one) = 1 - exp(-expected).
 */
export function computePlayerProps(
  players: RealPlayer[],
  teamName: string,
  teamLambda: number,
  availabilityFilter: Set<string>,
): PlayerProp[] {
  const eligible = players.filter((p) => !availabilityFilter.has(p.name) && p.appearances > 0);
  if (eligible.length === 0) return [];

  const shares = goalShare(eligible);
  const totalGoals = eligible.reduce((s, p) => s + p.goals, 0);
  const totalAssists = eligible.reduce((s, p) => s + p.assists, 0);

  return eligible
    .map((p) => {
      const goalRate = totalGoals > 0 ? p.goals / totalGoals : (shares.get(p.name) ?? 0);
      const assistRate = totalAssists > 0 ? p.assists / totalAssists : 0;

      const expGoals = teamLambda * goalRate;
      // Assists track goals scored by team-mates
      const expAssists = teamLambda * 0.72 * assistRate;
      const expYellow = p.yellow / p.appearances;
      const expFouls = p.fouls / p.appearances;

      const atLeastOne = (x: number) => (1 - Math.exp(-Math.max(0, x))) * 100;

      const scorer = atLeastOne(expGoals);
      const assist = atLeastOne(expAssists);

      return {
        player: p.name,
        team: teamName,
        photo: p.photo,
        position: p.position,
        anytimeScorer: scorer,
        assist,
        scoreOrAssist: (1 - (1 - scorer / 100) * (1 - assist / 100)) * 100,
        yellowCard: atLeastOne(expYellow),
        expectedFouls: expFouls,
      };
    })
    .sort((a, b) => b.scoreOrAssist - a.scoreOrAssist);
}
