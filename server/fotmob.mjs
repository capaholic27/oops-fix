// Fotmob unofficial public API helpers — ported from supabase/functions/_shared/fotmob.ts
// Endpoint: GET https://www.fotmob.com/api/data/leagues?id={id}  (no auth required)
const FOTMOB_BASE = "https://www.fotmob.com/api/data";
const UA = "Mozilla/5.0 (compatible; FootballEdgeBot/1.0; +https://lovable.dev)";

async function getJson(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`fotmob ${url} HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`fotmob ${url} error`, e?.message || e);
    return null;
  }
}

export const FOTMOB_LEAGUES = [
  { id: 47, code: "E0", name: "Premier League" },
  { id: 48, code: "E1", name: "Championship" },
  { id: 87, code: "SP1", name: "La Liga" },
  { id: 54, code: "D1", name: "Bundesliga" },
  { id: 55, code: "I1", name: "Serie A" },
  { id: 86, code: "I2", name: "Serie B" },
  { id: 53, code: "F1", name: "Ligue 1" },
  { id: 57, code: "N1", name: "Eredivisie" },
  { id: 61, code: "P1", name: "Primeira Liga" },
  { id: 71, code: "T1", name: "Süper Lig" },
  { id: 64, code: "SC0", name: "Scottish Premiership" },
  { id: 140, code: "SP2", name: "La Liga 2" },
  { id: 146, code: "D2", name: "Bundesliga 2" },
  { id: 40, code: "B1", name: "Belgian Pro League" },
  { id: 135, code: "G1", name: "Super League Greece" },
  { id: 69, code: "SUI1", name: "Swiss Super League" },
  { id: 46, code: "DEN1", name: "Superligaen" },
  { id: 59, code: "NOR1", name: "Eliteserien" },
  { id: 130, code: "MLS", name: "Major League Soccer" },
  { id: 67, code: "SWE1", name: "Allsvenskan" },
  { id: 113, code: "AUS1", name: "A-League" },
  { id: 230, code: "MEX1", name: "Liga MX" },
  { id: 268, code: "BRA1", name: "Brasileirao" },
  { id: 112, code: "ARG1", name: "Liga Profesional" },
  { id: 536, code: "KSA1", name: "Saudi Pro League" },
  { id: 223, code: "JPN1", name: "J1 League" },
  { id: 9080, code: "KOR1", name: "K League 1" },
  { id: 133, code: "ENGLC", name: "EFL Cup" },
  { id: 132, code: "ENGFA", name: "FA Cup" },
  { id: 247, code: "ENGCS", name: "Community Shield" },
  { id: 138, code: "ESPCR", name: "Copa del Rey" },
  { id: 139, code: "ESPSC", name: "Spanish Super Cup" },
  { id: 141, code: "ITACI", name: "Coppa Italia" },
  { id: 222, code: "ITASC", name: "Italian Super Cup" },
  { id: 209, code: "GERDP", name: "DFB Pokal" },
  { id: 134, code: "FRACF", name: "Coupe de France" },
  { id: 207, code: "FRASC", name: "French Super Cup" },
  { id: 186, code: "PORCUP", name: "Taça de Portugal" },
  { id: 151, code: "TURCUP", name: "Turkish Cup" },
  { id: 137, code: "SCOCUP", name: "Scottish Cup" },
  { id: 9067, code: "BRACUP", name: "Copa do Brasil" },
  { id: 9441, code: "USACUP", name: "US Open Cup" },
  { id: 10043, code: "LGSCUP", name: "Leagues Cup" },
  { id: 42, code: "UCL", name: "UEFA Champions League" },
  { id: 73, code: "UEL", name: "UEFA Europa League" },
  { id: 10216, code: "UECL", name: "UEFA Conference League" },
  { id: 74, code: "USC", name: "UEFA Super Cup" },
  { id: 525, code: "AFCCL", name: "AFC Champions League" },
  { id: 9469, code: "AFCCL2", name: "AFC Champions League Two" },
  { id: 526, code: "CAFCL", name: "CAF Champions League" },
  { id: 297, code: "CCC", name: "CONCACAF Champions Cup" },
  { id: 45, code: "LIB", name: "Copa Libertadores" },
  { id: 299, code: "SUD", name: "Copa Sudamericana" },
  { id: 10703, code: "FIC", name: "FIFA Intercontinental Cup" },
  { id: 77, code: "WC", name: "World Cup" },
  { id: 50, code: "EURO", name: "Euros" },
  { id: 44, code: "COPA", name: "Copa America" },
  { id: 289, code: "AFCON", name: "AFCON" },
  { id: 290, code: "ASCUP", name: "Asian Cup" },
  { id: 298, code: "GOLD", name: "CONCACAF Gold Cup" },
  { id: 78, code: "CWC", name: "FIFA Club World Cup" },
  { id: 9806, code: "UNL", name: "UEFA Nations League" },
  { id: 10607, code: "EUROQ", name: "Euro Qualification" },
  { id: 489, code: "CFR", name: "Club Friendlies" },
  { id: 114, code: "INTL", name: "International" },
  { id: 10195, code: "WCQ", name: "World Cup Qualification" },
];

const TEAM_LOGO = (id) =>
  `https://images.fotmob.com/image_resources/logo/teamlogo/${id}.png`;

function parseScores(scores) {
  if (!scores) return [0, 0];
  const m = String(scores).split(/[-–:]/).map((s) => s.trim());
  const a = Number(m[0]); const b = Number(m[1]);
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 0];
}

