/**
 * Normalize team name aliases to a canonical form.
 * This prevents duplicates like "Man City" vs "Manchester City".
 */
const ALIASES: Record<string, string> = {
  "Man City": "Manchester City",
  "Man United": "Manchester United",
  "Manchester Utd": "Manchester United",
  "Nott'm Forest": "Nottingham Forest",
  "Nottingham": "Nottingham Forest",
  "Paris SG": "Paris Saint Germain",
  "Paris Saint-Germain": "Paris Saint Germain",
  "PSG": "Paris Saint Germain",
  "Spurs": "Tottenham",
  "Tottenham Hotspur": "Tottenham",
  "Wolves": "Wolverhampton Wanderers",
  "Wolverhampton": "Wolverhampton Wanderers",
  "West Ham United": "West Ham",
  "Leicester City": "Leicester",
  "Leeds United": "Leeds",
  "Newcastle United": "Newcastle",
  "Newcastle Utd": "Newcastle",
  "Brighton & Hove Albion": "Brighton",
  "Brighton and Hove Albion": "Brighton",
  "Sheffield Utd": "Sheffield United",
  "Sheffield Wed": "Sheffield Wednesday",
  "West Brom": "West Bromwich Albion",
  "West Bromwich": "West Bromwich Albion",
  "Atletico Madrid": "Atlético Madrid",
  "Atletico": "Atlético Madrid",
  "Athletic Bilbao": "Athletic Club",
  "Inter Milan": "Inter",
  "Internazionale": "Inter",
  "AC Milan": "Milan",
  "Borussia Dortmund": "Dortmund",
  "Borussia M'gladbach": "Borussia Mönchengladbach",
  "Borussia Monchengladbach": "Borussia Mönchengladbach",
  "M'gladbach": "Borussia Mönchengladbach",
  "Bayern Munich": "Bayern München",
  "Bayern": "Bayern München",
  "RB Leipzig": "Leipzig",
  "Leverkusen": "Bayer Leverkusen",
  "St Etienne": "Saint-Étienne",
  "St. Etienne": "Saint-Étienne",
};

export function normalizeTeamName(name: string): string {
  return ALIASES[name] ?? name;
}

/**
 * Aggressive canonical key used purely for deduplication.
 * Strips suffixes ("FC", "AFC", "United", "Hotspur", "& Hove Albion"…),
 * lowercases, removes punctuation/diacritics. Two names that map to the
 * same key are considered the same club.
 */
