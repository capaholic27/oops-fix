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
  // European club competitions
  { id: 42,    code: "UCL",   name: "UEFA Champions League"  },
  { id: 73,    code: "UEL",   name: "UEFA Europa League"     },
  { id: 10216, code: "UECL",  name: "UEFA Conference League" },
  // International tournaments
  { id: 77,    code: "WC",    name: "World Cup"              },
  { id: 50,    code: "EURO",  name: "Euros"                  },
  { id: 44,    code: "COPA",  name: "Copa America"           },
  { id: 6427,  code: "AFCON", name: "AFCON"                  },
  { id: 78,    code: "CWC",   name: "FIFA Club World Cup"    },
  { id: 10204, code: "UNL",   name: "UEFA Nations League"    },
  // International & friendly matches (Pro-only)
  { id: 114,    code: "INTL",  name: "International"           }, // national-team friendlies
  { id: 489,    code: "FRLY",  name: "Friendlies"             }, // club friendlies
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
  match_id?: number | string;
};

export type FotmobMatchStats = {
  home_corners: number;
  away_corners: number;
  home_yellows: number;
  away_yellows: number;
  home_reds: number;
  away_reds: number;
  home_fouls: number;
  away_fouls: number;
  home_shots: number;
  away_shots: number;
  home_shots_target: number;
  away_shots_target: number;
  has_stats: boolean;
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
          match_id: m?.id,
        });
      }
    }
  }

  return { fixtures, results };
}

/**
 * Pull a single league for a specific historical season (e.g. World Cup 2018).
 * Fotmob accepts ?id={id}&season={year} for past tournaments.
 */
export async function fetchFotmobLeagueSeason(
  league: FotmobLeague,
  season: string | number
): Promise<RawResult[]> {
  try {
    const url = `${FOTMOB_BASE}/leagues?id=${league.id}&season=${encodeURIComponent(String(season))}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) {
      console.warn(`Fotmob ${league.code} season ${season} HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    const matches: any[] = data?.fixtures?.allMatches ?? data?.matches?.allMatches ?? [];
    const out: RawResult[] = [];
    for (const m of matches) {
      const utc: string | undefined = m?.status?.utcTime;
      if (!utc) continue;
      const d = new Date(utc);
      if (isNaN(d.getTime())) continue;
      if (!m?.status?.finished) continue;
      const home = m?.home?.name?.trim();
      const away = m?.away?.name?.trim();
      if (!home || !away) continue;
      const score: string = m?.status?.scoreStr ?? "";
      const parts = score.split(/[-–:]/).map((s: string) => s.trim());
      const hg = Number(parts[0]);
      const ag = Number(parts[1]);
      if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
      out.push({
        league_code: league.code,
        league_name: league.name,
        season: String(season),
        match_date: d.toISOString().slice(0, 10),
        home_team: home,
        away_team: away,
        ft_home_goals: hg,
        ft_away_goals: ag,
        ft_result: hg > ag ? "H" : hg < ag ? "A" : "D",
        match_id: m?.id,
      });
    }
    return out;
  } catch (e) {
    console.warn(`fetchFotmobLeagueSeason ${league.code}/${season} error`, e);
    return [];
  }
}

/**
 * Pull per-match stats (corners, cards, shots, fouls) from Fotmob match details endpoint.
 * Returns null if stats are unavailable or the endpoint fails.
 */
export async function fetchFotmobMatchStats(matchId: number | string): Promise<FotmobMatchStats | null> {
  try {
    const res = await fetch(`${FOTMOB_BASE}/matchDetails?matchId=${matchId}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    // The "content.stats.stats" array contains grouped stat blocks. Each item has
    // { title, stats: [{ title, stats: [home, away], type? }] }
    const blocks: any[] = json?.content?.stats?.stats ?? [];
    const flat: any[] = [];
    for (const b of blocks) {
      if (Array.isArray(b?.stats)) flat.push(...b.stats);
    }
    const grab = (re: RegExp): [number, number] | null => {
      const row = flat.find((s: any) => typeof s?.title === "string" && re.test(s.title));
      if (!row || !Array.isArray(row.stats)) return null;
      const h = Number(row.stats[0]);
      const a = Number(row.stats[1]);
      if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
      return [h, a];
    };

    const corners = grab(/corner/i);
    const yellow  = grab(/yellow/i);
    const red     = grab(/red/i);
    const fouls   = grab(/foul/i);
    const shotsT  = grab(/^total shots$|^shots$/i);
    const sot     = grab(/shots on target|on target/i);

    if (!corners && !yellow && !shotsT && !fouls) return null;

    return {
      home_corners: corners?.[0] ?? 0,
      away_corners: corners?.[1] ?? 0,
      home_yellows: yellow?.[0] ?? 0,
      away_yellows: yellow?.[1] ?? 0,
      home_reds: red?.[0] ?? 0,
      away_reds: red?.[1] ?? 0,
      home_fouls: fouls?.[0] ?? 0,
      away_fouls: fouls?.[1] ?? 0,
      home_shots: shotsT?.[0] ?? 0,
      away_shots: shotsT?.[1] ?? 0,
      home_shots_target: sot?.[0] ?? 0,
      away_shots_target: sot?.[1] ?? 0,
      has_stats: true,
    };
  } catch (e) {
    console.warn(`fetchFotmobMatchStats(${matchId}) failed`, e);
    return null;
  }
}
