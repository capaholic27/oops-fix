import type { AggregatedStats, TeamMatchView } from "@/lib/matchStats";

export type StylePrediction = {
  style: string;
  probability: number;
  description: string;
  color: string;
};

/**
 * Context-aware tactical style predictor.
 * Takes into account:
 * - Base tactical profile from stats
 * - Recent form momentum (winning streak → confident/attacking, losing → desperate/pressing)
 * - Team quality tier (dominant vs mid vs weak)
 * - Opponent context if provided (strong opponent → defensive/counter, weak → attacking/reckless)
 * - Cards/fouls trend (heavy cards last game → cautious next)
 */
export function predictNextMatchStyles(
  stats: AggregatedStats,
  views: TeamMatchView[],
  opponentStats?: AggregatedStats | null,
): StylePrediction[] {
  const tp = stats.tacticalProfile;
  const n = stats.matchesPlayed;
  if (n === 0) return defaultPredictions();

  // ── 1. Base scores from tactical profile ──
  let pressing = tp.pressing;
  let attacking = tp.attacking;
  let defensive = tp.defensive;
  let counterAttack = tp.counterAttack;
  let volatile = tp.volatile;
  let reckless = 0;    // new: all-out attack / humiliation mode
  let cautious = 0;    // new: careful after cards

  // ── 2. Form momentum ──
  const last5 = stats.formLast5;
  const recentWins = last5.filter(r => r === "W").length;
  const recentLosses = last5.filter(r => r === "L").length;
  const winStreak = countTrailingStreak(last5, "W");
  const lossStreak = countTrailingStreak(last5, "L");

  // Winning momentum → more confident, more attacking
  if (winStreak >= 3) {
    attacking += 20;
    reckless += 15;
    defensive -= 10;
  } else if (winStreak >= 2) {
    attacking += 10;
  }

  // Losing momentum → desperate, pressing, volatile
  if (lossStreak >= 3) {
    pressing += 25;
    volatile += 20;
    attacking += 10;
    defensive -= 15;
  } else if (lossStreak >= 2) {
    pressing += 15;
    volatile += 10;
  }

  // Mixed form → volatile
  if (recentWins >= 2 && recentLosses >= 2) {
    volatile += 20;
  }

  // ── 3. Team quality tier ──
  const winRate = stats.winProbability;
  const goalsPerGame = stats.goalsFor / n;
  const concededPerGame = stats.goalsAgainst / n;
  const goalDiffPerGame = goalsPerGame - concededPerGame;

  if (winRate > 65 && goalDiffPerGame > 1) {
    // Dominant team
    attacking += 15;
    reckless += 10;
    defensive -= 5;
  } else if (winRate < 30 && goalDiffPerGame < -0.5) {
    // Weak team
    defensive += 20;
    counterAttack += 15;
    cautious += 10;
    attacking -= 10;
  }

  // ── 4. Cards/fouls trend (recent discipline) ──
  const last3 = views.slice(-3);
  if (last3.length > 0) {
    const recentAvgYellows = last3.reduce((s, v) => s + v.yellowCards, 0) / last3.length;
    const recentReds = last3.reduce((s, v) => s + v.redCards, 0);
    
    if (recentAvgYellows > 2.5 || recentReds > 0) {
      // Heavy discipline recently → play cautious
      cautious += 25;
      pressing -= 10;
      reckless -= 10;
    }
    
    // Recent high fouls → pressing team
    const recentAvgFouls = last3.reduce((s, v) => s + v.foulsCommitted, 0) / last3.length;
    if (recentAvgFouls > 14) {
      pressing += 10;
    }
  }

  // ── 5. Opponent context ──
  if (opponentStats && opponentStats.matchesPlayed > 0) {
    const oppWinRate = opponentStats.winProbability;
    const oppGoalDiff = (opponentStats.goalsFor - opponentStats.goalsAgainst) / opponentStats.matchesPlayed;
    const qualityGap = winRate - oppWinRate;

    if (qualityGap > 25) {
      // Much stronger than opponent → attack freely, maybe reckless
      attacking += 20;
      reckless += 25;
      defensive -= 15;
      counterAttack -= 10;
    } else if (qualityGap > 10) {
      // Moderately stronger
      attacking += 10;
      reckless += 5;
    } else if (qualityGap < -25) {
      // Much weaker than opponent → park the bus, counter
      defensive += 25;
      counterAttack += 20;
      attacking -= 15;
      cautious += 15;
    } else if (qualityGap < -10) {
      // Moderately weaker
      defensive += 15;
      counterAttack += 10;
      attacking -= 5;
    }

    // If opponent is also losing → both teams desperate → volatile
    const oppRecentLosses = (opponentStats.formLast5 || []).filter(r => r === "L").length;
    if (recentLosses >= 2 && oppRecentLosses >= 2) {
      volatile += 15;
    }

    // If opponent presses a lot → counter-attack opportunity
    if (opponentStats.tacticalProfile.pressing > 60) {
      counterAttack += 10;
    }
  }

  // ── 6. Clamp and normalize ──
  const styles = [
    { style: "Pressing", score: clamp(pressing), color: "bg-stat-warn", description: generateDescription("pressing", pressing, last5, opponentStats) },
    { style: "Attacking", score: clamp(attacking), color: "bg-stat-positive", description: generateDescription("attacking", attacking, last5, opponentStats) },
    { style: "Defensive", score: clamp(defensive), color: "bg-primary", description: generateDescription("defensive", defensive, last5, opponentStats) },
    { style: "Counter-Attack", score: clamp(counterAttack), color: "bg-accent", description: generateDescription("counter", counterAttack, last5, opponentStats) },
    { style: "Volatile", score: clamp(volatile), color: "bg-stat-negative", description: generateDescription("volatile", volatile, last5, opponentStats) },
    { style: "Reckless Attack", score: clamp(reckless), color: "bg-destructive", description: generateDescription("reckless", reckless, last5, opponentStats) },
    { style: "Cautious", score: clamp(cautious), color: "bg-muted-foreground", description: generateDescription("cautious", cautious, last5, opponentStats) },
  ];

  const total = styles.reduce((s, r) => s + r.score, 0) || 1;
  return styles
    .map(r => ({ ...r, probability: Math.round((r.score / total) * 100) }))
    .filter(r => r.probability >= 5) // hide negligible styles
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5); // top 5
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function countTrailingStreak(form: ("W" | "D" | "L")[], result: "W" | "D" | "L"): number {
  let count = 0;
  for (let i = form.length - 1; i >= 0; i--) {
    if (form[i] === result) count++;
    else break;
  }
  return count;
}

