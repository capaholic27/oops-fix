import { useState, useMemo } from "react";
import { predictNextMatchStyles } from "@/lib/tacticalPredictor";
import type { AggregatedStats, TeamMatchView } from "@/lib/matchStats";
import { TeamLogo } from "@/components/TeamLogo";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Fixture } from "@/hooks/useMatches";

type Props = {
  stats: AggregatedStats;
  teamName: string;
  views: TeamMatchView[];
  opponentStats?: AggregatedStats | null;
  opponentName?: string;
  nextFixture?: { date: string; isHome: boolean } | null;
  allFixtures?: Fixture[];
  allMatches?: any[];
  onFixtureChange?: (fixture: Fixture) => void;
};

export const PredictedTacticalProfile = ({
  stats, teamName, views, opponentStats, opponentName, nextFixture,
  allFixtures = [], allMatches = [], onFixtureChange,
}: Props) => {
  const [showPicker, setShowPicker] = useState(false);

  const predictions = predictNextMatchStyles(stats, views, opponentStats);
  const topStyle = predictions[0];

  // Upcoming fixtures for picker
  const today = new Date().toISOString().slice(0, 10);
  const upcomingFixtures = useMemo(
    () => allFixtures
      .filter((f) => f.match_date >= today && (f.home_team === teamName || f.away_team === teamName))
      .slice(0, 8),
    [allFixtures, today, teamName]
  );

  const fixtureDate = nextFixture
    ? new Date(nextFixture.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "550ms" }}>
      <div className="flex items-center justify-between mb-1">
        <span className="stat-label">Predicted Game Style</span>
        <button
          onClick={() => upcomingFixtures.length > 0 && setShowPicker(!showPicker)}
          className={cn(
            "flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider transition-colors",
            upcomingFixtures.length > 0
              ? "text-primary hover:text-primary/80 cursor-pointer"
              : "text-muted-foreground cursor-default"
          )}
        >
          Next match
          {upcomingFixtures.length > 0 && (
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", showPicker && "rotate-180")} />
          )}
        </button>
      </div>

      {/* Fixture picker dropdown */}
      {showPicker && upcomingFixtures.length > 0 && (
        <div className="mb-3 border border-border rounded-sm bg-muted/30 overflow-hidden">
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold px-2 pt-1.5 pb-1">
            Select fixture to predict
          </p>
          {upcomingFixtures.map((f) => {
            const isHome = f.home_team === teamName;
            const opponent = isHome ? f.away_team : f.home_team;
            const dateStr = new Date(f.match_date + "T00:00:00").toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            });
            const isSelected = nextFixture?.date === f.match_date && opponentName === opponent;
            return (
              <button
                key={f.id}
                onClick={() => {
                  onFixtureChange?.(f);
                  setShowPicker(false);
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-primary/10 transition-colors border-t border-border first:border-t-0",
                  isSelected && "bg-primary/10"
                )}
              >
                <TeamLogo teamName={opponent} size="xs" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold truncate">
                    <span className="text-muted-foreground text-[8px] mr-0.5">{isHome ? "vs" : "@"}</span>
                    {opponent}
                  </p>
                  <p className="text-[8px] text-muted-foreground">{dateStr} · {f.league_name}</p>
                </div>
                {isSelected && <span className="text-[8px] text-primary font-bold">●</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Next fixture info */}
      {nextFixture && opponentName ? (
        <div className="flex items-center gap-2 mb-3 px-2 py-1.5 border border-border bg-muted/30 rounded-sm">
          <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{teamName}</span>
            {nextFixture.isHome ? " vs " : " @ "}
            <span className="font-semibold text-foreground">{opponentName}</span>
            <span className="text-[10px] ml-1.5 font-mono">({fixtureDate})</span>
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">
          Prediction based on {teamName}'s recent patterns & form
        </p>
      )}

      <div className="space-y-2.5">
        {predictions.map((p, i) => (
          <div key={p.style} className="group">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                  {i + 1}. {p.style}
                </span>
                {i === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                    Most likely
                  </span>
                )}
              </div>
              <span className={`font-mono text-sm font-bold ${i === 0 ? "text-foreground" : "text-muted-foreground"}`}>
                {p.probability}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ease-out ${p.color}`}
                style={{ width: `${p.probability}%`, opacity: i === 0 ? 1 : 0.6 }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug opacity-0 max-h-0 group-hover:opacity-100 group-hover:max-h-8 transition-all duration-200 overflow-hidden">
              {p.description}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {topStyle.probability > 30
            ? `${teamName} will most likely play a ${topStyle.style.toLowerCase()} style. ${topStyle.description}.`
            : `${teamName} shows a balanced approach — no dominant style predicted.`}
        </p>
      </div>
    </div>
  );
};
