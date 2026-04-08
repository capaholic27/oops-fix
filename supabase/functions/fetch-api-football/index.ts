import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RAPIDAPI_HOST = "v3.football.api-sports.io";

// Top leagues to fetch fixtures for (league IDs from API-Football)
const LEAGUES: { id: number; code: string; name: string }[] = [
  { id: 39, code: "E0", name: "Premier League" },
  { id: 40, code: "E1", name: "Championship" },
  { id: 41, code: "E2", name: "League One" },
  { id: 42, code: "E3", name: "League Two" },
  { id: 140, code: "SP1", name: "La Liga" },
  { id: 141, code: "SP2", name: "La Liga 2" },
  { id: 78, code: "D1", name: "Bundesliga" },
  { id: 79, code: "D2", name: "Bundesliga 2" },
  { id: 135, code: "I1", name: "Serie A" },
  { id: 136, code: "I2", name: "Serie B" },
  { id: 61, code: "F1", name: "Ligue 1" },
  { id: 62, code: "F2", name: "Ligue 2" },
  { id: 94, code: "P1", name: "Primeira Liga" },
  { id: 88, code: "N1", name: "Eredivisie" },
  { id: 2, code: "UCL", name: "Champions League" },
  { id: 3, code: "UEL", name: "Europa League" },
  { id: 848, code: "UECL", name: "Conference League" },
  { id: 203, code: "T1", name: "Super Lig" },
  { id: 144, code: "B1", name: "Jupiler Pro League" },
  { id: 179, code: "SC0", name: "Scottish Premiership" },
];

// Free plan supports seasons 2022-2024
const SEASON = 2024;

async function apiFetch(endpoint: string, params: Record<string, string>, apiKey: string) {
  // Try RapidAPI format first
  const url = new URL(`https://${RAPIDAPI_HOST}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  console.log(`Fetching: ${url.toString()}`);

  const res = await fetch(url.toString(), {
    headers: {
      "x-apisports-key": apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`API error ${res.status}: ${text}`);
    throw new Error(`API-Football ${res.status}: ${text}`);
  }

  const json = await res.json();
  console.log(`Response results: ${json.results}, errors: ${JSON.stringify(json.errors)}`);
  
  if (json.errors && Object.keys(json.errors).length > 0) {
    console.error("API errors:", JSON.stringify(json.errors));
  }
  
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

    // Parse request body for options
    let mode = "fixtures"; // "fixtures" or "results" or "both"
    let leagueIds: number[] | null = null;
    try {
      const body = await req.json();
      if (body.mode) mode = body.mode;
      if (body.leagues) leagueIds = body.leagues;
    } catch { /* no body is fine */ }

    const leaguesToFetch = leagueIds
      ? LEAGUES.filter((l) => leagueIds!.includes(l.id))
      : LEAGUES;

    const allFixtures: any[] = [];
    const allResults: any[] = [];
    let apiCalls = 0;

    for (const league of leaguesToFetch) {
      // Respect rate limits — free tier is 10 req/min
      if (apiCalls >= 8) {
        // Leave headroom
        break;
      }

      if (mode === "fixtures" || mode === "both") {
        try {
          const fixtures = await apiFetch("/fixtures", {
            league: String(league.id),
            season: String(SEASON),
            next: "15",
          }, apiKey);
          apiCalls++;

          for (const f of fixtures) {
            const fixture = f.fixture;
            const teams = f.teams;
            const matchDate = fixture.date ? fixture.date.slice(0, 10) : null;
            const matchTime = fixture.date ? fixture.date.slice(11, 16) : null;

            if (!matchDate || !teams.home?.name || !teams.away?.name) continue;

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
        } catch (err) {
          console.error(`Fixtures error for ${league.name}:`, err);
        }
      }

      if (mode === "results" || mode === "both") {
        try {
          const results = await apiFetch("/fixtures", {
            league: String(league.id),
            season: String(SEASON),
            last: "10",
          }, apiKey);
          apiCalls++;

          for (const f of results) {
            const fixture = f.fixture;
            const teams = f.teams;
            const goals = f.goals;
            const score = f.score;
            const stats = f.statistics || [];
            const matchDate = fixture.date ? fixture.date.slice(0, 10) : null;

            if (!matchDate || goals.home === null || goals.away === null) continue;

            allResults.push({
              league_code: league.code,
              league_name: league.name,
              season: `${SEASON % 100}${(SEASON + 1) % 100}`,
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
        } catch (err) {
          console.error(`Results error for ${league.name}:`, err);
        }
      }
    }

    // Insert fixtures
    let fixturesInserted = 0;
    if (allFixtures.length > 0) {
      // Clear existing fixtures first
      await supabase.from("fixtures").delete().gte("match_date", "2000-01-01");

      // Deduplicate
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
        if (error) {
          console.error("Fixtures insert error:", error);
        } else {
          fixturesInserted += batch.length;
        }
      }
    }

    // Insert results (upsert-like: skip duplicates)
    let resultsInserted = 0;
    if (allResults.length > 0) {
      for (const result of allResults) {
        // Check if match already exists
        const { data: existing } = await supabase
          .from("matches")
          .select("id")
          .eq("match_date", result.match_date)
          .eq("home_team", result.home_team)
          .eq("away_team", result.away_team)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const { error } = await supabase.from("matches").insert(result);
        if (error) {
          console.error("Result insert error:", error);
        } else {
          resultsInserted++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        fixtures: fixturesInserted,
        results: resultsInserted,
        apiCalls,
        leaguesFetched: leaguesToFetch.length,
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
