import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { teamName, stats, recentForm, upcomingOpponent, opponentStats, opponentForm } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are an elite football analyst. Predict the upcoming match outcome based on the data provided. Consider:
- Recent form and momentum (wins/losses streak, confidence)
- Tactical style matchup (pressing vs counter-attack, etc.)
- Discipline (cards, fouls — will they play cautious after yellows?)
- Scoring patterns (over/under trends, clean sheets, BTTS)
- Home/away advantage
- Head-to-head implied tendencies

Give a confident, detailed prediction with:
1. Predicted score (e.g. "2-1")
2. Match outcome (Win/Draw/Loss for the team)
3. Key factors that will decide the game
4. Risk assessment (what could go wrong)
5. Betting insights (over/under, BTTS, corners, cards)

Keep it punchy and insightful, like a premium tipster. Use data to back every claim. 300 words max.`;

    const userPrompt = `TEAM: ${teamName}
STATS (last ${stats.matchesPlayed} games):
- Record: ${stats.wins}W ${stats.draws}D ${stats.losses}L
- Goals: ${stats.goalsFor} scored, ${stats.goalsAgainst} conceded
- Win rate: ${stats.winProbability.toFixed(1)}%
- Avg shots: ${stats.avgShotsFor.toFixed(1)} for, ${stats.avgShotsAgainst.toFixed(1)} against
- Avg SOT: ${stats.avgShotsOnTargetFor.toFixed(1)} for
- Avg corners: ${stats.avgCornersFor.toFixed(1)} for, ${stats.avgCornersAgainst.toFixed(1)} against
- Avg fouls: ${stats.avgFoulsCommitted.toFixed(1)} committed, ${stats.avgFoulsDrawn.toFixed(1)} drawn
- Avg yellows: ${stats.avgYellowCards.toFixed(1)}, reds: ${stats.avgRedCards.toFixed(2)}
- Clean sheets: ${stats.cleanSheets}
- BTTS: ${stats.bttsPercentage.toFixed(0)}%, Over 2.5: ${stats.over25Percentage.toFixed(0)}%, Over 1.5: ${stats.over15Percentage.toFixed(0)}%
- Style: ${stats.tacticalProfile.style} (${stats.tacticalProfile.description})
- Form last 5: ${recentForm.join(" ")}

${upcomingOpponent ? `OPPONENT: ${upcomingOpponent}
OPPONENT STATS (last ${opponentStats?.matchesPlayed ?? "?"} games):
- Record: ${opponentStats?.wins ?? "?"}W ${opponentStats?.draws ?? "?"}D ${opponentStats?.losses ?? "?"}L
- Goals: ${opponentStats?.goalsFor ?? "?"} scored, ${opponentStats?.goalsAgainst ?? "?"} conceded
- Win rate: ${opponentStats?.winProbability?.toFixed(1) ?? "?"}%
- Style: ${opponentStats?.tacticalProfile?.style ?? "Unknown"}
- Form last 5: ${opponentForm?.join(" ") ?? "N/A"}` : "No specific opponent selected — predict their general next match outlook."}

Predict the outcome.`;

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
    const prediction = data.choices?.[0]?.message?.content ?? "Unable to generate prediction.";

    return new Response(JSON.stringify({ prediction }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
