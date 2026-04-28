// Settles bets using Fotmob data only.
// Strategy:
//  1) Look up requested matches in the local `matches` table (kept in sync by fetch-fixtures + Fotmob).
//  2) For any missing matches, pull the relevant Fotmob leagues live and re-check.
//  3) Cache anything we resolve into `matches` for next time.
// No API-Football, no quota concerns.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/quota.ts";
import { fetchFotmobAll } from "../_shared/fotmob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Query = { home: string; away: string; date: string };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+fc$|^fc\s+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function teamMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

type ResultRow = {
  home: string; away: string; date: string;
  found: boolean; status?: string;
  ft_home_goals?: number; ft_away_goals?: number; ft_result?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { queries } = await req.json() as { queries: Query[] };
    if (!Array.isArray(queries) || queries.length === 0) {
      return new Response(JSON.stringify({ error: "queries required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = adminClient();
    const results: ResultRow[] = [];
    const stillMissing: Query[] = [];

    // 1) Local DB lookup (fast, no network)
    const dates = [...new Set(queries.map(q => q.date).filter(Boolean))];
    const { data: localMatches = [] } = await supabase
      .from("matches")
      .select("match_date, home_team, away_team, ft_home_goals, ft_away_goals, ft_result")
      .in("match_date", dates);

    for (const q of queries) {
      if (!q.date || !q.home || !q.away) {
        results.push({ ...q, found: false, status: "bad_input" });
        continue;
      }
      const m = (localMatches ?? []).find((row: any) =>
        row.match_date === q.date &&
        teamMatch(row.home_team, q.home) &&
        teamMatch(row.away_team, q.away)
      );
      if (m && m.ft_home_goals != null && m.ft_away_goals != null) {
        results.push({
          ...q, found: true, status: "FT",
          ft_home_goals: m.ft_home_goals,
          ft_away_goals: m.ft_away_goals,
          ft_result: m.ft_result ?? (m.ft_home_goals > m.ft_away_goals ? "H" : m.ft_home_goals < m.ft_away_goals ? "A" : "D"),
        });
      } else {
        stillMissing.push(q);
      }
    }

    // 2) Fotmob live fallback for the missing ones
    let fotmobUsed = false;
    if (stillMissing.length > 0) {
      fotmobUsed = true;
      try {
        const { results: fmResults } = await fetchFotmobAll();
        const rowsToUpsert: any[] = [];
        for (const q of stillMissing) {
          const m = fmResults.find(r =>
            r.match_date === q.date &&
            teamMatch(r.home_team, q.home) &&
            teamMatch(r.away_team, q.away)
          );
          if (!m) {
            results.push({ ...q, found: false, status: "not_found" });
            continue;
          }
          results.push({
            ...q, found: true, status: "FT",
            ft_home_goals: m.ft_home_goals,
            ft_away_goals: m.ft_away_goals,
            ft_result: m.ft_result,
          });
          rowsToUpsert.push({
            league_code: m.league_code,
            league_name: m.league_name,
            season: m.season,
            match_date: m.match_date,
            home_team: m.home_team,
            away_team: m.away_team,
            ft_home_goals: m.ft_home_goals,
            ft_away_goals: m.ft_away_goals,
            ft_result: m.ft_result,
          });
        }
        if (rowsToUpsert.length > 0) {
          // Skip dupes by checking existence first
          const dates2 = [...new Set(rowsToUpsert.map(r => r.match_date))];
          const { data: existing } = await supabase
            .from("matches")
            .select("match_date, home_team, away_team")
            .in("match_date", dates2);
          const existingSet = new Set(
            (existing ?? []).map((e: any) => `${e.match_date}|${e.home_team}|${e.away_team}`)
          );
          const fresh = rowsToUpsert.filter(
            r => !existingSet.has(`${r.match_date}|${r.home_team}|${r.away_team}`)
          );
          if (fresh.length > 0) {
            await supabase.from("matches").insert(fresh);
          }
        }
      } catch (e) {
        console.error("Fotmob settlement fallback failed", e);
        for (const q of stillMissing) {
          if (!results.some(r => r.home === q.home && r.away === q.away && r.date === q.date)) {
            results.push({ ...q, found: false, status: "fetch_error" });
          }
        }
      }
    }

    return new Response(JSON.stringify({
      results,
      source: fotmobUsed ? "fotmob+local" : "local",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("settle-bet-results error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
