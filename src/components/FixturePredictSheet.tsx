import { useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Fixture } from "@/hooks/useMatches";
import { useMatches } from "@/hooks/useMatches";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { BookmakerOddsRow } from "@/components/BookmakerOddsRow";
import { LiveOddsRow } from "@/components/LiveOddsRow";
import { aggregateStats, type TeamMatchView, type Match } from "@/lib/matchStats";
import { getTeamRecentViews } from "@/lib/recentForm";
import { predictMatch, computeLeagueAvgGoals, type TeamInput } from "@/lib/dixonColes";
import { cn } from "@/lib/utils";

type Props = {
  fixture: Fixture;
  onClose: () => void;
};

function teamViews(allMatches: Match[], team: string): TeamMatchView[] {
  return getTeamRecentViews(team, allMatches);
}

function avg(views: TeamMatchView[], pick: (v: TeamMatchView) => number, n = 8): number {
  const last = views.slice(-n);
  if (last.length === 0) return 0;
  return last.reduce((s, v) => s + pick(v), 0) / last.length;
}

type Suggestion = { market: string; pick: string; confidence: number; reason: string };

/**
 * Map a model suggestion onto a The Odds API market+outcome so we can show
 * real bookmaker prices for it. Returns null for markets The Odds API doesn't
 * cover (corners, cards, double chance) — those stay as model signals.
 */
function suggestionLiveParams(
  fixture: Fixture,
  s: Suggestion,
): { market: "h2h" | "totals" | "btts"; outcome: string; point?: number; side: "home" | "draw" | "away" | "generic" } | null {
  if (s.market === "Match Winner") {
    const isHome = s.pick === fixture.home_team;
    return { market: "h2h", outcome: s.pick, side: isHome ? "home" : "away" };
  }
  if (s.market === "Total Goals") {
    const m = s.pick.match(/^(Over|Under)\s*([\d.]+)$/);
    if (m) return { market: "totals", outcome: m[1], point: Number(m[2]), side: "generic" };
  }
  if (s.market === "Both Teams To Score") {
    return { market: "btts", outcome: s.pick, side: "generic" };
  }
  return null;
}

