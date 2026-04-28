// Fotmob unofficial public API helpers.
// Endpoint: GET https://www.fotmob.com/api/data/leagues?id={id}
// No auth required. Returns full season fixtures + results in one call per league.
// Be polite — call sequentially.

const FOTMOB_BASE = "https://www.fotmob.com/api/data";

export type FotmobLeague = {
  id: number;
  code: string;   // our internal league_code
  name: string;
};

// Verified Fotmob IDs (April 2026).
export const FOTMOB_LEAGUES: FotmobLeague[] = [
  // Top European leagues
  { id: 47,  code: "E0",   name: "Premier League"        },
  { id: 48,  code: "E1",   name: "Championship"          },
  { id: 87,  code: "SP1",  name: "La Liga"               },
  { id: 54,  code: "D1",   name: "Bundesliga"            },
  { id: 55,  code: "I1",   name: "Serie A"               },
  { id: 86,  code: "I2",   name: "Serie B"               },
  { id: 53,  code: "F1",   name: "Ligue 1"               },
  { id: 57,  code: "N1",   name: "Eredivisie"            },
  { id: 61,  code: "P1",   name: "Primeira Liga"         },
  { id: 71,  code: "T1",   name: "Süper Lig"             },
  { id: 64,  code: "SC0",  name: "Scottish Premiership"  },
  // Other leagues the user requested
  { id: 130, code: "MLS",  name: "Major League Soccer"   },
  { id: 67,  code: "SWE1", name: "Allsvenskan"           },
  { id: 113, code: "AUS1", name: "A-League"              },
  // European competitions
  { id: 42,  code: "UCL",  name: "UEFA Champions League" },
  { id: 73,  code: "UEL",  name: "UEFA Europa League"    },
];

export type RawFixture = {
  league_code: string;
  league_name: string;
  match_date: string;        // YYYY-MM-DD (UTC)
  match_time: string | null; // HH:MM (UTC)
  home_team: string;
  away_team: string;
  referee: string | null;
};

export type RawResult = {
  league_code: string;
  league_name: string;
  season: string;            // e.g. "2526"
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
      if (m?.status?.cancelled) continue;

      const finished = !!m?.status?.finished;

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
        const score: string = m?.status?.scoreStr ?? "";
        const parts = score.split(/[-–:]/).map(s => s.trim());
        const hg = Number(parts[0]);
        const ag = Number(parts[1]);
        if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
        const yr = d.getUTCFullYear();
        // Crude season string: matches the format used elsewhere in the project.
        const season = `${String(yr % 100).padStart(2, "0")}${String((yr + 1) % 100).padStart(2, "0")}`;
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