function ymd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseHalfTime(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  return Date.parse(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? "00"}Z`);
}

function deriveMinute(status) {
  const periodLength = Number(status?.periodLength ?? 45);
  if (status?.finished) return { minute: null, state: "ft", label: "FT" };
  const short = String(status?.liveTime?.short ?? "").replace(/[^\dA-Za-z+]/g, "");
  if (/^HT$/i.test(short)) return { minute: periodLength, state: "ht", label: "HT" };
  const m = short.match(/^(\d+)(?:\+(\d+))?/);
  if (m) {
    const mins = Number(m[1]) + Number(m[2] ?? 0);
    return { minute: mins, state: "live", label: `${m[1]}${m[2] ? "+" + m[2] : ""}'` };
  }
  const secondStart = parseHalfTime(status?.halfs?.secondHalfStarted);
  const firstEnd = parseHalfTime(status?.halfs?.firstHalfEnded);
  const firstStart = parseHalfTime(status?.halfs?.firstHalfStarted);
  const etFirst = parseHalfTime(status?.halfs?.firstExtraHalfStarted);
  const etSecond = parseHalfTime(status?.halfs?.secondExtraHalfStarted);
  const now = Date.now();
  if (etSecond) return { minute: Math.max(106, Math.floor((now - etSecond) / 60000) + 105), state: "live", label: "LIVE" };
  if (etFirst) return { minute: Math.max(91, Math.floor((now - etFirst) / 60000) + 90), state: "live", label: "LIVE" };
  if (secondStart) return { minute: Math.max(periodLength + 1, Math.floor((now - secondStart) / 60000) + periodLength), state: "live", label: "LIVE" };
  if (firstEnd) return { minute: periodLength, state: "ht", label: "HT" };
  if (firstStart) return { minute: Math.max(1, Math.floor((now - firstStart) / 60000)), state: "live", label: "LIVE" };
  return { minute: null, state: "live", label: "LIVE" };
}