const FixturePredictSheetInner = ({ fixture, onClose }: Props) => {
  const { data: allMatches = [] } = useMatches();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const { pred, suggestions, hasData, homeForm, awayForm } = useMemo(() => {
    const homeViews = teamViews(allMatches, fixture.home_team);
    const awayViews = teamViews(allMatches, fixture.away_team);

    if (homeViews.length < 3 || awayViews.length < 3) {
      return { pred: null, suggestions: [] as Suggestion[], hasData: false, homeForm: "", awayForm: "" };
    }

    const leagueAvg = computeLeagueAvgGoals(allMatches);
    const hStats = aggregateStats(homeViews);
    const aStats = aggregateStats(awayViews);
    const recent = (vs: TeamMatchView[]) => {
      const last5 = vs.slice(-5);
      return {
        scored: last5.reduce((s, v) => s + v.goalsFor, 0),
        conceded: last5.reduce((s, v) => s + v.goalsAgainst, 0),
        n: last5.length,
      };
    };
    const hi: TeamInput = {
      goalsScored: hStats.goalsFor,
      goalsConceded: hStats.goalsAgainst,
      matchesPlayed: hStats.matchesPlayed,
      recentGoalsScored: recent(homeViews).scored,
      recentGoalsConceded: recent(homeViews).conceded,
      recentMatches: recent(homeViews).n,
    };
    const ai: TeamInput = {
      goalsScored: aStats.goalsFor,
      goalsConceded: aStats.goalsAgainst,
      matchesPlayed: aStats.matchesPlayed,
      recentGoalsScored: recent(awayViews).scored,
      recentGoalsConceded: recent(awayViews).conceded,
      recentMatches: recent(awayViews).n,
    };
    const p = predictMatch(hi, ai, leagueAvg);

    // Build market suggestions
    const totalGoals = p.lambdaHome + p.lambdaAway;
    const homeCorners = avg(homeViews, (v) => v.cornersFor);
    const awayCorners = avg(awayViews, (v) => v.cornersFor);
    const totalCorners = homeCorners + awayCorners;
    const homeCardsAvg = avg(homeViews, (v) => v.yellowCards);
    const awayCardsAvg = avg(awayViews, (v) => v.yellowCards);
    const totalCards = homeCardsAvg + awayCardsAvg;

    const sugg: Suggestion[] = [];
    // 1X2
    const top = Math.max(p.homeWin, p.draw, p.awayWin);
    if (top === p.homeWin && p.homeWin >= 50) {
      sugg.push({ market: "Match Winner", pick: `${fixture.home_team}`, confidence: Math.round(p.homeWin), reason: `xG ${p.lambdaHome.toFixed(2)} vs ${p.lambdaAway.toFixed(2)} at home` });
    } else if (top === p.awayWin && p.awayWin >= 45) {
      sugg.push({ market: "Match Winner", pick: `${fixture.away_team}`, confidence: Math.round(p.awayWin), reason: `Stronger away xG profile` });
    } else {
      sugg.push({ market: "Double Chance", pick: p.homeWin > p.awayWin ? `${fixture.home_team} or Draw` : `${fixture.away_team} or Draw`, confidence: Math.round(p.homeWin > p.awayWin ? p.homeWin + p.draw : p.awayWin + p.draw), reason: `Tight matchup, hedge the draw` });
    }
    // O/U goals
    if (totalGoals >= 2.85) {
      sugg.push({ market: "Total Goals", pick: "Over 2.5", confidence: Math.min(85, Math.round(50 + (totalGoals - 2.5) * 25)), reason: `Combined xG ${totalGoals.toFixed(2)}` });
    } else if (totalGoals <= 2.15) {
      sugg.push({ market: "Total Goals", pick: "Under 2.5", confidence: Math.min(82, Math.round(50 + (2.5 - totalGoals) * 25)), reason: `Combined xG ${totalGoals.toFixed(2)}` });
    }
    // BTTS
    if (p.lambdaHome >= 1.1 && p.lambdaAway >= 1.0) {
      sugg.push({ market: "Both Teams To Score", pick: "Yes", confidence: Math.round(55 + Math.min(p.lambdaHome, p.lambdaAway) * 12), reason: `Both attacks averaging ≥1.0 xG` });
    } else if (p.lambdaHome < 0.85 || p.lambdaAway < 0.75) {
      sugg.push({ market: "Both Teams To Score", pick: "No", confidence: 60, reason: `One side projected under 1 xG` });
    }
    // Corners
    if (totalCorners >= 10.5) {
      sugg.push({ market: "Total Corners", pick: "Over 9.5", confidence: Math.min(78, Math.round(50 + (totalCorners - 9.5) * 6)), reason: `Avg combined ${totalCorners.toFixed(1)} corners` });
    } else if (totalCorners <= 8.5) {
      sugg.push({ market: "Total Corners", pick: "Under 9.5", confidence: 62, reason: `Avg combined ${totalCorners.toFixed(1)} corners` });
    }
    // Cards
    if (totalCards >= 4) {
      sugg.push({ market: "Total Cards", pick: "Over 3.5", confidence: Math.min(72, Math.round(50 + (totalCards - 3.5) * 8)), reason: `Combined avg ${totalCards.toFixed(1)} yellows` });
    }

    const formStr = (vs: TeamMatchView[]) => vs.slice(-5).map((v) => v.result).join("");

    return { pred: p, suggestions: sugg, hasData: true, homeForm: formStr(homeViews), awayForm: formStr(awayViews) };
  }, [allMatches, fixture]);

  const dateStr = new Date(fixture.match_date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center sm:justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto bg-card border-t sm:border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <LeagueLogo leagueName={fixture.league_name} size="sm" />
            <div>
              <p className="text-[11px] font-semibold">{fixture.league_name}</p>
              <p className="text-[9px] text-muted-foreground">{dateStr}{fixture.match_time ? ` · ${fixture.match_time}` : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Teams */}
        <div className="px-4 pt-4 pb-2 grid grid-cols-3 items-center gap-2">
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo teamName={fixture.home_team} size="md" />
            <p className="text-[11px] font-semibold text-center leading-tight">{fixture.home_team}</p>
            <p className="font-mono text-[9px] text-muted-foreground tracking-wider">{homeForm || "—"}</p>
          </div>
          <div className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">vs</p>
            {pred && (
              <p className="font-mono text-xs font-bold mt-1">
                {pred.lambdaHome.toFixed(2)} – {pred.lambdaAway.toFixed(2)}
              </p>
            )}
            <p className="text-[8px] text-muted-foreground">xG</p>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <TeamLogo teamName={fixture.away_team} size="md" />
            <p className="text-[11px] font-semibold text-center leading-tight">{fixture.away_team}</p>
            <p className="font-mono text-[9px] text-muted-foreground tracking-wider">{awayForm || "—"}</p>
          </div>
        </div>

        {!hasData && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            Not enough historical data for these teams to build a prediction.
          </div>
        )}

        {hasData && pred && (
          <>
            {/* W/D/L */}
            <div className="px-4 py-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Win Probability</p>
              <div className="flex h-7 rounded-md overflow-hidden border border-border">
                <div className="bg-stat-positive flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${pred.homeWin}%` }}>
                  {pred.homeWin >= 12 && `${pred.homeWin.toFixed(0)}%`}
                </div>
                <div className="bg-stat-warn flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${pred.draw}%` }}>
                  {pred.draw >= 12 && `${pred.draw.toFixed(0)}%`}
                </div>
                <div className="bg-stat-negative flex items-center justify-center text-[10px] font-bold text-background" style={{ width: `${pred.awayWin}%` }}>
                  {pred.awayWin >= 12 && `${pred.awayWin.toFixed(0)}%`}
                </div>
              </div>
              <div className="grid grid-cols-3 mt-1 text-[9px] text-muted-foreground">
                <span>Home</span>
                <span className="text-center">Draw</span>
                <span className="text-right">Away</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 mt-2">
                <LiveOddsRow home={fixture.home_team} away={fixture.away_team} market="h2h" outcome={fixture.home_team}
                  fallbackSeed={`${fixture.id}-1x2`} fallbackSide="home" fallbackFairProb={pred.homeWin / 100} />
                <div className="justify-self-center">
                  <LiveOddsRow home={fixture.home_team} away={fixture.away_team} market="h2h" outcome="Draw"
                    fallbackSeed={`${fixture.id}-1x2`} fallbackSide="draw" fallbackFairProb={pred.draw / 100} />
                </div>
                <div className="justify-self-end">
                  <LiveOddsRow home={fixture.home_team} away={fixture.away_team} market="h2h" outcome={fixture.away_team}
                    fallbackSeed={`${fixture.id}-1x2`} fallbackSide="away" fallbackFairProb={pred.awayWin / 100} />
                </div>
              </div>
            </div>

            {/* Top scorelines */}
            <div className="px-4 pb-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Most Likely Scores</p>
              <div className="grid grid-cols-3 gap-1.5">
                {pred.topScorelines.slice(0, 3).map((s, i) => (
                  <div key={i} className="border border-border rounded-md py-2 text-center bg-muted/20">
                    <p className="font-mono text-sm font-bold">{s.home}–{s.away}</p>
                    <p className="text-[9px] text-primary">{(s.probability * 100).toFixed(0)}%</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggested markets */}
            <div className="px-4 pb-5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Suggested Bet Markets</p>
              <div className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <div key={i} className="border border-border rounded-md p-2.5 bg-muted/10">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.market}</span>
                      <span className={cn(
                        "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded",
                        s.confidence >= 70 ? "bg-stat-positive/15 text-stat-positive" :
                        s.confidence >= 55 ? "bg-stat-warn/15 text-stat-warn" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {s.confidence}% conf
                      </span>
                    </div>
                    <p className="text-xs font-bold">{s.pick}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</p>
                    <div className="mt-1.5">
                      {(() => {
                        const lp = suggestionLiveParams(fixture, s);
                        if (lp) {
                          return (
                            <LiveOddsRow
                              home={fixture.home_team}
                              away={fixture.away_team}
                              market={lp.market}
                              outcome={lp.outcome}
                              point={lp.point}
                              fallbackSeed={`${fixture.id}-${s.market}-${s.pick}`}
                              fallbackSide={lp.side}
                              fallbackFairProb={s.confidence / 100}
                            />
                          );
                        }
                        return (
                          <BookmakerOddsRow
                            seed={`${fixture.id}-${s.market}-${s.pick}`}
                            fairProb={s.confidence / 100}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ))}
                {suggestions.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No high-confidence picks for this matchup.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const FixturePredictSheet = (props: Props) => {
  if (typeof document === "undefined") return null;
  return createPortal(<FixturePredictSheetInner {...props} />, document.body);
};
