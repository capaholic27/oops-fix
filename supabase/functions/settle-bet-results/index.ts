// Settles bets using Fotmob data only.
// Returns full-time score AND per-match stats (corners/cards/shots/fouls)
// when available — `has_stats` flags whether stat-market verification is possible.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/quota.ts";
import { fetchFotmobAll, fetchFotmobMatchStats } from "../_shared/fotmob.ts";

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
  // Stats (only present when verifiable)
  has_stats?: boolean;
  home_corners?: number; away_corners?: number;
  home_yellows?: number; away_yellows?: number;
  home_reds?: number; away_reds?: number;
  home_fouls?: number; away_fouls?: number;
  home_shots?: number; away_shots?: number;
  home_shots_target?: number; away_shots_target?: number;
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

    // 1) Local DB lookup (fast, no network) — includes stat columns
    const dates = [...new Set(queries.map(q => q.date).filter(Boolean))];
    const { data: localMatches = [] } = await supabase
      .from("matches")
      .select("match_date, home_team, away_team, ft_home_goals, ft_away_goals, ft_result, home_corners, away_corners, home_yellows, away_yellows, home_reds, away_reds, home_fouls, away_fouls, home_shots, away_shots, home_shots_target, away_shots_target")
      .in("match_date", dates);

    const stillMissing: Query[] = [];
    const needStatsForMatchId: { q: Query; matchId: number | string }[] = [];

    for (const q of queries) {
      if (!q.date || !q.home || !q.away) {
        results.push({ ...q, found: false, status: "bad_input" });
        continue;
      }
      const m: any = (localMatches ?? []).find((row: any) =>
        row.match_date === q.date &&
        teamMatch(row.home_team, q.home) &&
        teamMatch(row.away_team, q.away)
      );
      if (m && m.ft_home_goals != null && m.ft_away_goals != null) {
        const totalStats = (m.home_corners ?? 0) + (m.away_corners ?? 0)
          + (m.home_shots ?? 0) + (m.away_shots ?? 0)
          + (m.home_yellows ?? 0) + (m.away_yellows ?? 0)
          + (m.home_fouls ?? 0) + (m.away_fouls ?? 0);
        const hasStats = totalStats > 0;
        results.push({
          ...q, found: true, status: "FT",
          ft_home_goals: m.ft_home_goals,
          ft_away_goals: m.ft_away_goals,
          ft_result: m.ft_result ?? (m.ft_home_goals > m.ft_away_goals ? "H" : m.ft_home_goals < m.ft_away_goals ? "A" : "D"),
          has_stats: hasStats,
          home_corners: m.home_corners ?? 0, away_corners: m.away_corners ?? 0,
          home_yellows: m.home_yellows ?? 0, away_yellows: m.away_yellows ?? 0,
          home_reds: m.home_reds ?? 0, away_reds: m.away_reds ?? 0,
          home_fouls: m.home_fouls ?? 0, away_fouls: m.away_fouls ?? 0,
          home_shots: m.home_shots ?? 0, away_shots: m.away_shots ?? 0,
          home_shots_target: m.home_shots_target ?? 0, away_shots_target: m.away_shots_target ?? 0,
        });
      } else {
        stillMissing.push(q);
      }
    }

    // 2) Fotmob live fallback for missing OR for stat-less locals
    const needStatsLocally = results.filter(r => r.found && !r.has_stats);

    if (stillMissing.length > 0 || needStatsLocally.length > 0) {
      try {
        const { results: fmResults } = await fetchFotmobAll();
        const rowsToUpsert: any[] = [];

        // Resolve missing scores
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
          // Try to fetch detailed stats too
          let stats = null;
          if (m.match_id) stats = await fetchFotmobMatchStats(m.match_id);
          results.push({
            ...q, found: true, status: "FT",
            ft_home_goals: m.ft_home_goals,
            ft_away_goals: m.ft_away_goals,
            ft_result: m.ft_result,
            has_stats: !!stats,
            home_corners: stats?.home_corners ?? 0, away_corners: stats?.away_corners ?? 0,
            home_yellows: stats?.home_yellows ?? 0, away_yellows: stats?.away_yellows ?? 0,
            home_reds: stats?.home_reds ?? 0, away_reds: stats?.away_reds ?? 0,
            home_fouls: stats?.home_fouls ?? 0, away_fouls: stats?.away_fouls ?? 0,
            home_shots: stats?.home_shots ?? 0, away_shots: stats?.away_shots ?? 0,
            home_shots_target: stats?.home_shots_target ?? 0, away_shots_target: stats?.away_shots_target ?? 0,
          });
          rowsToUpsert.push({
            league_code: m.league_code, league_name: m.league_name, season: m.season,
            match_date: m.match_date, home_team: m.home_team, away_team: m.away_team,
            ft_home_goals: m.ft_home_goals, ft_away_goals: m.ft_away_goals, ft_result: m.ft_result,
            home_corners: stats?.home_corners ?? 0, away_corners: stats?.away_corners ?? 0,
            home_yellows: stats?.home_yellows ?? 0, away_yellows: stats?.away_yellows ?? 0,
            home_reds: stats?.home_reds ?? 0, away_reds: stats?.away_reds ?? 0,
            home_fouls: stats?.home_fouls ?? 0, away_fouls: stats?.away_fouls ?? 0,
            home_shots: stats?.home_shots ?? 0, away_shots: stats?.away_shots ?? 0,
            home_shots_target: stats?.home_shots_target ?? 0, away_shots_target: stats?.away_shots_target ?? 0,
          });
        }

        // Backfill stats on locals that had no stats
        for (const r of needStatsLocally) {
          const m = fmResults.find(x =>
            x.match_date === r.date &&
            teamMatch(x.home_team, r.home) &&
            teamMatch(x.away_team, r.away)
          );
          if (!m?.match_id) continue;
          const stats = await fetchFotmobMatchStats(m.match_id);
          if (!stats) continue;
          r.has_stats = true;
          r.home_corners = stats.home_corners; r.away_corners = stats.away_corners;
          r.home_yellows = stats.home_yellows; r.away_yellows = stats.away_yellows;
          r.home_reds = stats.home_reds; r.away_reds = stats.away_reds;
          r.home_fouls = stats.home_fouls; r.away_fouls = stats.away_fouls;
          r.home_shots = stats.home_shots; r.away_shots = stats.away_shots;
          r.home_shots_target = stats.home_shots_target; r.away_shots_target = stats.away_shots_target;
        }

        if (rowsToUpsert.length > 0) {
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

    return new Response(JSON.stringify({ results, source: "fotmob+local" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("settle-bet-results error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
