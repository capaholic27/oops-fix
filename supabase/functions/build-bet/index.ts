import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FixtureRow = {
  match_date: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  league_name: string;
  league_code: string;
};

async function loadUpcomingFixtures(supabase: any, leagueFilter?: string): Promise<FixtureRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let q = supabase
    .from("fixtures")
    .select("match_date, match_time, home_team, away_team, league_name, league_code")
    .gte("match_date", today)
    .lte("match_date", in7)
    .order("match_date", { ascending: true })
    .limit(80);

  if (leagueFilter) {
    q = q.ilike("league_name", `%${leagueFilter}%`);
  }

  const { data } = await q;
  return (data ?? []) as FixtureRow[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { targetOdds, riskLevel, enabledMarkets, leagueFilter, maxLegs } = await req.json();

    if (!targetOdds || !riskLevel) {
      return new Response(JSON.stringify({ error: "Missing targetOdds or riskLevel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load real upcoming fixtures from DB. Refresh once if empty.
    let fixtures = await loadUpcomingFixtures(supabase, leagueFilter);
    if (fixtures.length === 0) {
      try {
        await supabase.functions.invoke("fetch-fixtures", { body: {} });
        fixtures = await loadUpcomingFixtures(supabase, leagueFilter);
      } catch (e) {
        console.warn("fetch-fixtures invoke failed", e);
      }
    }
    // Fallback: if league filter returned nothing, use all leagues
    if (fixtures.length === 0 && leagueFilter) {
      fixtures = await loadUpcomingFixtures(supabase);
    }

    const compactFixtures = fixtures.slice(0, 60).map(f => ({
      date: f.match_date,
      time: f.match_time ?? "",
      home: f.home_team,
      away: f.away_team,
      league: f.league_name,
    }));

    const allMarkets = [
      "1X2 (Home Win / Draw / Away Win)", "Double Chance (1X, X2, 12)", "Draw No Bet",
      "Over/Under Goals (0.5, 1.5, 2.5, 3.5, 4.5)", "Both Teams To Score (BTTS Yes/No)",
      "Correct Score (e.g. 1-0, 2-1, 0-0)", "Half-Time / Full-Time",
      "Goal in Both Halves", "Clean Sheet (Yes/No per team)", "Win to Nil",
      "Over/Under Corners (7.5, 8.5, 9.5, 10.5, 11.5)", "Asian Handicap Corners", "Total Team Corners",
      "Over/Under Cards (2.5, 3.5, 4.5, 5.5)", "Total Team Cards", "Player To Be Carded",
      "Over/Under Fouls (18.5, 20.5, 22.5, 24.5)", "Total Team Fouls",
      "Over/Under Shots (18.5, 20.5, 22.5)", "Over/Under Shots on Target (4.5, 5.5, 6.5, 7.5)",
      "Team Shots on Target (Over/Under per team)", "Offsides (Over/Under 3.5, 4.5)",
    ];

    const markets = enabledMarkets?.length
      ? allMarkets.filter(m => enabledMarkets.some((em: string) => m.toLowerCase().includes(em.toLowerCase())))
      : allMarkets;

    const haveFixtures = compactFixtures.length > 0;

    const systemPrompt = `You are an elite sports betting strategist AI. You build optimized bet slips (singles, doubles, parlays/accumulators) for users.

ALLOWED MARKETS (ONLY use these):
${markets.map(m => `- ${m}`).join("\n")}

RULES:
- Construct a bet slip that approximately hits the target combined odds.
- ${haveFixtures
    ? `MANDATORY: Only use matches from the FIXTURES list below. Use the EXACT team names and EXACT match_date as provided. Do NOT invent matches.`
    : `No fixture context available — generate plausible upcoming matches and use a date of today or tomorrow.`}
- If REQUIRED NUMBER OF LEGS is given, use EXACTLY that many legs.
- ODDS CALIBRATION: Each leg's odds MUST match real bookmakers (Bet365, Pinnacle):
  • Heavy favorite ML: 1.20-1.50  • Moderate favorite: 1.55-1.90
  • Even matchup: 1.95-2.20  • Underdog: 2.30-4.50  • Big underdog: 5.00+
  • Over 2.5 goals: 1.85-2.05  • BTTS Yes: 1.70-1.95
  • Over 9.5 corners: 1.85-2.10  • Over 4.5 cards: 1.90-2.15
  • Correct score: 6.00-15.00 typical
- Combined odds = product of leg odds (round to 2 decimals).
- Use DIVERSE markets (don't repeat the same market across legs).
- Each leg needs a short data-driven reason.
- Output STRICT JSON:
{
  "slip": [
    { "match": "Home Team vs Away Team", "matchDate": "YYYY-MM-DD", "matchTime": "HH:MM", "league": "Premier League", "market": "Over 9.5 Corners", "odds": 1.85, "confidence": "high", "reason": "..." }
  ],
  "combinedOdds": 3.20,
  "riskAssessment": "...",
  "expectedValue": "...",
  "advice": "..."
}

CRITICAL: "matchDate" (YYYY-MM-DD) is REQUIRED for every leg — used for automatic result verification. "matchTime" optional (HH:MM 24h). "league" optional but recommended.`;

    const userPrompt = `Build me a bet slip.

TARGET ODDS: ${targetOdds}
RISK LEVEL: ${riskLevel}
${maxLegs ? `REQUIRED NUMBER OF LEGS: EXACTLY ${maxLegs} legs.` : ""}
${leagueFilter ? `LEAGUE FOCUS: ${leagueFilter}. If insufficient fixtures in this league, mention this in "advice".` : ""}

${haveFixtures
  ? `FIXTURES (use ONLY these, verbatim team names, exact date):\n${JSON.stringify(compactFixtures, null, 2)}`
  : "No fixture data available — pick reasonable upcoming top-league matches with today/tomorrow's date."}

Return ONLY valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? "";
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { raw: content };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("build-bet error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
