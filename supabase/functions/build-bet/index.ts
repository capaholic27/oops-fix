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

    // Build per-team context: last 8 matches form + simple averages.
    const allTeams = Array.from(teamSet);
    const teamContextById = new Map<string, string>();
    if (allTeams.length > 0) {
      const [{ data: rowsH = [] }, { data: rowsA = [] }] = await Promise.all([
        supabase.from("matches")
          .select("home_team, away_team, ft_home_goals, ft_away_goals, home_corners, away_corners, home_yellows, away_yellows, home_reds, away_reds, home_shots, away_shots, match_date")
          .in("home_team", allTeams).order("match_date", { ascending: false }).limit(400),
        supabase.from("matches")
          .select("home_team, away_team, ft_home_goals, ft_away_goals, home_corners, away_corners, home_yellows, away_yellows, home_reds, away_reds, home_shots, away_shots, match_date")
          .in("away_team", allTeams).order("match_date", { ascending: false }).limit(400),
      ]);
      const rows = [...(rowsH ?? []), ...(rowsA ?? [])];
      const byTeam = new Map<string, any[]>();
      for (const r of rows as any[]) {
        for (const t of [r.home_team, r.away_team]) {
          if (!allTeams.includes(t)) continue;
          if (!byTeam.has(t)) byTeam.set(t, []);
          if (byTeam.get(t)!.length < 8) byTeam.get(t)!.push(r);
        }
      }
      for (const [team, list] of byTeam.entries()) {
        if (list.length === 0) continue;
        let gf = 0, ga = 0, cf = 0, ca = 0, cardsF = 0, cardsA = 0, sf = 0, sa = 0, w = 0, d = 0, l = 0;
        const form: string[] = [];
        for (const r of list) {
          const isHome = r.home_team === team;
          const ourG  = isHome ? r.ft_home_goals : r.ft_away_goals;
          const oppG  = isHome ? r.ft_away_goals : r.ft_home_goals;
          const ourC  = isHome ? (r.home_corners ?? 0) : (r.away_corners ?? 0);
          const oppC  = isHome ? (r.away_corners ?? 0) : (r.home_corners ?? 0);
          const ourCd = isHome ? (r.home_yellows ?? 0) + (r.home_reds ?? 0) : (r.away_yellows ?? 0) + (r.away_reds ?? 0);
          const oppCd = isHome ? (r.away_yellows ?? 0) + (r.away_reds ?? 0) : (r.home_yellows ?? 0) + (r.home_reds ?? 0);
          const ourS  = isHome ? (r.home_shots ?? 0) : (r.away_shots ?? 0);
          const oppS  = isHome ? (r.away_shots ?? 0) : (r.home_shots ?? 0);
          gf += ourG; ga += oppG; cf += ourC; ca += oppC;
          cardsF += ourCd; cardsA += oppCd; sf += ourS; sa += oppS;
          if (ourG > oppG) { w++; form.push("W"); }
          else if (ourG < oppG) { l++; form.push("L"); }
          else { d++; form.push("D"); }
        }
        const n = list.length;
        teamContextById.set(team,
          `Last ${n}: ${w}W-${d}D-${l}L | GF/GA ${(gf/n).toFixed(1)}/${(ga/n).toFixed(1)} | Corners ${(cf/n).toFixed(1)}f/${(ca/n).toFixed(1)}a | Cards ${(cardsF/n).toFixed(1)}f/${(cardsA/n).toFixed(1)}a | Shots ${(sf/n).toFixed(1)}f/${(sa/n).toFixed(1)}a | Form ${form.slice(0,5).join("")}`
        );
      }
    }

    const allMarkets = [
      "1X2 (Home Win / Draw / Away Win)", "Double Chance (1X, X2, 12)", "Draw No Bet",
      "Over/Under Goals (0.5, 1.5, 2.5, 3.5, 4.5)", "Both Teams To Score (BTTS Yes/No)",
      "Correct Score (e.g. 1-0, 2-1, 0-0)", "Half-Time / Full-Time",
      "Goal in Both Halves", "Clean Sheet (Yes/No per team)", "Win to Nil",
      "Team Total Goals (Home/Away over 0.5/1.5/2.5)",
      "Team Corners — Home N+ / Away N+ (e.g. Home 5+ Corners)",
      "Team Cards — Home N+ / Away N+ (e.g. Away 2+ Cards)",
      "Team Shots — Home N+ / Away N+",
      "Team Fouls — Home N+ / Away N+",
      "Total Corners Over/Under (8.5, 9.5, 10.5, 11.5)",
      "Total Cards Over/Under (2.5, 3.5, 4.5, 5.5)",
      "Total Fouls Over/Under (18.5, 20.5, 22.5)",
      "Total Shots Over/Under (18.5, 20.5, 22.5)",
      "Total Shots on Target Over/Under (4.5, 5.5, 6.5, 7.5)",
      "Offsides Over/Under (3.5, 4.5)",
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
- Use TEAM CONTEXT (last-8 form, goals, corners, cards, shots) and INJURY CONTEXT to drive every pick. Quote the relevant number in the reason (e.g. "Liverpool 6.4 corners/g at home, Brighton 4.1 conceded → Home 6+ Corners").
- DO NOT default to "Over 9.5 Corners" or any single market across multiple legs. The slip MUST be DIVERSE: cover at least 3 different market families when slip has 3+ legs (e.g. one Result, one Goals/BTTS, one Team-stat). Same market may repeat at most once per slip.
- For team-stat markets, prefer side-specific lines tuned to the team average (e.g. team averages 5.8 corners → Home 5+ Corners; averages 1.9 cards → Away 2+ Cards).  Set thresholds 0.5–1 below the average so the line is realistic.
- ODDS CALIBRATION (must match real bookmakers — Bet365, Pinnacle):
  • Heavy favorite ML: 1.20-1.50  • Moderate favorite: 1.55-1.90
  • Even matchup: 1.95-2.20  • Underdog: 2.30-4.50  • Big underdog: 5.00+
  • Over 2.5 goals: 1.85-2.05  • BTTS Yes: 1.70-1.95
  • Over 9.5 corners: 1.85-2.10  • Over 4.5 cards: 1.90-2.15
  • Team N+ corners (just below avg): 1.50-1.85
  • Team N+ cards (just below avg): 1.55-1.95
  • Correct score: 6.00-15.00 typical
- Combined odds = product of leg odds (round to 2 decimals).
- Each leg's reason MUST cite specific numbers from TEAM CONTEXT or INJURY CONTEXT — not generic "good form".

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

    const teamCtxBlock = teamContextById.size > 0
      ? `\n\nTEAM CONTEXT (last-8 averages — cite these numbers in every "reason"):\n${[...teamContextById.entries()].map(([t, s]) => `- ${t}: ${s}`).join("\n")}`
      : "";

    const userPrompt = `Build me a bet slip.

TODAY: ${TODAY_STR}
TARGET ODDS: ${resolvedTargetOdds}${stakeAmount && desiredWinAmount ? ` (derived from stake $${stakeAmount} → win $${desiredWinAmount})` : ""}
RISK LEVEL: ${riskLevel}
${effectiveDate ? `TARGET MATCH DATE: ${effectiveDate} (use ONLY matches from this date if any exist)` : `DATE WINDOW: ${TODAY_STR} to ${addDays(7)}`}
${maxLegs ? `REQUIRED NUMBER OF LEGS: EXACTLY ${maxLegs} legs.` : ""}
${leagueFilter ? `LEAGUE FOCUS: ${leagueFilter}.` : ""}

${haveFixtures
  ? `UPCOMING FIXTURES (use ONLY these, verbatim team names + exact date):\n${JSON.stringify(compactFixtures, null, 2)}`
  : "NO FIXTURE DATA AVAILABLE — return slip:[] with advice asking the user to wait for fixtures to refresh."}
${injuriesBlock}${teamCtxBlock}

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

    // Server-side guards: (1) drop past dates, (2) verify each leg matches a real fixture
    // (our `fixtures` table is sourced from Fotmob — so this is the Fotmob verification step).
    if (Array.isArray(parsed?.slip)) {
      const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      // Build a fixture index: key = `${date}|${home}|${away}` (normalized)
      const fixtureIndex = new Map<string, { home: string; away: string; date: string; time: string | null; league: string }>();
      for (const f of fixtures) {
        const k1 = `${f.match_date}|${norm(f.home_team)}|${norm(f.away_team)}`;
        const k2 = `${f.match_date}|${norm(f.away_team)}|${norm(f.home_team)}`;
        const v = { home: f.home_team, away: f.away_team, date: f.match_date, time: f.match_time, league: f.league_name };
        fixtureIndex.set(k1, v);
        fixtureIndex.set(k2, v);
      }
      const before = parsed.slip.length;
      const dropped: string[] = [];
      parsed.slip = parsed.slip.filter((leg: any) => {
        if (!leg?.matchDate || String(leg.matchDate) < TODAY_STR) {
          if (leg?.match) dropped.push(`${leg.match} (past date)`);
          return false;
        }
        // Parse "Home vs Away"
        const m = String(leg.match || "").split(/\s+vs\s+|\s+v\s+/i);
        if (m.length !== 2) { dropped.push(leg.match || "?"); return false; }
        const key = `${leg.matchDate}|${norm(m[0])}|${norm(m[1])}`;
        const fx = fixtureIndex.get(key);
        if (!fx) { dropped.push(`${leg.match} (not in Fotmob fixtures)`); return false; }
        // Snap exact names + time + league from verified source
        leg.match = `${fx.home} vs ${fx.away}`;
        leg.matchTime = leg.matchTime || fx.time || "";
        leg.league = fx.league;
        return true;
      });
      if (dropped.length > 0) {
        parsed.advice = (parsed.advice ? parsed.advice + " " : "") +
          `Removed ${dropped.length} unverified leg(s): ${dropped.slice(0, 3).join("; ")}${dropped.length > 3 ? "…" : ""}.`;
      }
      // Recompute combined odds
      if (parsed.slip.length > 0) {
        parsed.combinedOdds = Number(
          parsed.slip.reduce((acc: number, l: any) => acc * (Number(l.odds) || 1), 1).toFixed(2)
        );
      }
      // Add stake/payout context if user requested
      if (stakeAmount && parsed.combinedOdds) {
        const stake = Number(stakeAmount);
        const payout = Number((stake * parsed.combinedOdds).toFixed(2));
        parsed.stake = stake;
        parsed.expectedPayout = payout;
        parsed.expectedProfit = Number((payout - stake).toFixed(2));
        if (desiredWinAmount) parsed.desiredWin = Number(desiredWinAmount);
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
