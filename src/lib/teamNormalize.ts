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
  // Short forms / diacritic / prefix / case variants found across leagues
  // (results feed + standings), each mapped to the canonical team name so
  // useTeamMatches + getTeamMatchView pick up recent fixtures and distinct
  // clubs never merge.
  "Hull": "Hull City",
  "Ipswich": "Ipswich Town",
  "Coventry": "Coventry City",
  "Cardiff": "Cardiff City",
  "Norwich": "Norwich City",
  "Swansea": "Swansea City",
  "Derby": "Derby County",
  "Blackburn": "Blackburn Rovers",
  "Bournemouth": "AFC Bournemouth",
  "Austin": "Austin FC",
  "Charlotte": "Charlotte FC",
  "Pafos": "Pafos FC",
  "Groningen": "FC Groningen",
  "Twente": "FC Twente",
  "Utrecht": "FC Utrecht",
  "Heerenveen": "SC Heerenveen",
  "AS Roma": "Roma",
  "FC Augsburg": "Augsburg",
  "SC Freiburg": "Freiburg",
  "SC Braga": "Braga",
  "FC Lugano": "Lugano",
  "SV Elversberg": "Elversberg",
  "Orlando City SC": "Orlando City",
  "Atlanta United FC": "Atlanta United",
  "Minnesota United FC": "Minnesota United",
  "Chicago Fire": "Chicago Fire FC",
  "Houston Dynamo": "Houston Dynamo FC",
  "Seattle Sounders": "Seattle Sounders FC",
  "Inter Miami CF": "Inter Miami",
  "Malaga": "Málaga",
  "Deportivo Alaves": "Deportivo Alavés",
  "Famalicao": "Famalicão",
  "Vitoria de Guimaraes": "Vitória de Guimarães",
  "Sudtirol": "Südtirol",
  "Ferencvaros": "Ferencváros",
  "Viktoria Plzen": "Viktoria Plzeň",
  "Malmo FF": "Malmö FF",
  "IFK Goteborg": "IFK Göteborg",
  "GIL Vicente": "Gil Vicente",
  "GO Ahead Eagles": "Go Ahead Eagles",
  "Gais": "GAIS",
  "CF Montreal": "CF Montréal",
  "Heart Of Midlothian": "Heart of Midlothian",
  "ST Johnstone": "St. Johnstone",
  "ST Mirren": "St. Mirren",
  "Union St. Gilloise": "Union St.Gilloise",
  "Man Utd": "Manchester United",
  "Preston": "Preston North End",
  "QPR": "Queens Park Rangers",
  "Stoke": "Stoke City",
  "Birmingham": "Birmingham City",
  "Bolton": "Bolton Wanderers",
  "Wigan": "Wigan Athletic",
  "Huddersfield": "Huddersfield Town",
  "Luton": "Luton Town",
  "Ath Madrid": "Atlético Madrid",
  "Ath Bilbao": "Athletic Club",
  "AIK Stockholm": "AIK",
  "FC Barcelona": "Barcelona",
  "Barcelona FC": "Barcelona",
  "Barça": "Barcelona",
  "Liverpool FC": "Liverpool",
  "Celta": "Celta Vigo",
  "Betis": "Real Betis",
  "Sociedad": "Real Sociedad",
  "Alaves": "Deportivo Alavés",
  "Deportivo La Coruña": "Deportivo La Coruña",
  "Deportivo A Coruña": "Deportivo La Coruña",
  "Dep. La Coruna": "Deportivo La Coruña",
};

const aliasKey = (name: string) => name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const ALIAS_LOOKUP = new Map(Object.entries(ALIASES).flatMap(([alias, canonical]) => [
  [aliasKey(alias), canonical] as const,
  [aliasKey(canonical), canonical] as const,
]));

export function normalizeTeamName(name: string): string {
  const trimmed = (name ?? "").trim();
  return ALIAS_LOOKUP.get(aliasKey(trimmed)) ?? trimmed;
}


/**
 * Aggressive canonical key used purely for deduplication.
 * Strips generic club-type tokens ("FC", "AFC", "SC"…), lowercases and removes
 * punctuation/diacritics. Distinguishing words such as "City", "United",
 * "Town" or "Rovers" are KEPT — otherwise Manchester City and Manchester
 * United would collapse into a single team.
 */
