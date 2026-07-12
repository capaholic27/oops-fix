// Fetches World Cup history (and other major international tournament editions)
// from Fotmob and upserts the finished matches into the `matches` table so the
// rest of the app (stats, predictions, rankings) can use them like any league.
//
// Idempotent. Safe to invoke multiple times — only missing matches are inserted.
//
// Body (optional): { force?: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { FOTMOB_LEAGUES, fetchFotmobLeagueSeason } from "../_shared/fotmob.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Past editions to backfill. Most-recent first.
const HISTORY: { code: string; seasons: (string | number)[] }[] = [
  { code: "WC",    seasons: [2022, 2018, 2014, 2010, 2006, 2002] },
  { code: "EURO",  seasons: [2024, 2020, 2016, 2012, 2008] },
  { code: "COPA",  seasons: [2024, 2021, 2019, 2016, 2015] },
  { code: "AFCON", seasons: ["2023-2024", 2024, "2021-2022", 2022, 2019, 2017] },
  { code: "CWC",   seasons: [2025, 2023, 2022, 2021] },
  { code: "UNL",   seasons: ["2024-2025", "2022-2023", "2020-2021", "2018-2019"] },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let body: any = {};
    try { body = await req.json(); } catch { /* GET */ }
    const force = !!body?.force;

    let totalInserted = 0;
    const breakdown: Record<string, number> = {};

    for (const entry of HISTORY) {
      const league = FOTMOB_LEAGUES.find(l => l.code === entry.code);
      if (!league) continue;

      // Skip if we already have a healthy backfill (unless forced).
      if (!force) {
        const { count } = await supabase
          .from("matches")
          .select("*", { count: "exact", head: true })
          .eq("league_code", entry.code);
        // Each WC/EURO has ~50-64 matches; if we already have a lot, skip.
        if ((count ?? 0) >= entry.seasons.length * 40) {
          breakdown[entry.code] = count ?? 0;
          continue;
        }
      }

      for (const season of entry.seasons) {
        const results = await fetchFotmobLeagueSeason(league, season);
        if (results.length === 0) continue;

        // Filter out anything we already have (league_code + match_date + teams).
        const dates = [...new Set(results.map(r => r.match_date))];
        const { data: existing } = await supabase
          .from("matches")
          .select("match_date, home_team, away_team")
          .eq("league_code", entry.code)
          .in("match_date", dates);
        const existingSet = new Set(
          (existing ?? []).map((e: any) => `${e.match_date}|${e.home_team}|${e.away_team}`),
        );
        const fresh = results.filter(
          r => !existingSet.has(`${r.match_date}|${r.home_team}|${r.away_team}`),
        );
        if (fresh.length === 0) continue;

        const rows = fresh.map(r => ({
          league_code: r.league_code,
          league_name: r.league_name,
          season: r.season,
          match_date: r.match_date,
          home_team: r.home_team,
          away_team: r.away_team,
          ft_home_goals: r.ft_home_goals,
          ft_away_goals: r.ft_away_goals,
          ft_result: r.ft_result,
        }));

        const { error } = await supabase.from("matches").insert(rows);
        if (error) {
          console.error(`Insert ${entry.code}/${season} failed`, error);
          continue;
        }
        totalInserted += rows.length;
        breakdown[entry.code] = (breakdown[entry.code] ?? 0) + rows.length;
      }
    }

    return new Response(
      JSON.stringify({ success: true, inserted: totalInserted, breakdown }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("fetch-wc-history error", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message ?? String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