export function canonicalTeamKey(name: string): string {
  let s = normalizeTeamName(name).toLowerCase();
  // Strip diacritics
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Remove punctuation
  s = s.replace(/[.''&]/g, " ");
  // Strip common prefixes
  s = s.replace(/^(afc|ac|fc|sc|sv|sk|as|us|ss|cf|cd|rc|cs)\s+/i, "");
  // Strip common suffixes (run twice to catch "Wolverhampton Wanderers FC")
  for (let i = 0; i < 2; i++) {
    s = s.replace(/\s+(fc|afc|cf|sc|sv|sk|hotspur|wanderers|albion|united|utd|city|town|county|rovers|athletic|club|de futbol)$/i, "");
  }
  s = s.replace(/\s+and\s+hove\s+albion$/i, "");
  s = s.replace(/\s+&\s+hove\s+albion$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Get all name variants for a team (canonical + aliases) */
export function getTeamAliases(teamName: string): string[] {
  const canonical = normalizeTeamName(teamName);
  const aliases = Object.entries(ALIASES)
    .filter(([, v]) => v === canonical)
    .map(([k]) => k);
  return [canonical, ...aliases.filter(a => a !== canonical)];
}

/**
 * Leagues that are tournaments (not domestic leagues).
 * Teams in these leagues should not be shown as separate favorites.
 */
export const TOURNAMENT_LEAGUES = [
  "Champions League",
  "Europa League",
  "Conference League",
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Conference League",
  "UEFA Nations League",
  "World Cup",
  "Euros",
  "AFCON",
  "FIFA Club World Cup",
  "Copa America",
];

export function isTournamentLeague(leagueName: string): boolean {
  return TOURNAMENT_LEAGUES.some(t => leagueName === t);
}

/**
 * Given a list of form results, compute a "mentality" label and description.
 * Based on patterns in the last 5-10 results.
 */
export type MentalityResult = {
  label: string;
  emoji: string;
  description: string;
  intensity: number; // 0-100
};

export function computeMentality(form: ("W" | "D" | "L")[]): MentalityResult {
  if (form.length === 0) {
    return { label: "Unknown", emoji: "❓", description: "No data", intensity: 0 };
  }

  const last5 = form.slice(-5);
  const last10 = form.slice(-10);

  const recentWins = last5.filter(r => r === "W").length;
  const recentLosses = last5.filter(r => r === "L").length;
  const recentDraws = last5.filter(r => r === "D").length;

  const longerWins = last10.filter(r => r === "W").length;
  const longerLosses = last10.filter(r => r === "L").length;

  // Check for streaks
  const lastResults = [...last5].reverse();
  let winStreak = 0;
  let lossStreak = 0;
  let unbeatenStreak = 0;
  for (const r of lastResults) {
    if (r === "W") winStreak++; else break;
  }
  for (const r of lastResults) {
    if (r === "L") lossStreak++; else break;
  }
  for (const r of lastResults) {
    if (r !== "L") unbeatenStreak++; else break;
  }

  // Check if bouncing back: lost then won
  const bouncingBack = last5.length >= 3 && lastResults[0] === "W" && lastResults.slice(1, 4).filter(r => r === "L").length >= 2;

  // Determine mentality
  if (winStreak >= 4) {
    return { label: "Dominant", emoji: "🔥", description: `${winStreak}-win streak. Peak confidence and ruthless form.`, intensity: 95 };
  }
  if (winStreak >= 3) {
    return { label: "Killer Instinct", emoji: "⚡", description: `${winStreak} wins in a row. High momentum and clinical edge.`, intensity: 85 };
  }
  if (lossStreak >= 3) {
    return { label: "Crisis Mode", emoji: "🆘", description: `${lossStreak} straight losses. Confidence shattered, desperate for a result.`, intensity: 90 };
  }
  if (lossStreak === 2) {
    return { label: "Revenge Mentality", emoji: "😤", description: "Back-to-back losses fuel anger and urgency. Expect a fierce response.", intensity: 80 };
  }
  if (bouncingBack) {
    return { label: "Comeback Mentality", emoji: "💪", description: "Bounced back from defeats. Resilient and refocused.", intensity: 75 };
  }
  if (recentLosses >= 3 && longerWins >= 4) {
    return { label: "Slump Recovery", emoji: "🔄", description: "Recent dip from a stronger run. Capable of returning to form.", intensity: 65 };
  }
  if (unbeatenStreak >= 5) {
    return { label: "Fortress Mentality", emoji: "🏰", description: `${unbeatenStreak} unbeaten. Hard to break down and full of belief.`, intensity: 85 };
  }
  if (recentDraws >= 3) {
    return { label: "Grinding Mentality", emoji: "⚙️", description: "Lots of draws lately. Solid but lacking the killer edge.", intensity: 50 };
  }
  if (recentWins >= 3 && recentLosses >= 1) {
    return { label: "Resilient", emoji: "🛡️", description: "Mostly winning despite the odd setback. Strong character.", intensity: 70 };
  }
  if (longerLosses >= 5) {
    return { label: "Survival Mode", emoji: "🥊", description: "Tough stretch of results. Fighting for every point.", intensity: 85 };
  }
  if (recentWins >= 2 && recentLosses <= 1) {
    return { label: "Confident", emoji: "😎", description: "In good form. Settled and playing with belief.", intensity: 65 };
  }

  return { label: "Balanced", emoji: "⚖️", description: "Mixed results. No clear momentum in either direction.", intensity: 45 };
}