export function canonicalTeamKey(name: string): string {
  let s = normalizeTeamName(name).toLowerCase();
  // Strip diacritics
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Remove punctuation
  s = s.replace(/[.''&-]/g, " ");
  // Unify abbreviations
  s = s.replace(/\butd\b/g, "united");
  // Strip common club-type prefixes
  s = s.replace(/^(afc|ac|fc|sc|sv|sk|as|us|ss|cf|cd|rc|cs)\s+/i, "");
  // Strip common club-type suffixes (run twice for "… Wanderers FC")
  for (let i = 0; i < 2; i++) {
    // SC can identify a DIFFERENT club (Barcelona SC), not a spelling variant.
    s = s.replace(/\s+(fc|afc|cf|de futbol)$/i, "");
  }
  s = s.replace(/\s+hotspur$/i, "");
  s = s.replace(/\s+(and\s+)?hove\s+albion$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Lowercase, accent-free, punctuation-free form used for searching. */
export function searchableTeamName(name: string): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Slang / nickname search terms → canonical team name (search only). */
const NICKNAMES: Record<string, string[]> = {
  "Manchester City": ["man city", "city", "mcfc", "citizens"],
  "Manchester United": ["man united", "man utd", "man u", "manu", "mufc", "red devils", "united"],
  "Liverpool": ["lfc", "pool", "the reds", "liverpool fc"],
  "Arsenal": ["gunners", "afc"],
  "Chelsea": ["blues", "cfc"],
  "Tottenham": ["spurs", "thfc", "tottenham hotspur"],
  "Newcastle": ["toon", "magpies", "nufc"],
  "West Ham": ["hammers", "irons"],
  "Everton": ["toffees"],
  "Aston Villa": ["villa", "avfc"],
  "Wolverhampton Wanderers": ["wolves"],
  "Nottingham Forest": ["forest", "nffc"],
  "Brighton": ["seagulls", "bha"],
  "Barcelona": ["barca", "fcb"],
  "Real Madrid": ["real", "madrid", "los blancos"],
  "Atlético Madrid": ["atleti"],
  "Juventus": ["juve"],
  "Inter": ["inter milan", "nerazzurri"],
  "Milan": ["ac milan", "rossoneri"],
  "Bayern München": ["bayern munich", "fcb", "bayern"],
  "Dortmund": ["bvb", "borussia dortmund"],
  "Borussia Mönchengladbach": ["gladbach"],
  "Paris Saint Germain": ["psg", "paris"],
  "Inter Miami": ["miami"],
};

/**
 * Does a team match a user's search query? Accent-, alias- and
 * nickname-insensitive, so "atletico" finds "Atlético Madrid" and
 * "man city" / "mcfc" find "Manchester City".
 */
export function matchesTeamQuery(team: string, query: string): boolean {
  const q = searchableTeamName(query);
  if (!q) return true;
  const canonical = normalizeTeamName(team);
  const nicks = NICKNAMES[canonical] ?? [];
  const names = [team, ...getTeamAliases(team), ...nicks].map(searchableTeamName);
  if (nicks.some((n) => searchableTeamName(n).startsWith(q))) return true;
  const haystack = names.join(" | ");
  return q.split(" ").every((word) => haystack.includes(word));
}


/** Get all name variants for a team (canonical + aliases) */
export function getTeamAliases(teamName: string): string[] {
  const canonical = normalizeTeamName(teamName);
  const key = canonicalTeamKey(canonical);
  const aliases = Object.entries(ALIASES)
    .filter(([, v]) => canonicalTeamKey(v) === key)
    .map(([k]) => k);
  return [...new Set([teamName.trim(), canonical, ...aliases, `${canonical} FC`, `FC ${canonical}`])];
}

/** Only concrete teams, not unassigned cup slots such as Barcelona/Atletico. */
export function isConcreteTeam(name: string): boolean {
  return !!name.trim() && !/[\/]/.test(name) && !/^(tbd|tbc|winner\b|loser\b|to be)/i.test(name.trim());
}

export function uniqueTeamNames(names: string[]): string[] {
  const teams = new Map<string, string>();
  for (const name of names) {
    if (!isConcreteTeam(name)) continue;
    const display = normalizeTeamName(name);
    const key = canonicalTeamKey(display);
    const existing = teams.get(key);
    if (!existing || display.length < existing.length) teams.set(key, display);
  }
  return [...teams.values()].sort((a, b) => a.localeCompare(b));
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
  "UEFA Super Cup",
  "UEFA Nations League",
  "Euro Qualification",
  "World Cup",
  "World Cup Qualification",
  "Euros",
  "AFCON",
  "Asian Cup",
  "CONCACAF Gold Cup",
  "CONCACAF Nations League",
  "CONCACAF Champions Cup",
  "AFC Champions League",
  "AFC Champions League Two",
  "CAF Champions League",
  "Copa Libertadores",
  "Copa Sudamericana",
  "FIFA Club World Cup",
  "FIFA Intercontinental Cup",
  "Copa America",
  "Club Friendlies",
  "International",
  // Domestic cups
  "EFL Cup",
  "FA Cup",
  "Community Shield",
  "Copa del Rey",
  "Spanish Super Cup",
  "Coppa Italia",
  "Italian Super Cup",
  "DFB Pokal",
  "Coupe de France",
  "French Super Cup",
  "Taça de Portugal",
  "Turkish Cup",
  "Scottish Cup",
  "Copa do Brasil",
  "US Open Cup",
  "Leagues Cup",
];


export function isTournamentLeague(leagueName: string): boolean {
  return TOURNAMENT_LEAGUES.some(t => leagueName === t);
}

/**
 * Canonical league names. The same league_code can appear under multiple names
 * across data sources/seasons (e.g. "Super Lig" vs "Süper Lig", "Champions League"
 * vs "UEFA Champions League"). Map every known variant to the current canonical
 * name so match history isn't fragmented and the Games page doesn't split one
 * league into duplicate sections.
 */
const LEAGUE_NAME_CANON: Record<string, string> = {
  "Super Lig": "Süper Lig",
  "Champions League": "UEFA Champions League",
  "Europa League": "UEFA Europa League",
  "Conference League": "UEFA Conference League",
};

export function normalizeLeagueName(leagueCode: string, name: string): string {
  return LEAGUE_NAME_CANON[name] ?? name;
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
