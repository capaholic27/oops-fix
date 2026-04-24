import { supabase } from "@/integrations/supabase/client";
import { normalizeTeamName, getTeamAliases } from "@/lib/teamNormalize";

export type SettleableLeg = {
  match: string;       // "Team A vs Team B"
  market: string;      // "Over 2.5 Goals", "BTTS Yes", "Home Win", "Over 9.5 Corners", etc.
  odds: number;
  matchDate?: string;  // optional ISO date for the fixture
};

export type LegSettlement = {
  result: "win" | "loss" | "push" | "unknown";
  reason: string;
  actual?: string;
};

type MatchRow = {
  home_team: string;
  away_team: string;
  match_date: string;
  ft_home_goals: number;
  ft_away_goals: number;
  ft_result: string;
  ht_home_goals: number;
  ht_away_goals: number;
  home_corners: number;
  away_corners: number;
  home_yellows: number;
  away_yellows: number;
  home_reds: number;
  away_reds: number;
  home_fouls: number;
  away_fouls: number;
  home_shots: number;
  away_shots: number;
  home_shots_target: number;
  away_shots_target: number;
};

function parseTeams(matchStr: string): { home: string; away: string } | null {
  const sep = matchStr.split(/\s+vs\.?\s+|\s+v\s+|\s+-\s+/i);
  if (sep.length !== 2) return null;
  return { home: sep[0].trim(), away: sep[1].trim() };
}

