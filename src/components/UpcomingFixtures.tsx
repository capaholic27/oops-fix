import { useMemo, useState } from "react";
import { useFixtures, useMatches, type Fixture } from "@/hooks/useMatches";
import { getTeamMatchView, aggregateStats, filterRecentViews, type TeamMatchView } from "@/lib/matchStats";
import { getTeamRecentViews } from "@/lib/recentForm";
import { localToday } from "@/lib/datetime";
import { predictMatch, computeLeagueAvgGoals, type TeamInput } from "@/lib/dixonColes";
import { aggregateStats, type TeamMatchView } from "@/lib/matchStats";
import { TeamLogo } from "@/components/TeamLogo";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import type { Match } from "@/lib/matchStats";

type Props = {
  teamName: string;
  allMatches: Match[];
  onSelectFixture?: (home: string, away: string) => void;
};

export const UpcomingFixtures = ({ teamName, allMatches, onSelectFixture }: Props) => {
  const { data: fixtures = [] } = useFixtures(teamName);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const today = localToday();
  const allUpcoming = useMemo(
    () => fixtures.filter((f) => f.match_date >= today).slice(0, 15),
    [fixtures, today]
  );

  const upcoming = showAll ? allUpcoming : allUpcoming.slice(0, 3);

  const leagueAvg = useMemo(() => computeLeagueAvgGoals(allMatches), [allMatches]);

  const getQuickPrediction = (fixture: Fixture) => {
    const homeViews = getTeamRecentViews(fixture.home_team, allMatches).slice(-10);
    const awayViews = getTeamRecentViews(fixture.away_team, allMatches).slice(-10);

    if (homeViews.length < 3 || awayViews.length < 3) return null;

    const homeStats = aggregateStats(homeViews);
    const awayStats = aggregateStats(awayViews);

    const getRecent = (views: TeamMatchView[]) => {
      const last5 = views.slice(-5);
      return {
        scored: last5.reduce((s, v) => s + v.goalsFor, 0),
        conceded: last5.reduce((s, v) => s + v.goalsAgainst, 0),
        n: last5.length,
      };
    };

    const homeInput: TeamInput = {
      goalsScored: homeStats.goalsFor,
      goalsConceded: homeStats.goalsAgainst,
      matchesPlayed: homeStats.matchesPlayed,
      ...getRecent(homeViews),
      recentGoalsScored: getRecent(homeViews).scored,
      recentGoalsConceded: getRecent(homeViews).conceded,
      recentMatches: getRecent(homeViews).n,
    };
    const awayInput: TeamInput = {
      goalsScored: awayStats.goalsFor,
      goalsConceded: awayStats.goalsAgainst,
      matchesPlayed: awayStats.matchesPlayed,
      recentGoalsScored: getRecent(awayViews).scored,
      recentGoalsConceded: getRecent(awayViews).conceded,
      recentMatches: getRecent(awayViews).n,
    };

    return predictMatch(homeInput, awayInput, leagueAvg);
  };

  if (allUpcoming.length === 0) return null;

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "480ms" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" />
          <span className="stat-label">Upcoming Fixtures</span>
        </div>
        {allUpcoming.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
              showAll ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Less" : `All (${allUpcoming.length})`}
          </button>
        )}
      </div>
      <div className="space-y-1">
        {upcoming.map((f) => {
          const isHome = f.home_team === teamName;
          const opponent = isHome ? f.away_team : f.home_team;
          const isExpanded = expanded === f.id;
          const pred = isExpanded ? getQuickPrediction(f) : null;
          const dateStr = new Date(f.match_date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "short", day: "numeric", month: "short",
          });

          return (
            <div key={f.id} className="border border-border rounded-sm overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : f.id)}
                className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <TeamLogo teamName={opponent} size="xs" />
                  <div className="text-left">
                    <p className="text-[11px] font-bold">
                      <span className="text-muted-foreground text-[9px] mr-1">{isHome ? "vs" : "@"}</span>
                      {opponent}
                    </p>
                    <p className="text-[8px] text-muted-foreground">{dateStr}{f.match_time ? ` · ${f.match_time}` : ""} · {f.league_name}</p>
                  </div>
                </div>
                <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
              </button>

              {isExpanded && pred && (
                <div className="border-t border-border bg-muted/20 px-2.5 py-2 space-y-2">
                  <div className="flex items-center gap-1">
                    <div className="flex-1 text-center">
                      <p className="font-mono text-xs font-bold text-stat-positive">{pred.homeWin.toFixed(0)}%</p>
                      <p className="text-[7px] uppercase text-muted-foreground">{f.home_team.slice(0, 8)}</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="font-mono text-xs font-bold text-stat-warn">{pred.draw.toFixed(0)}%</p>
                      <p className="text-[7px] uppercase text-muted-foreground">Draw</p>
                    </div>
                    <div className="flex-1 text-center">
                      <p className="font-mono text-xs font-bold text-stat-negative">{pred.awayWin.toFixed(0)}%</p>
                      <p className="text-[7px] uppercase text-muted-foreground">{f.away_team.slice(0, 8)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-3 text-[10px]">
                    <span className="font-mono font-bold">{pred.lambdaHome.toFixed(2)} xG</span>
                    <span className="text-muted-foreground">–</span>
                    <span className="font-mono font-bold">{pred.lambdaAway.toFixed(2)} xG</span>
                  </div>
                  <div className="text-center">
                    <span className="text-[8px] uppercase tracking-wider text-muted-foreground">Most Likely: </span>
                    <span className="font-mono text-[11px] font-bold">
                      {pred.topScorelines[0].home}–{pred.topScorelines[0].away}
                    </span>
                    <span className="text-[9px] text-primary ml-1">({(pred.topScorelines[0].probability * 100).toFixed(0)}%)</span>
                  </div>
                  {onSelectFixture && (
                    <button
                      onClick={() => onSelectFixture(f.home_team, f.away_team)}
                      className="w-full py-1 text-[8px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 border border-primary/30 rounded-sm transition-colors"
                    >
                      Full Prediction →
                    </button>
                  )}
                </div>
              )}
              {isExpanded && !pred && (
                <div className="border-t border-border bg-muted/20 px-2.5 py-2">
                  <p className="text-[9px] text-muted-foreground text-center">Not enough data for prediction</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
