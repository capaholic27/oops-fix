// Fetches upcoming fixtures.
// Strategy:
//  1) Pull football-data.co.uk fixtures.csv (free, no quota).
//  2) If we have fewer than 30 *future* fixtures, top up with API-Football
//     (1 call per day at most — guarded by api_quota table).
//
// Idempotent: deletes only "future" rows before re-inserting so we never lose
// historical fixtures already played.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, reserveQuota, refundQuota, getTodayCount, DAILY_LIMIT } from "../_shared/quota.ts";

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

// API-Football top league IDs we care about for top-up
const API_TOP_LEAGUES = [
  39,   // Premier League
  140,  // La Liga
  135,  // Serie A
  78,   // Bundesliga
  61,   // Ligue 1
  88,   // Eredivisie
  94,   // Primeira Liga
  40,   // Championship
  253,  // MLS
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

async function loadFromApiFootball(apiKey: string, supabase: any): Promise<any[]> {
  // 1 API call per league via /fixtures?league=X&season=Y&from=&to= would be 9 calls.
  // To save quota we use a single /fixtures?date= call per day for the next 7 days = 7 calls.
  // Actually, we only need the cheapest path: ONE call /fixtures?date=YYYY-MM-DD covers
  // ALL leagues but only one date — so 7 calls for a week, 14 for two weeks.
  //
  // Compromise: 7 calls for next-7-days. Reserve quota up front.
  const days = 7;
  const reservation = await reserveQuota(supabase, days);
  if (!reservation.ok) {
    console.warn(`Skipping API-Football top-up — quota exhausted (${reservation.used}/${DAILY_LIMIT})`);
    return [];
  }

  const fixtures: any[] = [];
  let used = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(i);
    try {
      const resp = await fetch(`${API_BASE}/fixtures?date=${date}`, {
        headers: { "x-apisports-key": apiKey, "Accept": "application/json" },
      });
      used++;
      if (!resp.ok) continue;
      const body = await resp.json();
      const items: any[] = body?.response ?? [];
      for (const f of items) {
        const leagueId = f?.league?.id;
        if (!API_TOP_LEAGUES.includes(leagueId)) continue;
        const ts: string = f?.fixture?.date ?? "";
        const matchDate = ts.slice(0, 10) || date;
        const matchTime = ts.slice(11, 16) || null;
        fixtures.push({
          league_code: `API-${leagueId}`,
          league_name: f?.league?.name ?? "Unknown",
          match_date: matchDate,
          match_time: matchTime,
          home_team: f?.teams?.home?.name ?? "",
          away_team: f?.teams?.away?.name ?? "",
          referee: f?.fixture?.referee || null,
        });
      }
    } catch (e) {
      console.warn("API-Football date fetch failed", date, e);
    }
  }
  if (used < days) await refundQuota(supabase, days - used);
  return fixtures.filter((f) => f.home_team && f.away_team);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = adminClient();
    const apiKey = Deno.env.get("RAPIDAPI_KEY");

    let body: any = {};
    try { body = await req.json(); } catch { /* GET */ }
    const force = !!body?.force;

    // Skip refresh if we recently fetched (last 6 hours) and have plenty of future fixtures
    if (!force) {
      const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
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

    // 1) CSV (free)
    const csvFixtures = await loadFromCSV();

    // Deduplicate
    const seen = new Set<string>();
    const all: any[] = [];
    for (const f of csvFixtures) {
      const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(f);
    }

    const futureFromCsv = all.filter((f) => f.match_date >= today()).length;
    console.log(`CSV produced ${all.length} fixtures (${futureFromCsv} future).`);

    // 2) API-Football top-up if sparse
    if (futureFromCsv < 30 && apiKey) {
      const apiFixtures = await loadFromApiFootball(apiKey, supabase);
      console.log(`API-Football top-up: +${apiFixtures.length} fixtures`);
      for (const f of apiFixtures) {
        const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(key)) continue;
        // Also dedupe across sources by team+date (different code prefix)
        const altKey = `*|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(altKey)) continue;
        seen.add(key);
        seen.add(altKey);
        all.push(f);
      }
    }

    // Replace future fixtures only (preserve historical entries)
    if (all.length > 0) {
      await supabase.from("fixtures").delete().gte("match_date", today());

      const batchSize = 100;
      let inserted = 0;
      for (let i = 0; i < all.length; i += batchSize) {
        const batch = all.slice(i, i + batchSize);
        const { error } = await supabase.from("fixtures").insert(batch);
        if (error) {
          console.error("Insert error:", error);
          continue;
        }
        inserted += batch.length;
      }
      const { count: futureCount } = await supabase
        .from("fixtures")
        .select("*", { count: "exact", head: true })
        .gte("match_date", today());
      return new Response(
        JSON.stringify({ success: true, inserted, futureCount }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, fixtures: 0, message: "no fixtures available" }),
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