async function findMatch(home: string, away: string, dateHint?: string): Promise<MatchRow | null> {
  const homeAliases = getTeamAliases(home);
  const awayAliases = getTeamAliases(away);

  const homeFilter = homeAliases.map(a => `home_team.eq.${a}`).join(",");
  const awayFilter = awayAliases.map(a => `away_team.eq.${a}`).join(",");

  let q = supabase.from("matches").select("*").or(homeFilter).or(awayFilter);

  if (dateHint) {
    // Within 2 days of hint (in case of timezone slip)
    const d = new Date(dateHint);
    const start = new Date(d.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const end = new Date(d.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    q = q.gte("match_date", start).lte("match_date", end);
  }

  const { data } = await q.limit(20);
  if (!data) return null;

  // Find an exact home/away alias match
  const normH = normalizeTeamName(home);
  const normA = normalizeTeamName(away);
  for (const row of data as unknown as MatchRow[]) {
    if (
      normalizeTeamName(row.home_team) === normH &&
      normalizeTeamName(row.away_team) === normA
    ) {
      return row;
    }
  }
  return null;
}

/* ─── Market evaluators ─── */
function evalOverUnder(value: number, threshold: number, isOver: boolean): "win" | "loss" | "push" {
  if (value === threshold) return "push";
  return (isOver ? value > threshold : value < threshold) ? "win" : "loss";
}

function evalLeg(leg: SettleableLeg, m: MatchRow): LegSettlement {
  const market = leg.market.toLowerCase().trim();
  const totalGoals = m.ft_home_goals + m.ft_away_goals;
  const totalCorners = m.home_corners + m.away_corners;
  const totalCards = m.home_yellows + m.away_yellows + m.home_reds + m.away_reds;
  const totalFouls = m.home_fouls + m.away_fouls;
  const totalShots = m.home_shots + m.away_shots;
  const totalSOT = m.home_shots_target + m.away_shots_target;
  const homeWin = m.ft_result === "H";
  const awayWin = m.ft_result === "A";
  const draw = m.ft_result === "D";

  // 1X2
  if (/(home win|home$|^1$|home team)/i.test(market) && !market.includes("over") && !market.includes("under")) {
    return { result: homeWin ? "win" : "loss", reason: "1X2 home", actual: `${m.ft_home_goals}-${m.ft_away_goals}` };
  }
  if (/(away win|away$|^2$|away team)/i.test(market) && !market.includes("over") && !market.includes("under")) {
    return { result: awayWin ? "win" : "loss", reason: "1X2 away", actual: `${m.ft_home_goals}-${m.ft_away_goals}` };
  }
  if (/(^draw|^x$|^the draw)/i.test(market)) {
    return { result: draw ? "win" : "loss", reason: "1X2 draw", actual: `${m.ft_home_goals}-${m.ft_away_goals}` };
  }

  // Double chance
  if (market.includes("1x") || market.includes("home/draw") || market.includes("home or draw")) {
    return { result: homeWin || draw ? "win" : "loss", reason: "DC 1X" };
  }
  if (market.includes("x2") || market.includes("draw/away") || market.includes("draw or away")) {
    return { result: awayWin || draw ? "win" : "loss", reason: "DC X2" };
  }
  if (market.includes("12") || market.includes("home/away") || market.includes("home or away")) {
    return { result: homeWin || awayWin ? "win" : "loss", reason: "DC 12" };
  }

  // BTTS
  if (market.includes("btts") || market.includes("both teams to score") || market.includes("both teams score")) {
    const yes = m.ft_home_goals > 0 && m.ft_away_goals > 0;
    const wantYes = !market.includes("no");
    return { result: yes === wantYes ? "win" : "loss", reason: "BTTS", actual: yes ? "Yes" : "No" };
  }

  // Over/Under (parse threshold and category)
  const ouMatch = market.match(/(over|under)\s+(\d+\.?\d*)/);
  if (ouMatch) {
    const isOver = ouMatch[1] === "over";
    const threshold = parseFloat(ouMatch[2]);
    let value = totalGoals;
    let cat = "goals";
    if (market.includes("corner")) { value = totalCorners; cat = "corners"; }
    else if (market.includes("card")) { value = totalCards; cat = "cards"; }
    else if (market.includes("foul")) { value = totalFouls; cat = "fouls"; }
    else if (market.includes("shots on target") || market.includes("sot")) { value = totalSOT; cat = "SOT"; }
    else if (market.includes("shot")) { value = totalShots; cat = "shots"; }
    return {
      result: evalOverUnder(value, threshold, isOver),
      reason: `${isOver ? "Over" : "Under"} ${threshold} ${cat}`,
      actual: `${value} ${cat}`,
    };
  }

  // Clean sheet
  if (market.includes("clean sheet")) {
    const homeCS = m.ft_away_goals === 0;
    const awayCS = m.ft_home_goals === 0;
    if (market.includes("home")) return { result: homeCS ? "win" : "loss", reason: "CS home" };
    if (market.includes("away")) return { result: awayCS ? "win" : "loss", reason: "CS away" };
  }

  // Correct score: "2-1", "1:0"
  const csMatch = market.match(/(\d+)[\s\-:](\d+)/);
  if (csMatch && (market.includes("correct score") || /^\d+[\s\-:]\d+$/.test(leg.market.trim()))) {
    const h = parseInt(csMatch[1]);
    const a = parseInt(csMatch[2]);
    return {
      result: m.ft_home_goals === h && m.ft_away_goals === a ? "win" : "loss",
      reason: "Correct score",
      actual: `${m.ft_home_goals}-${m.ft_away_goals}`,
    };
  }

  return { result: "unknown", reason: `Unparsed market: ${leg.market}` };
}

export type SettlementResult = {
  legResults: LegSettlement[];
  finalResult: "win" | "loss" | "pending" | "unknown";
};

export async function settleSlip(legs: SettleableLeg[], placedDate?: string): Promise<SettlementResult> {
  const legResults: LegSettlement[] = [];
  let anyPending = false;
  let anyUnknown = false;
  let allWin = true;

  for (const leg of legs) {
    const teams = parseTeams(leg.match);
    if (!teams) {
      legResults.push({ result: "unknown", reason: "Could not parse teams" });
      anyUnknown = true;
      allWin = false;
      continue;
    }
    const row = await findMatch(teams.home, teams.away, leg.matchDate || placedDate);
    if (!row) {
      // Match not played yet (or not in DB)
      legResults.push({ result: "unknown", reason: "Match not yet in results" });
      anyPending = true;
      allWin = false;
      continue;
    }
    // Has the match been played? If stats are all 0 and goals 0-0 it might be a future fixture; require a result code
    if (!row.ft_result) {
      legResults.push({ result: "unknown", reason: "Match not finished" });
      anyPending = true;
      allWin = false;
      continue;
    }
    const settled = evalLeg(leg, row);
    legResults.push(settled);
    if (settled.result === "loss") allWin = false;
    if (settled.result === "unknown") { anyUnknown = true; allWin = false; }
    if (settled.result === "push") allWin = allWin; // push voids the leg, treat as win for accumulator purposes? we'll treat as neutral
  }

  let finalResult: SettlementResult["finalResult"];
  if (anyPending) finalResult = "pending";
  else if (legResults.some(l => l.result === "loss")) finalResult = "loss";
  else if (anyUnknown) finalResult = "unknown";
  else if (allWin) finalResult = "win";
  else finalResult = "unknown";

  return { legResults, finalResult };
}
