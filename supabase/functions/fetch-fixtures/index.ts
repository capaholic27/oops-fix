// Fetches upcoming fixtures.
// Strategy:
//  1) Pull football-data.co.uk fixtures.csv (free, no quota).
//  2) If we have fewer than 30 *future* fixtures (or a specific targetDate has none),
//     top up with API-Football. Spends only as much quota as available.
//
// Body (optional): { force?: boolean, targetDate?: "YYYY-MM-DD" }
//   - targetDate: only fetch that single date from API-Football (1 quota call).
//   - Without targetDate: try up to 7 days ahead (7 quota calls), but degrades
//     gracefully when quota is partially available.
//
// Idempotent: uses upsert so duplicate fixtures don't error.

import { adminClient, reserveQuota, refundQuota, getTodayCount, DAILY_LIMIT } from "../_shared/quota.ts";
import { fetchFotmobAll } from "../_shared/fotmob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = "https://v3.football.api-sports.io";

const LEAGUE_NAMES: Record<string, string> = {
  E0: "Premier League", E1: "Championship", E2: "League One", E3: "League Two", EC: "Conference",
  SP1: "La Liga", SP2: "La Liga 2",
  D1: "Bundesliga", D2: "Bundesliga 2",
  I1: "Serie A", I2: "Serie B",
  F1: "Ligue 1", F2: "Ligue 2",
  P1: "Primeira Liga",
  N1: "Eredivisie",
  B1: "Jupiler League",
  T1: "Super Lig",
  G1: "Super League Greece",
  SC0: "Scottish Premiership", SC1: "Scottish Championship", SC2: "Scottish League One", SC3: "Scottish League Two",
};

const API_TOP_LEAGUES = [
  39, 140, 135, 78, 61, 88, 94, 40, 253,
];

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].replace(/^\uFEFF/, "").split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    if (vals.length < 3) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = vals[idx]?.trim() ?? ""));
    rows.push(row);
  }
  return rows;
}

function parseDate(dateStr: string): string | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function loadFromCSV(): Promise<any[]> {
  try {
    const resp = await fetch("https://www.football-data.co.uk/fixtures.csv");
    if (!resp.ok) return [];
    const csvText = await resp.text();
    const rows = parseCSV(csvText);
    return rows
      .filter((r) => r.Div && r.Date && r.HomeTeam && r.AwayTeam)
      .map((r) => {
        const matchDate = parseDate(r.Date);
        if (!matchDate) return null;
        const code = r.Div;
        return {
          league_code: code,
          league_name: LEAGUE_NAMES[code] || code,
          match_date: matchDate,
          match_time: r.Time || null,
          home_team: r.HomeTeam,
          away_team: r.AwayTeam,
          referee: r.Referee || null,
        };
      })
      .filter(Boolean) as any[];
  } catch (e) {
    console.warn("CSV fetch failed", e);
    return [];
  }
}

async function fetchApiFootballForDate(apiKey: string, date: string): Promise<any[]> {
  try {
    const resp = await fetch(`${API_BASE}/fixtures?date=${date}`, {
      headers: { "x-apisports-key": apiKey, "Accept": "application/json" },
    });
    if (!resp.ok) return [];
    const body = await resp.json();
    const items: any[] = body?.response ?? [];
    const out: any[] = [];
    for (const f of items) {
      const leagueId = f?.league?.id;
      if (!API_TOP_LEAGUES.includes(leagueId)) continue;
      const ts: string = f?.fixture?.date ?? "";
      const matchDate = ts.slice(0, 10) || date;
      const matchTime = ts.slice(11, 16) || null;
      out.push({
        league_code: `API-${leagueId}`,
        league_name: f?.league?.name ?? "Unknown",
        match_date: matchDate,
        match_time: matchTime,
        home_team: f?.teams?.home?.name ?? "",
        away_team: f?.teams?.away?.name ?? "",
        referee: f?.fixture?.referee || null,
      });
    }
    return out.filter((f) => f.home_team && f.away_team);
  } catch (e) {
    console.warn("API-Football date fetch failed", date, e);
    return [];
  }
}

