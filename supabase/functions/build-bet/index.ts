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

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function loadUpcomingFixtures(
  supabase: any,
  opts: { leagueFilter?: string; targetDate?: string; rangeDays?: number }
): Promise<FixtureRow[]> {
  const start = opts.targetDate || today();
  const end = opts.targetDate
    ? opts.targetDate
    : addDays(opts.rangeDays ?? 7);

  let q = supabase
    .from("fixtures")
    .select("match_date, match_time, home_team, away_team, league_name, league_code")
    .gte("match_date", start)
    .lte("match_date", end)
    .order("match_date", { ascending: true })
    .limit(120);

  if (opts.leagueFilter) {
    q = q.ilike("league_name", `%${opts.leagueFilter}%`);
  }

  const { data } = await q;
  return (data ?? []) as FixtureRow[];
}

async function loadInjuriesForTeams(
  supabase: any,
  teams: string[]
): Promise<Record<string, Array<{ player: string; reason: string; type: string }>>> {
  if (teams.length === 0) return {};
  const { data } = await supabase
    .from("team_injuries")
    .select("team_name, injuries")
    .in("team_name", teams);
  const out: Record<string, Array<{ player: string; reason: string; type: string }>> = {};
  for (const row of (data ?? []) as any[]) {
    const list = Array.isArray(row.injuries) ? row.injuries : [];
    out[row.team_name] = list
      .slice(0, 6)
      .map((i: any) => ({
        player: i.playerName || i.player || "Unknown",
        reason: i.reason || "Unavailable",
        type: i.type || "",
      }));
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { targetOdds, riskLevel, enabledMarkets, leagueFilter, maxLegs, targetDate, stakeAmount, desiredWinAmount } = await req.json();

    // Resolve target odds: explicit, OR derived from stake + desired win.
    // Profit = stake × (odds - 1)  → odds = profit/stake + 1
    let resolvedTargetOdds: number | undefined = typeof targetOdds === "number" ? targetOdds : undefined;
    if (!resolvedTargetOdds && stakeAmount && desiredWinAmount) {
      const s = Number(stakeAmount);
      const w = Number(desiredWinAmount);
      if (s > 0 && w > 0) {
        resolvedTargetOdds = Number((w / s + 1).toFixed(2));
      }
    }

    if (!resolvedTargetOdds || !riskLevel) {
      return new Response(JSON.stringify({ error: "Missing targetOdds (or stake+desiredWin) and riskLevel" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate target date is today or future
    let effectiveDate: string | undefined = targetDate;
    if (effectiveDate && effectiveDate < today()) {
      return new Response(JSON.stringify({
        error: `Cannot build bets for past dates. Choose ${today()} or later.`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load fixtures (single date, OR next 7 days). Auto-sync if missing/stale.
    let fixtures = await loadUpcomingFixtures(supabase, { leagueFilter, targetDate: effectiveDate });

    // Auto-sync trigger: empty for selected date, OR all fixtures are stale (>6h)
    let needsSync = fixtures.length === 0;
    if (!needsSync && fixtures.length > 0) {
      // Stale check: if newest fixture row was created >6h ago, refresh
      const { data: freshness } = await supabase
        .from("fixtures")
        .select("created_at")
        .gte("match_date", effectiveDate || today())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (freshness?.created_at) {
        const ageHours = (Date.now() - new Date(freshness.created_at).getTime()) / 3600000;
        if (ageHours > 6) needsSync = true;
      }
    }

    if (needsSync) {
      try {
        // Pass targetDate so fetch-fixtures spends only 1 API call (not 7)
        await supabase.functions.invoke("fetch-fixtures", {
          body: effectiveDate ? { targetDate: effectiveDate } : { force: false },
        });
        fixtures = await loadUpcomingFixtures(supabase, { leagueFilter, targetDate: effectiveDate });
      } catch (e) {
        console.warn("fetch-fixtures invoke failed", e);
      }
    }
    // Fallback: drop league filter if it killed the result
    if (fixtures.length === 0 && leagueFilter) {
      fixtures = await loadUpcomingFixtures(supabase, { targetDate: effectiveDate });
    }
    // Final fallback: widen to next 14 days if a specific date had nothing
    if (fixtures.length === 0 && effectiveDate) {
      fixtures = await loadUpcomingFixtures(supabase, { leagueFilter, rangeDays: 14 });
    }

    // STRICT FUTURE-ONLY guard: drop any past dates that may have leaked in
    fixtures = fixtures.filter(f => f.match_date >= today());

    const compactFixtures = fixtures.slice(0, 80).map(f => ({
      date: f.match_date,
      time: f.match_time ?? "",
      home: f.home_team,
      away: f.away_team,
      league: f.league_name,
    }));

    // Pull injury context for the involved teams
    const teamSet = new Set<string>();
    for (const f of compactFixtures) { teamSet.add(f.home); teamSet.add(f.away); }
    const injuries = await loadInjuriesForTeams(supabase, Array.from(teamSet));
    const injurySummary: Record<string, string> = {};
    for (const [team, list] of Object.entries(injuries)) {
      if (list.length === 0) continue;
      injurySummary[team] = list
        .map(i => `${i.player} (${i.reason}${i.type ? ` — ${i.type}` : ""})`)
        .join("; ");
    }

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
    const TODAY_STR = today();

    const systemPrompt = `You are an elite sports betting strategist AI. You build optimized bet slips (singles, doubles, parlays/accumulators) for users.

ALLOWED MARKETS (ONLY use these):
${markets.map(m => `- ${m}`).join("\n")}

HARD RULES:
- TODAY IS ${TODAY_STR}. EVERY leg's matchDate MUST be ${TODAY_STR} or LATER. NEVER use a past date. NEVER use last year.
- ${haveFixtures
    ? `MANDATORY: Only use matches from the FIXTURES list below. Use the EXACT team names and EXACT date as provided. Do NOT invent matches.`
    : `No fixture context available — DO NOT fabricate matches. Return an empty slip with advice asking the user to retry once fixtures are loaded.`}
- If REQUIRED NUMBER OF LEGS is given, use EXACTLY that many legs.
- Use INJURY CONTEXT to inform picks. If a key player is out (striker, keeper, top defender), reflect that in the reasoning AND in the market choice (e.g. star striker out → consider Under 2.5 or opposing clean sheet).
- ODDS CALIBRATION: each leg's odds must match real bookmakers (Bet365, Pinnacle):
  • Heavy favorite ML: 1.20-1.50  • Moderate favorite: 1.55-1.90
  • Even matchup: 1.95-2.20  • Underdog: 2.30-4.50  • Big underdog: 5.00+
  • Over 2.5 goals: 1.85-2.05  • BTTS Yes: 1.70-1.95
  • Over 9.5 corners: 1.85-2.10  • Over 4.5 cards: 1.90-2.15
  • Correct score: 6.00-15.00 typical
- Combined odds = product of leg odds (round to 2 decimals).
- Use DIVERSE markets across legs.
- Each leg's reason MUST mention the specific match context (form, H2H, OR injury impact when relevant).

Output STRICT JSON:
{
  "slip": [
    {
      "match": "Home Team vs Away Team",
      "matchDate": "YYYY-MM-DD",
      "matchTime": "HH:MM",
      "league": "Premier League",
      "market": "Over 9.5 Corners",
      "odds": 1.85,
      "confidence": "high",
      "reason": "...",
      "injuryImpact": "Optional: e.g. 'Haaland out — limits goal threat' OR null"
    }
  ],
  "combinedOdds": 3.20,
  "riskAssessment": "...",
  "expectedValue": "...",
  "advice": "..."
}`;

    const injuriesBlock = Object.keys(injurySummary).length > 0
      ? `\n\nINJURY CONTEXT (key absences for involved teams):\n${Object.entries(injurySummary).map(([t, s]) => `- ${t}: ${s}`).join("\n")}`
      : "";

    const userPrompt = `Build me a bet slip.

TODAY: ${TODAY_STR}
TARGET ODDS: ${targetOdds}
RISK LEVEL: ${riskLevel}
${effectiveDate ? `TARGET MATCH DATE: ${effectiveDate} (use ONLY matches from this date if any exist)` : `DATE WINDOW: ${TODAY_STR} to ${addDays(7)}`}
${maxLegs ? `REQUIRED NUMBER OF LEGS: EXACTLY ${maxLegs} legs.` : ""}
${leagueFilter ? `LEAGUE FOCUS: ${leagueFilter}.` : ""}

${haveFixtures
  ? `UPCOMING FIXTURES (use ONLY these, verbatim team names + exact date):\n${JSON.stringify(compactFixtures, null, 2)}`
  : "NO FIXTURE DATA AVAILABLE — return slip:[] with advice asking the user to wait for fixtures to refresh."}
${injuriesBlock}

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

    // Server-side guard: drop any leg whose date is in the past
    if (Array.isArray(parsed?.slip)) {
      const before = parsed.slip.length;
      parsed.slip = parsed.slip.filter((leg: any) => {
        if (!leg?.matchDate) return false;
        return String(leg.matchDate) >= TODAY_STR;
      });
      if (parsed.slip.length < before) {
        parsed.advice = (parsed.advice ? parsed.advice + " " : "") +
          `Removed ${before - parsed.slip.length} leg(s) with past dates.`;
      }
      // Recompute combined odds
      if (parsed.slip.length > 0) {
        parsed.combinedOdds = Number(
          parsed.slip.reduce((acc: number, l: any) => acc * (Number(l.odds) || 1), 1).toFixed(2)
        );
      }
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
