import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* Known league names — fallback to code itself for unknown ones */
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const resp = await fetch("https://www.football-data.co.uk/fixtures.csv");
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `HTTP ${resp.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const csvText = await resp.text();
    const rows = parseCSV(csvText);

    // Accept ALL leagues found in the CSV, not just a hardcoded subset
    const fixtures = rows
      .filter((r) => r.Div && r.Date && r.HomeTeam && r.AwayTeam)
      .map((r) => {
        const matchDate = parseDate(r.Date);
        if (!matchDate) return null;
        const code = r.Div;
        const name = LEAGUE_NAMES[code] || code;
        return {
          league_code: code,
          league_name: name,
          match_date: matchDate,
          match_time: r.Time || null,
          home_team: r.HomeTeam,
          away_team: r.AwayTeam,
          referee: r.Referee || null,
        };
      })
      .filter(Boolean);

    let inserted = 0;
    if (fixtures.length > 0) {
      const { error: delError } = await supabase.from("fixtures").delete().gte("match_date", "2000-01-01");
      if (delError) console.error("Delete error:", delError);

      // Deduplicate
      const seen = new Set<string>();
      const uniqueFixtures = fixtures.filter((f: any) => {
        const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const batchSize = 100;
      for (let i = 0; i < uniqueFixtures.length; i += batchSize) {
        const batch = uniqueFixtures.slice(i, i + batchSize);
        const { error } = await supabase.from("fixtures").insert(batch);
        if (error) {
          console.error("Insert error:", error);
          return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      inserted = uniqueFixtures.length;
    }

    return new Response(
      JSON.stringify({ success: true, fixtures: inserted }),
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