/**
 * Fetch from API-Football for a list of dates. Reserves quota per-date so that
 * partial availability still gets some fixtures (instead of all-or-nothing).
 */
async function loadFromApiFootball(
  apiKey: string,
  supabase: any,
  dates: string[]
): Promise<{ fixtures: any[]; spent: number; quotaExhausted: boolean }> {
  const fixtures: any[] = [];
  let spent = 0;
  let quotaExhausted = false;

  for (const date of dates) {
    const reservation = await reserveQuota(supabase, 1);
    if (!reservation.ok) {
      quotaExhausted = true;
      console.warn(`Quota exhausted at date=${date} (${reservation.used}/${DAILY_LIMIT})`);
      break;
    }
    const items = await fetchApiFootballForDate(apiKey, date);
    spent++;
    if (items.length === 0) {
      // Refund if API returned empty (e.g. no top-league matches that day)
      // Keep the call counted — we did spend an API request — so do NOT refund.
    }
    fixtures.push(...items);
  }

  return { fixtures, spent, quotaExhausted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = adminClient();
    const apiKey = Deno.env.get("RAPIDAPI_KEY");

    let body: any = {};
    try { body = await req.json(); } catch { /* GET */ }
    const force = !!body?.force;
    const targetDate: string | undefined = body?.targetDate;

    // Skip refresh if we recently fetched (last 6 hours) and have plenty of future fixtures.
    // But: when targetDate is specified, only skip if THAT date has fixtures already.
    if (!force) {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
      if (targetDate) {
        const { count: dayCount } = await supabase
          .from("fixtures")
          .select("*", { count: "exact", head: true })
          .eq("match_date", targetDate)
          .gte("created_at", sixHoursAgo);
        if ((dayCount ?? 0) > 0) {
          return new Response(
            JSON.stringify({ success: true, fixtures: dayCount, cached: true, targetDate }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        const { count: futureCount } = await supabase
          .from("fixtures")
          .select("*", { count: "exact", head: true })
          .gte("match_date", today())
          .gte("created_at", sixHoursAgo);
        if ((futureCount ?? 0) > 30) {
          return new Response(
            JSON.stringify({ success: true, fixtures: futureCount, cached: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // 1) Fotmob (PRIMARY — no quota, covers MLS/Allsvenskan/etc)
    let fotmobResults: any[] = [];
    let fotmobFixturesCount = 0;
    try {
      const fm = await fetchFotmobAll();
      fotmobFixturesCount = fm.fixtures.length;
      fotmobResults = fm.results;
      console.log(`Fotmob produced ${fm.fixtures.length} fixtures + ${fm.results.length} results`);
      // Stash for later upsert into matches table
      (globalThis as any).__fotmobResults = fm.results;
      (globalThis as any).__fotmobFixtures = fm.fixtures;
    } catch (e) {
      console.warn("Fotmob fetch failed, falling back", e);
    }

    // 2) CSV (free secondary)
    const csvFixtures = await loadFromCSV();

    const seen = new Set<string>();
    const all: any[] = [];
    const fotmobFixtures = (globalThis as any).__fotmobFixtures ?? [];
    for (const f of fotmobFixtures) {
      const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(f);
    }
    for (const f of csvFixtures) {
      const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(f);
    }

    const futureFromFree = all.filter((f) => f.match_date >= today()).length;
    const freeHasTarget = targetDate ? all.some(f => f.match_date === targetDate) : true;
    console.log(`Free sources produced ${all.length} fixtures (${futureFromFree} future). targetDate=${targetDate ?? "n/a"} hasTarget=${freeHasTarget}`);

    // 3) API-Football top-up (only if free sources are short)
    const needsTopup = targetDate ? !freeHasTarget : futureFromFree < 30;
    let quotaExhausted = false;
    let apiSpent = 0;
    if (needsTopup && apiKey) {
      const dates = targetDate
        ? [targetDate]
        : Array.from({ length: 7 }, (_, i) => addDays(i));
      const result = await loadFromApiFootball(apiKey, supabase, dates);
      apiSpent = result.spent;
      quotaExhausted = result.quotaExhausted;
      console.log(`API-Football top-up: +${result.fixtures.length} fixtures, spent ${apiSpent} call(s)`);
      for (const f of result.fixtures) {
        const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(key)) continue;
        const altKey = `*|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(altKey)) continue;
        seen.add(key);
        seen.add(altKey);
        all.push(f);
      }
    }

    // Upsert (idempotent — no duplicate key errors).
    let inserted = 0;
    if (all.length > 0) {
      // Only refresh future rows; leave history untouched.
      const futureRows = all.filter(f => f.match_date >= today());
      const batchSize = 100;
      for (let i = 0; i < futureRows.length; i += batchSize) {
        const batch = futureRows.slice(i, i + batchSize);
        const { error } = await supabase
          .from("fixtures")
          .upsert(batch, { onConflict: "league_code,match_date,home_team,away_team", ignoreDuplicates: false });
        if (error) {
          console.error("Upsert error:", error);
          continue;
        }
        inserted += batch.length;
      }
    }

    // Persist Fotmob finished results into `matches` (skip duplicates).
    let resultsInserted = 0;
    const fmResults: any[] = (globalThis as any).__fotmobResults ?? [];
    if (fmResults.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < fmResults.length; i += batchSize) {
        const batch = fmResults.slice(i, i + batchSize);
        const dates = [...new Set(batch.map((r) => r.match_date))];
        const { data: existing } = await supabase
          .from("matches")
          .select("match_date, home_team, away_team")
          .in("match_date", dates);
        const existingSet = new Set(
          (existing ?? []).map((e: any) => `${e.match_date}|${e.home_team}|${e.away_team}`)
        );
        const fresh = batch.filter(
          (r) => !existingSet.has(`${r.match_date}|${r.home_team}|${r.away_team}`)
        );
        if (fresh.length === 0) continue;
        const { error } = await supabase.from("matches").insert(fresh);
        if (error) {
          console.error("Fotmob results insert error:", error);
          continue;
        }
        resultsInserted += fresh.length;
      }
      console.log(`Inserted ${resultsInserted} Fotmob results into matches`);
    }

    // Cleanup: drop fixtures that already have a result, and any past-dated fixtures.
    // Fotmob is the only source going forward, so we don't worry about losing rows.
    try {
      const { data: settled } = await supabase
        .from("matches")
        .select("match_date, home_team, away_team")
        .gte("match_date", addDays(-7));
      const settledKeys = new Set(
        (settled ?? []).map((m: any) =>
          `${m.match_date}|${m.home_team.toLowerCase()}|${m.away_team.toLowerCase()}`
        )
      );
      const { data: toCheck } = await supabase
        .from("fixtures")
        .select("id, match_date, home_team, away_team")
        .gte("match_date", addDays(-7));
      const idsToDelete = (toCheck ?? [])
        .filter((f: any) =>
          settledKeys.has(`${f.match_date}|${f.home_team.toLowerCase()}|${f.away_team.toLowerCase()}`)
        )
        .map((f: any) => f.id);
      if (idsToDelete.length > 0) {
        await supabase.from("fixtures").delete().in("id", idsToDelete);
        console.log(`Removed ${idsToDelete.length} settled fixtures`);
      }
      const { error: stalErr, count: stalCount } = await supabase
        .from("fixtures")
        .delete({ count: "exact" })
        .lt("match_date", today());
      if (!stalErr && stalCount) console.log(`Removed ${stalCount} stale past fixtures`);
    } catch (e) {
      console.warn("Fixture cleanup failed", e);
    }

    const futureCountQ = await supabase
      .from("fixtures")
      .select("*", { count: "exact", head: true })
      .gte("match_date", today());

    let targetCount: number | null = null;
    if (targetDate) {
      const r = await supabase
        .from("fixtures")
        .select("*", { count: "exact", head: true })
        .eq("match_date", targetDate);
      targetCount = r.count ?? 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        inserted,
        resultsInserted,
        fotmobFixtures: (globalThis as any).__fotmobFixtures?.length ?? 0,
        futureCount: futureCountQ.count ?? 0,
        targetDate: targetDate ?? null,
        targetCount,
        apiCallsSpent: apiSpent,
        quotaExhausted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fetch fixtures error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
