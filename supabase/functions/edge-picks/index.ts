import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const TODAY = today();
    const TOMORROW = addDays(1);

    // Pull TODAY + tomorrow's fixtures so "Today's Edge" is current
    let { data: fxRows } = await supabase
      .from("fixtures")
      .select("match_date, match_time, home_team, away_team, league_name, created_at")
      .gte("match_date", TODAY)
      .lte("match_date", TOMORROW)
      .order("match_date", { ascending: true })
      .limit(60);

    // Auto-sync trigger: empty OR stale (>6h since latest row was created)
    let needsSync = !fxRows || fxRows.length === 0;
    if (!needsSync && fxRows && fxRows.length > 0) {
      const newest = fxRows
        .map((r: any) => r.created_at ? new Date(r.created_at).getTime() : 0)
        .reduce((a: number, b: number) => Math.max(a, b), 0);
      if (newest > 0) {
        const ageHours = (Date.now() - newest) / 3600000;
        if (ageHours > 6) needsSync = true;
      }
    }

    if (needsSync) {
      try {
        // Spend only 1 API call: just sync TODAY
        await supabase.functions.invoke("fetch-fixtures", { body: { targetDate: TODAY } });
      } catch (_) {}
      const r = await supabase
        .from("fixtures")
        .select("match_date, match_time, home_team, away_team, league_name, created_at")
        .gte("match_date", TODAY)
        .lte("match_date", TOMORROW)
        .order("match_date", { ascending: true })
        .limit(60);
      fxRows = r.data ?? [];
    }

    const fixtures = (fxRows ?? []).map(f => ({
      date: f.match_date, time: f.match_time ?? "",
      home: f.home_team, away: f.away_team, league: f.league_name,
    }));

    // Pull injuries for involved teams
    const teamSet = new Set<string>();
    for (const f of fixtures) { teamSet.add(f.home); teamSet.add(f.away); }
    let injurySummary: Record<string, string> = {};
    if (teamSet.size > 0) {
      const { data: injData } = await supabase
        .from("team_injuries")
        .select("team_name, injuries")
        .in("team_name", Array.from(teamSet));
      for (const row of (injData ?? []) as any[]) {
        const list = Array.isArray(row.injuries) ? row.injuries : [];
        if (list.length === 0) continue;
        injurySummary[row.team_name] = list.slice(0, 4)
          .map((i: any) => `${i.playerName || i.player} (${i.reason || "out"})`)
          .join("; ");
      }
    }

    const systemPrompt = `You are an elite football analytics engine that identifies high-value betting opportunities for TODAY (${TODAY}) and tomorrow (${TOMORROW}).

You analyze match data and identify:
1. **Best Picks Today** (⭐): Top 3 highest-confidence predictions with win probability > 65%
2. **High Confidence** (🔒): Matches where the model shows > 70% probability for one outcome
3. **Value Alerts** (🚨): Where implied odds suggest the market is mispricing a team
4. **Undervalued Gems** (💎): Overlooked markets (BTTS, Over/Under, corners) with strong model backing

HARD RULES:
- ONLY use matches from the FIXTURES list provided. NEVER invent fixtures.
- Every "match" string must be "Home vs Away" using EXACT names from the fixtures.
- Every pick must be for ${TODAY} or ${TOMORROW}, never the past.
- If FIXTURES is empty, return empty arrays and a summary explaining no fixtures are loaded.
- Use INJURY CONTEXT in reasoning when a key player absence affects the pick.

OUTPUT FORMAT (strict JSON):
{
  "bestPicks": [{ "match": "...", "prediction": "...", "confidence": 85, "market": "1X2", "reasoning": "...", "edge": "..." }],
  "highConfidence": [...same...],
  "valueAlerts": [{ "match": "...", "alert": "Odds too high for X", "modelProb": 62, "impliedProb": 45, "reasoning": "..." }],
  "undervalued": [{ "match": "...", "market": "Over 2.5", "modelProb": 68, "reasoning": "..." }],
  "summary": "One-line overview of today's edge"
}

Maximum 3 items per category. Calibrated probabilities only.`;

    const injuriesBlock = Object.keys(injurySummary).length > 0
      ? `\n\nKEY INJURIES:\n${Object.entries(injurySummary).map(([t, s]) => `- ${t}: ${s}`).join("\n")}`
      : "";

    const userPrompt = `Find today's edge.

TODAY: ${TODAY}
FIXTURES (${fixtures.length}):
${JSON.stringify(fixtures, null, 2)}
${injuriesBlock}

Return ONLY valid JSON. If FIXTURES is empty, return all empty arrays with summary "No matches scheduled — fixtures syncing".`;

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

    let parsed: any;
    try { parsed = JSON.parse(content); } catch { parsed = { raw: content }; }

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