function generateDescription(
  type: string,
  score: number,
  form: ("W" | "D" | "L")[],
  opp?: AggregatedStats | null,
): string {
  const ws = countTrailingStreak(form, "W");
  const ls = countTrailingStreak(form, "L");
  const hasOpp = !!opp;

  switch (type) {
    case "pressing":
      if (ls >= 2) return "Desperate to recover — expect high press, aggressive recoveries, and more fouls";
      if (hasOpp && (opp!.tacticalProfile?.defensive ?? 0) > 60) return "Likely to press against a deep-sitting opponent";
      return "High press, aggressive recoveries, lots of fouls committed";
    case "attacking":
      if (ws >= 3) return "Riding a winning streak — confident, high shot volume, creative play";
      if (hasOpp && opp!.winProbability < 35) return "Facing a weaker side — expect dominant possession and high shots";
      return "Possession-dominant, high shot volume, creative attacking play";
    case "defensive":
      if (hasOpp && opp!.winProbability > 60) return "Facing a strong opponent — likely to sit deep and absorb pressure";
      return "Deep block, low concession rate, solid defensive structure";
    case "counter":
      if (hasOpp && opp!.tacticalProfile?.pressing > 55) return "Opponent presses high — space to exploit on transitions";
      return "Efficient on transitions, clinical finishing from fewer chances";
    case "volatile":
      if (ls >= 2 && ws >= 1) return "Results swinging wildly — anything can happen in the next match";
      return "Unpredictable swings, high-scoring chaotic games expected";
    case "reckless":
      if (ws >= 3) return "On fire — may attack recklessly to humiliate a weaker opponent";
      return "All-out attack with little regard for defensive shape";
    case "cautious":
      return "Playing careful after recent discipline issues — fewer tackles, controlled tempo";
    default:
      return "";
  }
}

function defaultPredictions(): StylePrediction[] {
  return [
    { style: "Unknown", probability: 100, description: "No data available", color: "bg-muted" },
  ];
}
