import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveQuota, refundQuota, getTodayCount, DAILY_LIMIT } from "../_shared/quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAPIDAPI_HOST = "v3.football.api-sports.io";

// Top leagues (API-Football IDs)
const LEAGUES: { id: number; code: string; name: string }[] = [
  { id: 39, code: "E0", name: "Premier League" },
  { id: 40, code: "E1", name: "Championship" },
  { id: 140, code: "SP1", name: "La Liga" },
  { id: 78, code: "D1", name: "Bundesliga" },
  { id: 135, code: "I1", name: "Serie A" },
  { id: 61, code: "F1", name: "Ligue 1" },
  { id: 94, code: "P1", name: "Primeira Liga" },
  { id: 88, code: "N1", name: "Eredivisie" },
  { id: 2, code: "UCL", name: "Champions League" },
  { id: 3, code: "UEL", name: "Europa League" },
  { id: 203, code: "T1", name: "Super Lig" },
  { id: 179, code: "SC0", name: "Scottish Premiership" },
  { id: 113, code: "SWE1", name: "Allsvenskan" },
  { id: 253, code: "MLS", name: "Major League Soccer" },
];

// Try current and previous seasons
const SEASONS = [2024];

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function apiFetch(endpoint: string, params: Record<string, string>, apiKey: string) {
  const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  console.log(`Fetching: ${url.toString()}`);

  const res = await fetch(url.toString(), {
    headers: { "x-apisports-key": apiKey },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`API error ${res.status}: ${text}`);
    throw new Error(`API-Football ${res.status}: ${text}`);
  }

  const json = await res.json();
  
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.error("API errors:", JSON.stringify(json.errors));
    return [];
  }
  
  console.log(`Response results: ${json.results}`);
  return json.response || [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("RAPIDAPI_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "RAPIDAPI_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let mode = "both";
    let leagueFilter: string[] | null = null;
    try {
      const body = await req.json();
      if (body.mode) mode = body.mode;
      if (body.leagues) leagueFilter = body.leagues;
    } catch { /* no body */ }

    // Use date range approach (works on free plan)
    // For fixtures: from today to 30 days out
    // For results: last 30 days
    const now = new Date();
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 30);
    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - 30);

    const allFixtures: any[] = [];
    const allResults: any[] = [];
    let apiCalls = 0;

    // Respect the shared daily quota: leave headroom for ad-hoc team/injury lookups.
    const usedToday = await getTodayCount(supabase);
    const remaining = Math.max(0, DAILY_LIMIT - usedToday);
    // Cap this bulk run at 60% of remaining (or 60, whichever is lower) to leave room.
    const maxCalls = Math.min(60, Math.floor(remaining * 0.6));

    if (maxCalls < 1) {
      return new Response(JSON.stringify({
        success: true, fixtures: 0, results: 0, apiCalls: 0,
        skipped: true, reason: "daily-quota-low", usedToday, remaining,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    const leaguesToSync = leagueFilter
      ? LEAGUES.filter(l => leagueFilter!.includes(l.code))
      : LEAGUES;

    for (const season of SEASONS) {
      for (const league of leaguesToSync) {
        if (apiCalls >= maxCalls) break;

        // Rate limit: wait 7s between calls (10 req/min limit)
        if (apiCalls > 0 && apiCalls % 9 === 0) await delay(60000);
        else if (apiCalls > 0) await delay(3000);

        // Reserve 1 quota slot before each external call
        const slot = await reserveQuota(supabase, 1);
        if (!slot.ok) { console.log("Daily quota exhausted mid-run"); break; }

        try {
          const data = await apiFetch("/fixtures", {
            league: String(league.id),
            season: String(season),
          }, apiKey);
          apiCalls++;

          for (const f of data) {
            const fixture = f.fixture;
            const teams = f.teams;
            const goals = f.goals;
            const score = f.score;
            const matchDate = fixture.date ? fixture.date.slice(0, 10) : null;
            const matchTime = fixture.date ? fixture.date.slice(11, 16) : null;
            const status = fixture.status?.short;

            if (!matchDate || !teams.home?.name || !teams.away?.name) continue;

            // Upcoming (not started yet)
            if (status === "NS" || status === "TBD") {
              if (mode === "fixtures" || mode === "both") {
                allFixtures.push({
                  league_code: league.code,
                  league_name: league.name,
                  match_date: matchDate,
                  match_time: matchTime || null,
                  home_team: teams.home.name,
                  away_team: teams.away.name,
                  referee: fixture.referee || null,
                });
              }
            }
            else if ((status === "FT" || status === "AET" || status === "PEN") && goals.home !== null && goals.away !== null) {
              if (mode === "results" || mode === "both") {
                allResults.push({
                  league_code: league.code,
                  league_name: league.name,
                  season: `${season % 100}${(season + 1) % 100}`,
                  match_date: matchDate,
                  home_team: teams.home.name,
                  away_team: teams.away.name,
                  ft_home_goals: goals.home,
                  ft_away_goals: goals.away,
                  ft_result: goals.home > goals.away ? "H" : goals.home < goals.away ? "A" : "D",
                  ht_home_goals: score.halftime?.home ?? null,
                  ht_away_goals: score.halftime?.away ?? null,
                  ht_result: score.halftime?.home != null && score.halftime?.away != null
                    ? (score.halftime.home > score.halftime.away ? "H" : score.halftime.home < score.halftime.away ? "A" : "D")
                    : null,
                  referee: fixture.referee || null,
                });
              }
            }
          }
        } catch (err) {
          console.error(`Error for ${league.name} (${season}):`, err);
          // Refund the reserved slot since the call effectively failed
          await refundQuota(supabase, 1);
        }
      }
      if (apiCalls >= maxCalls) break;
    }

    // Insert fixtures
    let fixturesInserted = 0;
    if (allFixtures.length > 0) {
      await supabase.from("fixtures").delete().gte("match_date", "2000-01-01");

      const seen = new Set<string>();
      const unique = allFixtures.filter((f) => {
        const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const batchSize = 100;
      for (let i = 0; i < unique.length; i += batchSize) {
        const batch = unique.slice(i, i + batchSize);
        const { error } = await supabase.from("fixtures").insert(batch);
        if (error) console.error("Fixtures insert error:", error);
        else fixturesInserted += batch.length;
      }
    }

    // Insert results (skip existing)
    let resultsInserted = 0;
    if (allResults.length > 0) {
      // Batch check existing matches
      const batchSize = 50;
      for (let i = 0; i < allResults.length; i += batchSize) {
        const batch = allResults.slice(i, i + batchSize);
        const dates = [...new Set(batch.map((r: any) => r.match_date))];
        
        const { data: existing } = await supabase
          .from("matches")
          .select("match_date, home_team, away_team")
          .in("match_date", dates);

        const existingSet = new Set(
          (existing || []).map((e: any) => `${e.match_date}|${e.home_team}|${e.away_team}`)
        );

        const newResults = batch.filter(
          (r: any) => !existingSet.has(`${r.match_date}|${r.home_team}|${r.away_team}`)
        );

        if (newResults.length > 0) {
          const { error } = await supabase.from("matches").insert(newResults);
          if (error) console.error("Results insert error:", error);
          else resultsInserted += newResults.length;
        }
      }
    }

    const finalUsed = await getTodayCount(supabase);
    return new Response(
      JSON.stringify({
        success: true,
        fixtures: fixturesInserted,
        results: resultsInserted,
        apiCalls,
        leaguesFetched: leaguesToSync.length,
        quotaUsedToday: finalUsed,
        quotaRemaining: Math.max(0, DAILY_LIMIT - finalUsed),
        dailyLimit: DAILY_LIMIT,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("API-Football error:", error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
