import { useMemo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Fixture } from "@/hooks/useMatches";
import { useMatches } from "@/hooks/useMatches";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { getTeamMatchView, aggregateStats, filterRecentViews, type TeamMatchView, type Match } from "@/lib/matchStats";
import { formatKickoffTime } from "@/lib/timezone";
import { predictMatch, computeLeagueAvgGoals, type TeamInput } from "@/lib/dixonColes";
import { toLocalKickoff } from "@/lib/matchTime";
import { PredictionMetrics, type PredictionView } from "@/components/PredictionMetrics";
import { useTeamPlayers } from "@/hooks/useTeamPlayers";

type Props = {
  fixture: Fixture;
  onClose: () => void;
};

function teamViews(allMatches: Match[], team: string): TeamMatchView[] {
  return filterRecentViews(
    allMatches
      .map((m) => getTeamMatchView(m, team))
      .filter((v): v is TeamMatchView => v !== null)
  );
}

const FixturePredictSheetInner = ({ fixture, onClose }: Props) => {
  const { data: allMatches = [] } = useMatches();
  const [metricView, setMetricView] = useState<PredictionView>("quick");
  const { data: squadHome = [] } = useTeamPlayers(fixture.home_team);
  const { data: squadAway = [] } = useTeamPlayers(fixture.away_team);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const { pred, hasData, homeForm, awayForm } = useMemo(() => {
    const homeViews = teamViews(allMatches, fixture.home_team).slice(-10);
    const awayViews = teamViews(allMatches, fixture.away_team).slice(-10);

    if (homeViews.length < 3 || awayViews.length < 3) {
      return { pred: null, hasData: false, homeForm: "", awayForm: "" };
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

    const formStr = (vs: TeamMatchView[]) => vs.slice(-5).map((v) => v.result).join("");

    return { pred: p, hasData: true, homeForm: formStr(homeViews), awayForm: formStr(awayViews) };
  }, [allMatches, fixture]);

  const local = toLocalKickoff(fixture.match_date, fixture.match_time);
  const dateStr = new Date(local.date + "T00:00:00").toLocaleDateString("en-GB", {
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
            <div className="px-4 py-3">
              <PredictionMetrics view={metricView} onViewChange={setMetricView} kickoffLabel={`${dateStr}${fixture.match_time ? ` · ${fixture.match_time}` : ""}`} inputs={{
                prediction: pred, home: fixture.home_team, away: fixture.away_team,
                homeViews: teamViews(allMatches, fixture.home_team).slice(-10),
                awayViews: teamViews(allMatches, fixture.away_team).slice(-10),
                statsHome: aggregateStats(teamViews(allMatches, fixture.home_team).slice(-10)),
                statsAway: aggregateStats(teamViews(allMatches, fixture.away_team).slice(-10)),
                squadHome, squadAway,
              }} />
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
