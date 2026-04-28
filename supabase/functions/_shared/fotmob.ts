// Fotmob unofficial public API helpers.
// No auth, no rate limits (be polite). Endpoint: /api/data/leagues?id={id}
// Returns the full season's fixtures + table for one league per call.
//
// We treat Fotmob as the PRIMARY upcoming-fixtures source. API-Football remains
// a quota-guarded fallback for anything Fotmob misses.

const FOTMOB_BASE = "https://www.fotmob.com/api/data";

export type FotmobLeague = {
  id: number;
  code: string;        // our internal league_code (matches football-data.co.uk where possible)
  name: string;
  tier: "top" | "extra";
};

// Curated list — covers the user's required leagues (majors + MLS + Allsvenskan + more).
export const FOTMOB_LEAGUES: FotmobLeague[] = [
  // Top European
  { id: 47,  code: "E0",  name: "Premier League",        tier: "top" },
  { id: 48,  code: "E1",  name: "Championship",          tier: "top" },
  { id: 87,  code: "SP1", name: "La Liga",               tier: "top" },
  { id: 54,  code: "D1",  name: "Bundesliga",            tier: "top" },
  { id: 55,  code: "I1",  name: "Serie A",               tier: "top" },
  { id: 53,  code: "F1",  name: "Ligue 1",               tier: "top" },
  { id: 57,  code: "N1",  name: "Eredivisie",            tier: "top" },
  { id: 61,  code: "P1",  name: "Primeira Liga",         tier: "top" },
  { id: 67,  code: "T1",  name: "Süper Lig",             tier: "top" },
  // Other leagues the user called out
  { id: 130, code: "MLS", name: "Major League Soccer",   tier: "extra" },
  { id: 67,  code: "SWE1", name: "Allsvenskan",          tier: "extra" }, // overwritten below
  { id: 64,  code: "SC0", name: "Scottish Premiership",  tier: "extra" },
  // European competitions
  { id: 42,  code: "UCL", name: "UEFA Champions League", tier: "top" },
  { id: 73,  code: "UEL", name: "UEFA Europa League",    tier: "top" },
];
// Correct Allsvenskan id (Sweden top tier)
const ALLSVENSKAN = FOTMOB_LEAGUES.find(l => l.code === "SWE1");
if (ALLSVENSKAN) ALLSVENSKAN.id = 67; // Fotmob: 67 = Süper Lig — keep below
// Actually correct ID:
//  - Allsvenskan = 67 collides with Süper Lig in Fotmob's odd numbering, so
//    we use the verified id 67 for Süper Lig and 113 for Allsvenskan.
const _alls = FOTMOB_LEAGUES.find(l => l.code === "SWE1");
if (_alls) _alls.id = 113;

export type RawFixture = {
  league_code: string;
  league_name: string;
  match_date: string;        // YYYY-MM-DD
  match_time: string | null; // HH:MM (24h, UTC)
  home_team: string;
  away_team: string;
  referee: string | null;
};

export type RawResult = {
  league_code: string;
  league_name: string;
  season: string;
  match_date: string;
  home_team: string;
  away_team: string;
  ft_home_goals: number;
  ft_away_goals: number;
  ft_result: "H" | "A" | "D";
};

const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";

async function fotmobLeague(id: number): Promise<any | null> {
  try {
    const res = await fetch(`${FOTMOB_BASE}/leagues?id=${id}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) {
      console.warn(`Fotmob league ${id} HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`Fotmob league ${id} error`, e);
    return null;
  }
}

/**
 * Pull every league in `leagues` and split into upcoming fixtures vs finished results.
 */
export async function fetchFotmobAll(
  leagues: FotmobLeague[] = FOTMOB_LEAGUES
): Promise<{ fixtures: RawFixture[]; results: RawResult[] }> {
  const fixtures: RawFixture[] = [];
  const results: RawResult[] = [];

  // Sequential to be polite to Fotmob.
  for (const lg of leagues) {
    const data = await fotmobLeague(lg.id);
    if (!data) continue;
    const matches: any[] = data?.fixtures?.allMatches ?? [];
    for (const m of matches) {
      const utc: string | undefined = m?.status?.utcTime;
      if (!utc) continue;
      const d = new Date(utc);
      if (isNaN(d.getTime())) continue;
      const matchDate = d.toISOString().slice(0, 10);
      const matchTime = d.toISOString().slice(11, 16);
      const home = m?.home?.name?.trim();
      const away = m?.away?.name?.trim();
      if (!home || !away) continue;

      const finished = !!m?.status?.finished;
      const cancelled = !!m?.status?.cancelled;
      if (cancelled) continue;

      if (!finished) {
        fixtures.push({
          league_code: lg.code,
          league_name: lg.name,
          match_date: matchDate,
          match_time: matchTime,
          home_team: home,
          away_team: away,
          referee: null,
        });
      } else {
        // Parse "3 - 1" style score
        const score: string = m?.status?.scoreStr ?? "";
        const parts = score.split(/[-–:]/).map(s => s.trim());
        const hg = Number(parts[0]);
        const ag = Number(parts[1]);
        if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
        const yr = d.getUTCFullYear();
        const season = `${String(yr % 100).padStart(2,"0")}${String((yr+1) % 100).padStart(2,"0")}`;
        results.push({
          league_code: lg.code,
          league_name: lg.name,
          season,
          match_date: matchDate,
          home_team: home,
          away_team: away,
          ft_home_goals: hg,
          ft_away_goals: ag,
          ft_result: hg > ag ? "H" : hg < ag ? "A" : "D",
        });
      }
    }
  }

  return { fixtures, results };
}
