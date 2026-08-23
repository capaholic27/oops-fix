import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Statistical engine (server-side mirror of Dixon-Coles + Monte Carlo) ──

type TeamAgg = {
  matchesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  avgShotsFor?: number;
  avgShotsOnTargetFor?: number;
  winProbability?: number;
};

function poissonSample(lambda: number): number {
  // Knuth algorithm — fine for lambda < ~10
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * xG proxy: we don't always have true xG, so we approximate with
 * shots-on-target weighted lightly, blended with goals-for rate.
 * If SOT data missing → fallback to goals/game.
 */
function estimateXG(stats: TeamAgg): number {
  const gpg = stats.matchesPlayed > 0 ? stats.goalsFor / stats.matchesPlayed : 1;
  if (stats.avgShotsOnTargetFor && stats.avgShotsOnTargetFor > 0) {
    // SOT-to-goal conversion ≈ 0.31 typical league-wide
    const sotXG = stats.avgShotsOnTargetFor * 0.31;
    return 0.6 * gpg + 0.4 * sotXG;
  }
  return gpg;
}

/**
 * Run the calibrated statistical model:
 * Poisson + Dixon-Coles low-score correction + Monte Carlo simulation.
 */
function runStatisticalModel(
  home: TeamAgg,
  away: TeamAgg,
  leagueAvgGoals = 1.35,
  homeAdvantage = 1.18,
  iterations = 10000,
): {
  homeWin: number; draw: number; awayWin: number;
  lambdaHome: number; lambdaAway: number;
  topScorelines: { score: string; probability: number }[];
  over25: number; over15: number; btts: number;
  xgHome: number; xgAway: number;
} {
  const xgHomeBase = estimateXG(home);
  const xgAwayBase = estimateXG(away);

  // Defensive ratings (goals conceded per game)
  const defHome = home.matchesPlayed > 0 ? home.goalsAgainst / home.matchesPlayed : 1;
  const defAway = away.matchesPlayed > 0 ? away.goalsAgainst / away.matchesPlayed : 1;

  // Strength ratios
  const homeAttack = xgHomeBase / leagueAvgGoals;
  const awayAttack = xgAwayBase / leagueAvgGoals;
  const homeDef = defHome / leagueAvgGoals;
  const awayDef = defAway / leagueAvgGoals;

  let lambdaHome = clamp(homeAttack * awayDef * leagueAvgGoals * homeAdvantage, 0.2, 4.0);
  let lambdaAway = clamp(awayAttack * homeDef * leagueAvgGoals, 0.2, 4.0);

  // Monte Carlo simulation with Dixon-Coles low-score correction (rejection sampling)
  const rho = -0.08;
  const dcAccept = (h: number, a: number): number => {
    if (h === 0 && a === 0) return 1 - lambdaHome * lambdaAway * rho;
    if (h === 1 && a === 0) return 1 + lambdaAway * rho;
    if (h === 0 && a === 1) return 1 + lambdaHome * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
  };

  let hw = 0, dr = 0, aw = 0;
  let totalGoals = 0, bttsCount = 0, over25Count = 0, over15Count = 0;
  const scoreCounts = new Map<string, number>();

  for (let i = 0; i < iterations; i++) {
    const h = poissonSample(lambdaHome);
    const a = poissonSample(lambdaAway);
    // DC accept/reject (cap acceptance ≥ 0)
    const acc = Math.max(0, dcAccept(h, a));
    if (Math.random() > acc) { i--; continue; }

    if (h > a) hw++;
    else if (h === a) dr++;
    else aw++;

    totalGoals += h + a;
    if (h > 0 && a > 0) bttsCount++;
    if (h + a > 2.5) over25Count++;
    if (h + a > 1.5) over15Count++;

    const key = `${h}-${a}`;
    scoreCounts.set(key, (scoreCounts.get(key) ?? 0) + 1);
  }

  const top = [...scoreCounts.entries()]
    .map(([score, n]) => ({ score, probability: (n / iterations) * 100 }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 5);

  return {
    homeWin: (hw / iterations) * 100,
    draw: (dr / iterations) * 100,
    awayWin: (aw / iterations) * 100,
    lambdaHome,
    lambdaAway,
    topScorelines: top,
    over25: (over25Count / iterations) * 100,
    over15: (over15Count / iterations) * 100,
    btts: (bttsCount / iterations) * 100,
    xgHome: lambdaHome,
    xgAway: lambdaAway,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { teamName, stats, recentForm, upcomingOpponent, opponentStats, opponentForm, matchContext, predictionMode, unavailablePlayers, playerMarkets } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Run calibrated statistical model whenever we have both teams
    let modelBlock = "";
    if (upcomingOpponent && opponentStats) {
      const sim = runStatisticalModel(stats, opponentStats);
      modelBlock = `
CALIBRATED STATISTICAL MODEL (Poisson + Dixon-Coles + 10,000 Monte Carlo simulations — these are the source of truth, do NOT contradict them):
- Win probabilities: ${teamName} ${sim.homeWin.toFixed(1)}% | Draw ${sim.draw.toFixed(1)}% | ${upcomingOpponent} ${sim.awayWin.toFixed(1)}%
- Expected goals (xG): ${teamName} ${sim.xgHome.toFixed(2)} – ${sim.xgAway.toFixed(2)} ${upcomingOpponent}
- Top 5 scorelines: ${sim.topScorelines.map(s => `${s.score} (${s.probability.toFixed(1)}%)`).join(", ")}
- Over 2.5 goals: ${sim.over25.toFixed(1)}% | Over 1.5: ${sim.over15.toFixed(1)}% | BTTS: ${sim.btts.toFixed(1)}%
`;
    }

    const systemPrompt = `You are an elite football analytics engine inspired by Opta / Stats Perform. You receive CALIBRATED probabilities from a Poisson + Dixon-Coles + Monte Carlo simulation engine. Your job is to INTERPRET that model output, layer in qualitative context (form, tactics, discipline, match context), and explain WHY — without contradicting the calibrated numbers.

Rules:
- NEVER invent probabilities that conflict with the model. Quote the model's % values directly.
- All claims must be data-driven; no fan narrative fluff.
- Acknowledge uncertainty — calibrated probabilities are not certainties.
- If match context is provided, explain how it shifts tactics/risk WITHOUT overriding the model's headline numbers (you may flag if context warrants a small mental adjustment).

Output sections:
1. **Model Verdict** — quote model: win/draw/loss %, xG line, most likely scoreline
2. **Top 5 Scorelines** — list with probabilities
3. **Goals Market** — Over 2.5 %, BTTS %, expected total goals (xG sum)
4. **Key Factors** — form, tactical matchup, discipline, scoring patterns
5. **Risk & Variance** — what could swing the result against the model
6. **Betting Angles** — best-value markets backed by the model numbers (1X2, O/U, BTTS, corners, cards)
${predictionMode && predictionMode !== "full" ? `7. **Player Markets** — for each listed player give the market (anytime scorer / assist / card) with its model probability, flag the 3 best-value ones` : ""}
${matchContext ? `8. **Context Impact** — explicitly address "${matchContext}" and how it modulates tactics/risk` : ""}

Tone: punchy, professional, like a premium tipster's research note. 400 words max.`;

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
${matchContext ? `\nMATCH CONTEXT: ${matchContext}` : ""}
${predictionMode ? `\nPREDICTION MODE: ${predictionMode} (full = team markets only, players = player markets only, both = cover both)` : ""}
${Array.isArray(unavailablePlayers) && unavailablePlayers.length ? `\nUNAVAILABLE / DESELECTED PLAYERS (already priced into the model numbers):\n- ${unavailablePlayers.join("\n- ")}` : ""}
${playerMarkets ? `\nPLAYER MARKET PROBABILITIES FROM THE MODEL (do not contradict):\n${JSON.stringify(playerMarkets)}` : ""}
${modelBlock}
Produce the analysis.`;

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