function extractStanding(data, lg) {
  const tableContainer = data?.table?.[0]?.data ?? {};
  let allRows = tableContainer?.table?.all ?? [];
  if (!Array.isArray(allRows) || allRows.length === 0) {
    const grouped = tableContainer?.tables ?? [];
    allRows = grouped.flatMap((g) => g?.table?.all ?? []);
  }
  const seen = new Set();
  allRows = (allRows ?? []).filter((r) => {
    const key = String(r?.id ?? "") || String(r?.name ?? "").toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const season = data?.details?.selectedSeason ?? data?.allAvailableSeasons?.[0] ?? null;
  const rows = (allRows ?? []).map((r, idx) => {
    const [gf, ga] = parseScores(r?.scoresStr);
    const id = Number(r?.id);
    return {
      position: Number(r?.idx ?? idx + 1),
      team_id: id,
      name: r?.name ?? "",
      short_name: r?.shortName ?? r?.name ?? "",
      logo: Number.isFinite(id) ? TEAM_LOGO(id) : "",
      played: Number(r?.played ?? 0),
      wins: Number(r?.wins ?? 0),
      draws: Number(r?.draws ?? 0),
      losses: Number(r?.losses ?? 0),
      gf, ga,
      gd: Number(r?.goalConDiff ?? gf - ga),
      points: Number(r?.pts ?? 0),
      qual_color: r?.qualColor ?? null,
      form: Array.isArray(r?.recentResults) ? r.recentResults.slice(-5) : [],
    };
  });
  return { season, rows };
}

/**
 * Fetch every league (limited concurrency) and split into results, fixtures,
 * standings and team logos. One HTTP call per league covers all four.
 */
export async function fetchAllLeagues(leagues = FOTMOB_LEAGUES, concurrency = 8, resultsCutoffDays = 450) {
  const results = [];
  const fixtures = [];
  const standings = [];
  const logos = [];
  const cutoff = new Date(Date.now() - resultsCutoffDays * 86400000).toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  let cursor = 0;
  const queue = [...leagues];
  async function worker() {
    while (cursor < queue.length) {
      const lg = queue[cursor++];
      const data = await getJson(`${FOTMOB_BASE}/leagues?id=${lg.id}`);
      if (!data) continue;

      // Standings
      try {
        const { season, rows } = extractStanding(data, lg);
        if (rows.length) {
          standings.push({ league_code: lg.code, league_name: lg.name, season, rows, fetched_at: nowIso });
          for (const r of rows) {
            if (r.team_id && r.name) logos.push({ team_name: r.name, fotmob_id: r.team_id, logo_url: r.logo, fetched_at: nowIso });
          }
        }
      } catch (e) { /* standings optional */ }

      // Matches
      const matches = data?.fixtures?.allMatches ?? [];
      for (const m of matches) {
        const utc = m?.status?.utcTime;
        if (!utc) continue;
        const d = new Date(utc);
        if (isNaN(d.getTime())) continue;
        const home = m?.home?.name?.trim();
        const away = m?.away?.name?.trim();
        if (!home || !away) continue;
        if (m?.status?.cancelled) continue;
        const matchDate = d.toISOString().slice(0, 10);
        const matchTime = d.toISOString().slice(11, 16);

        if (!m?.status?.finished) {
          fixtures.push({
            id: `${lg.code}|${matchDate}|${home}|${away}`,
            league_code: lg.code, league_name: lg.name,
            match_date: matchDate, match_time: matchTime,
            home_team: home, away_team: away, referee: null, created_at: nowIso,
          });
        } else {
          if (matchDate < cutoff) continue; // only recent results
          const score = m?.status?.scoreStr ?? "";
          const parts = score.split(/[-–:]/).map((s) => s.trim());
          const hg = Number(parts[0]); const ag = Number(parts[1]);
          if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
          const yr = d.getUTCFullYear();
          const season = `${String(yr % 100).padStart(2, "0")}${String((yr + 1) % 100).padStart(2, "0")}`;
          results.push({
            league_code: lg.code, league_name: lg.name, season,
            match_date: matchDate, match_time: matchTime,
            home_team: home, away_team: away,
            ft_home_goals: hg, ft_away_goals: ag,
            ft_result: hg > ag ? "H" : hg < ag ? "A" : "D",
            home_shots: 0, away_shots: 0, home_shots_target: 0, away_shots_target: 0,
            home_corners: 0, away_corners: 0, home_yellows: 0, away_yellows: 0,
            home_reds: 0, away_reds: 0, home_fouls: 0, away_fouls: 0,
            created_at: nowIso,
          });
        }
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  // Dedupe logos by team_name (last wins)
  const logoMap = new Map();
  for (const l of logos) logoMap.set(l.team_name, l);

  return { results, fixtures, standings, logos: [...logoMap.values()] };
}

const LEAGUE_BY_ID = new Map(FOTMOB_LEAGUES.map((l) => [l.id, { code: l.code, name: l.name }]));
const FT_KEEP_MS = 15 * 60 * 1000;
const MAX_DETAILS = 30;

function pickStat(groups, keys) {
  for (const g of groups) {
    for (const item of g?.stats ?? g?.items ?? []) {
      const title = String(item?.title ?? item?.key ?? "").toLowerCase();
      if (keys.some((k) => title.includes(k))) {
        const vals = item?.stats ?? item?.value ?? [];
        const h = Array.isArray(vals) ? vals[0] : null;
        const a = Array.isArray(vals) ? vals[1] : null;
        const num = (v) => {
          if (v === null || v === undefined) return null;
          const n = parseFloat(String(v).replace("%", "").split("(")[0].trim());
          return Number.isFinite(n) ? n : null;
        };
        return [num(h), num(a)];
      }
    }
  }
  return [null, null];
}

function flattenStatGroups(stats) {
  if (!stats) return [];
  const periods = stats?.Periods ?? stats?.periods;
  const all = periods?.All ?? periods?.all ?? stats;
  const arr = all?.stats ?? all;
  return Array.isArray(arr) ? arr : [];
}

async function enrichLive(c) {
  const d = await getJson(`${FOTMOB_BASE}/matchDetails?matchId=${c.id}`);
  if (!d) return { events: [], stats: {} };
  const facts = d?.content?.matchFacts ?? {};
  const rawEvents = facts?.events?.events ?? [];
  const events = rawEvents
    .filter((e) => e?.type)
    .map((e) => ({
      type: String(e.type), minute: Number(e.time ?? e.timeStr ?? 0) || null,
      minuteStr: String(e.timeStr ?? e.time ?? ""), isHome: !!e.isHome,
      player: e?.player?.name ?? e?.nameStr ?? null, assist: e?.assistStr ?? null,
      card: e?.card ?? null, ownGoal: !!e.ownGoal, homeScore: e?.homeScore ?? null,
      awayScore: e?.awayScore ?? null,
    })).slice(-60);
  const groups = flattenStatGroups(d?.content?.stats);
  const stats = {
    possession: pickStat(groups, ["ball possession", "possession"]),
    shots: pickStat(groups, ["total shots", "shots"]),
    shotsOnTarget: pickStat(groups, ["shots on target"]),
    xg: pickStat(groups, ["expected goals"]),
    corners: pickStat(groups, ["corner"]),
    yellows: pickStat(groups, ["yellow card"]),
    reds: pickStat(groups, ["red card"]),
    fouls: pickStat(groups, ["fouls"]),
  };
  return { events, stats };
}

/** Collect live + recently-finished matches from today's + yesterday's day lists. */
export async function fetchLive() {
  const now = Date.now();
  const dates = [new Date(now - 86400000), new Date(now)];
  const candidates = [];
  for (const d of dates) {
    const data = await getJson(`${FOTMOB_BASE}/matches?date=${ymd(d)}`);
    const leagues = data?.leagues ?? [];
    for (const lg of leagues) {
      const meta = LEAGUE_BY_ID.get(Number(lg?.primaryId)) ?? LEAGUE_BY_ID.get(Number(lg?.id));
      if (!meta) continue;
      for (const m of lg?.matches ?? []) {
        const st = m?.status ?? {};
        if (st.cancelled || !st.started) continue;
        const utc = st.utcTime ? Date.parse(st.utcTime) : NaN;
        const gameEnded = parseHalfTime(st?.halfs?.gameEnded);
        if (st.finished) {
          const endedAt = gameEnded ?? (Number.isFinite(utc) ? utc + 115 * 60000 : now);
          if (now - endedAt > FT_KEEP_MS) continue;
        }
        const { minute, state, label } = deriveMinute(st);
        const home = String(m?.home?.name ?? "").trim();
        const away = String(m?.away?.name ?? "").trim();
        if (!home || !away) continue;
        candidates.push({
          id: Number(m?.id), league_code: meta.code, league_name: meta.name,
          home_team: home, away_team: away,
          home_goals: Number(m?.home?.score ?? 0) || 0, away_goals: Number(m?.away?.score ?? 0) || 0,
          status: state, status_label: st?.reason?.short ?? label, minute,
          kickoff_at: Number.isFinite(utc) ? new Date(utc).toISOString() : null,
          finished_at: st.finished ? new Date(gameEnded ?? now).toISOString() : null,
        });
      }
    }
  }
  const seen = new Set();
  const ordered = candidates.filter((c) => Number.isFinite(c.id) && !seen.has(c.id) && seen.add(c.id))
    .sort((a, b) => (a.status === "ft" ? 1 : 0) - (b.status === "ft" ? 1 : 0));

  const rows = [];
  for (let i = 0; i < ordered.length; i++) {
    const c = ordered[i];
    let extra = { events: [], stats: {} };
    if (i < MAX_DETAILS) extra = await enrichLive(c);
    rows.push({
      id: String(c.id), fotmob_match_id: c.id,
      league_code: c.league_code, league_name: c.league_name,
      home_team: c.home_team, away_team: c.away_team,
      home_goals: c.home_goals, away_goals: c.away_goals,
      status: c.status, status_label: c.status_label, minute: c.minute,
      kickoff_at: c.kickoff_at, finished_at: c.finished_at,
      events: extra.events, stats: extra.stats, updated_at: new Date().toISOString(),
    });
  }
  return rows;
}
