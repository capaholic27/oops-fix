import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { targetOdds, riskLevel, availableMatches } = await req.json();

    if (!targetOdds || !riskLevel) {
      return new Response(JSON.stringify({ error: "Missing targetOdds or riskLevel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an elite sports betting strategist AI. You build optimized bet slips (singles, doubles, parlays/accumulators) for users.

AVAILABLE MARKETS (use a mix for diversity):
- 1X2 (Home Win / Draw / Away Win)
- Double Chance (1X, X2, 12)
- Over/Under Goals (0.5, 1.5, 2.5, 3.5, 4.5)
- Both Teams To Score (BTTS Yes/No)
- Correct Score (e.g. 1-0, 2-1, 0-0)
- Half-Time / Full-Time
- First/Last/Anytime Goalscorer
- Over/Under Corners (7.5, 8.5, 9.5, 10.5, 11.5)
- Asian Handicap Corners
- Total Team Corners (Over/Under per team)
- Over/Under Cards (2.5, 3.5, 4.5, 5.5)
- Total Team Cards
- Player To Be Carded
- Over/Under Fouls (18.5, 20.5, 22.5, 24.5)
- Total Team Fouls
- Over/Under Shots (18.5, 20.5, 22.5)
- Over/Under Shots on Target (4.5, 5.5, 6.5, 7.5)
- Team Shots on Target (Over/Under per team)
- Offsides (Over/Under 3.5, 4.5)
- Goal in Both Halves
- Clean Sheet (Yes/No per team)
- Win to Nil
- Half with Most Goals
- Highest Scoring Half
- Draw No Bet

RULES:
- User provides a TARGET combined odds and a RISK LEVEL (low, medium, high).
- You must construct a bet slip that approximately hits the target odds.
- Low risk: favor heavy favorites, 1X2 / double chance / under goals / over corners. Max 2-3 legs.
- Medium risk: mix result markets with stat markets (corners, cards, shots). 3-4 legs allowed.
- High risk: include underdogs, correct scores, player cards, BTTS + corners combos. 4-6 legs allowed.
- USE DIVERSE MARKETS — don't just pick 1X2 for every leg. Mix in corners, cards, fouls, shots markets.
- Each leg must have a clear data-driven reason referencing team tendencies.
- Show individual odds per leg and the combined accumulator odds.
- If target odds are unrealistic for the risk level, say so and suggest alternatives.
- Format output as JSON with this structure:
{
  "slip": [
    { "match": "Team A vs Team B", "market": "Over 9.5 Corners", "odds": 1.85, "confidence": "high", "reason": "Both teams average 5.5+ corners per game" }
  ],
  "combinedOdds": 3.2,
  "riskAssessment": "...",
  "expectedValue": "...",
  "advice": "..."
}

Be realistic. Calibrate odds to actual football probabilities. Never guarantee wins.`;

    const userPrompt = `Build me a bet slip.

TARGET ODDS: ${targetOdds}
RISK LEVEL: ${riskLevel}

${availableMatches ? `AVAILABLE MATCHES & MODEL DATA:\n${JSON.stringify(availableMatches, null, 2)}` : "Use typical Premier League / top European league matches for today. Generate realistic example matches with calibrated odds."}

Return ONLY valid JSON matching the schema above.`;

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

    // Strip markdown code fences if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed;
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
