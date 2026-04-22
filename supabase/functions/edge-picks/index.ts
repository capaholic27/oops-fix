import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { fixtures, matchStats } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an elite football analytics engine that identifies high-value betting opportunities. You analyze match data and identify:

1. **Best Picks Today** (⭐): Top 3 highest-confidence predictions with win probability > 65%
2. **High Confidence** (🔒): Matches where the model shows > 70% probability for one outcome
3. **Value Alerts** (🚨): Where implied odds suggest the market is mispricing a team — "odds too high for X"
4. **Undervalued Gems** (💎): Overlooked markets (BTTS, Over/Under, corners) with strong model backing

OUTPUT FORMAT (JSON):
{
  "bestPicks": [
    { "match": "...", "prediction": "...", "confidence": 85, "market": "1X2", "reasoning": "...", "edge": "..." }
  ],
  "highConfidence": [...same format...],
  "valueAlerts": [
    { "match": "...", "alert": "Odds too high for X", "modelProb": 62, "impliedProb": 45, "reasoning": "..." }
  ],
  "undervalued": [
    { "match": "...", "market": "Over 2.5", "modelProb": 68, "reasoning": "..." }
  ],
  "summary": "One-line overview of today's edge"
}

Rules:
- All probabilities must be realistic and calibrated
- Never guarantee outcomes
- Maximum 3 items per category
- Focus on actionable insight, not narrative`;

    const userPrompt = `Analyze these matches and find today's edge:

FIXTURES: ${JSON.stringify(fixtures ?? [])}
MATCH STATS: ${JSON.stringify(matchStats ?? [])}

If no real data provided, generate realistic examples based on current top European league form. Return ONLY valid JSON.`;

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
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content ?? "";
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
    console.error("edge-picks error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
