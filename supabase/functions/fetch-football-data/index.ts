import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LEAGUES: Record<string, { code: string; name: string; file: string }> = {
  E0: { code: "E0", name: "Premier League", file: "E0" },
  SP1: { code: "SP1", name: "La Liga", file: "SP1" },
  D1: { code: "D1", name: "Bundesliga", file: "D1" },
  I1: { code: "I1", name: "Serie A", file: "I1" },
  F1: { code: "F1", name: "Ligue 1", file: "F1" },
};

function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(",");
    if (vals.length < headers.length) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = vals[idx]?.trim() ?? ""));
    rows.push(row);
  }
  return rows;
}

function parseDate(dateStr: string): string | null {
  // dd/mm/yyyy format
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function safeInt(val: string | undefined): number {
  const n = parseInt(val ?? "0", 10);
  return isNaN(n) ? 0 : n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const season = url.searchParams.get("season") || "2425";
    const leagueParam = url.searchParams.get("league"); // optional, fetch all if not specified

    const leaguesToFetch = leagueParam
      ? [LEAGUES[leagueParam]].filter(Boolean)
      : Object.values(LEAGUES);

    const results: { league: string; inserted: number; error?: string }[] = [];

    for (const league of leaguesToFetch) {
      try {
        const csvUrl = `https://www.football-data.co.uk/mmz4281/${season}/${league.file}.csv`;
        const resp = await fetch(csvUrl);
        if (!resp.ok) {
          results.push({ league: league.name, inserted: 0, error: `HTTP ${resp.status}` });
          continue;
        }
        const csvText = await resp.text();
        const rows = parseCSV(csvText);

        const matches = rows
          .map((r) => {
            const matchDate = parseDate(r.Date);
            if (!matchDate || !r.HomeTeam || !r.AwayTeam) return null;
            return {
              league_code: league.code,
              league_name: league.name,
              season,
              match_date: matchDate,
              home_team: r.HomeTeam,
              away_team: r.AwayTeam,
              ft_home_goals: safeInt(r.FTHG),
              ft_away_goals: safeInt(r.FTAG),
              ft_result: r.FTR || null,
              ht_home_goals: safeInt(r.HTHG),
              ht_away_goals: safeInt(r.HTAG),
              ht_result: r.HTR || null,
              home_shots: safeInt(r.HS),
              away_shots: safeInt(r.AS),
              home_shots_target: safeInt(r.HST),
              away_shots_target: safeInt(r.AST),
              home_fouls: safeInt(r.HF),
              away_fouls: safeInt(r.AF),
              home_corners: safeInt(r.HC),
              away_corners: safeInt(r.AC),
              home_yellows: safeInt(r.HY),
              away_yellows: safeInt(r.AY),
              home_reds: safeInt(r.HR),
              away_reds: safeInt(r.AR),
              referee: r.Referee || null,
            };
          })
          .filter(Boolean);

        if (matches.length > 0) {
          const { error } = await supabase
            .from("matches")
            .upsert(matches, {
              onConflict: "league_code,season,match_date,home_team,away_team",
            });

          if (error) {
            results.push({ league: league.name, inserted: 0, error: error.message });
          } else {
            results.push({ league: league.name, inserted: matches.length });
          }
        } else {
          results.push({ league: league.name, inserted: 0, error: "No valid rows" });
        }
      } catch (e) {
        results.push({ league: league.name, inserted: 0, error: String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
