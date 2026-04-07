import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LEAGUES: Record<string, { code: string; name: string }> = {
  E0: { code: "E0", name: "Premier League" },
  E1: { code: "E1", name: "Championship" },
  E2: { code: "E2", name: "League One" },
  E3: { code: "E3", name: "League Two" },
  EC: { code: "EC", name: "Conference" },
  SP1: { code: "SP1", name: "La Liga" },
  SP2: { code: "SP2", name: "La Liga 2" },
  D1: { code: "D1", name: "Bundesliga" },
  D2: { code: "D2", name: "Bundesliga 2" },
  I1: { code: "I1", name: "Serie A" },
  I2: { code: "I2", name: "Serie B" },
  F1: { code: "F1", name: "Ligue 1" },
  F2: { code: "F2", name: "Ligue 2" },
  P1: { code: "P1", name: "Primeira Liga" },
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

    const fixtures = rows
      .filter((r) => LEAGUES[r.Div])
      .map((r) => {
        const matchDate = parseDate(r.Date);
        if (!matchDate || !r.HomeTeam || !r.AwayTeam) return null;
        const league = LEAGUES[r.Div];
        return {
          league_code: league.code,
          league_name: league.name,
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
      // Clear all existing fixtures first
      const { error: delError } = await supabase.from("fixtures").delete().gte("match_date", "2000-01-01");
      if (delError) {
        console.error("Delete error:", delError);
      }

      // Deduplicate fixtures by composite key before inserting
      const seen = new Set<string>();
      const uniqueFixtures = fixtures.filter((f: any) => {
        const key = `${f.league_code}|${f.match_date}|${f.home_team}|${f.away_team}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Insert in batches to avoid payload limits
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
