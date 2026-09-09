import { useState } from "react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { FormBadge } from "./FormBadge";
import { TeamLogo } from "./TeamLogo";
import { LeagueLogo } from "./LeagueLogo";
import type { Match } from "@/lib/matchStats";
import { getTeamRecentViews } from "@/lib/recentForm";

type Props = {
  match: Match;
  allMatches: Match[];
  onClose: () => void;
};

function getTeamForm(team: string, allMatches: Match[], beforeDate: string, count = 5) {
  // Use the shared recent-form logic so the match-detail sheet and the Stats
  // page always show the same matches in the same order.
  const views = getTeamRecentViews(team, allMatches, count, beforeDate);
  // Return most-recent FIRST for the detail list display.
  return views.slice().reverse().map((v) => ({ result: v.result, match: v.match }));
}

type StatRowProps = { label: string; home: number | string; away: number | string; highlight?: boolean };
const StatRow = ({ label, home, away, highlight }: StatRowProps) => {
  const hNum = typeof home === "number" ? home : parseFloat(home) || 0;
  const aNum = typeof away === "number" ? away : parseFloat(away) || 0;
  const total = hNum + aNum || 1;

  return (
    <div className={cn("flex items-center py-2.5 px-4 text-xs", highlight && "bg-muted/30")}>
      <span className={cn("flex-1 text-right font-mono font-semibold", hNum > aNum && "text-stat-positive")}>{home}</span>
      <div className="w-32 mx-3 space-y-1">
        <span className="block text-center text-[10px] text-muted-foreground font-medium">{label}</span>
        <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
          <div className="bg-primary/60 transition-all duration-500 rounded-l-full" style={{ width: `${(hNum / total) * 100}%` }} />
          <div className="bg-stat-warn/60 transition-all duration-500 rounded-r-full" style={{ width: `${(aNum / total) * 100}%` }} />
        </div>
      </div>
      <span className={cn("flex-1 font-mono font-semibold", aNum > hNum && "text-stat-positive")}>{away}</span>
    </div>
  );
};

const MatchView = ({
  match,
  allMatches,
  onNavigate,
}: {
  match: Match;
  allMatches: Match[];
  onNavigate: (m: Match) => void;
}) => {
  const m = match;
  const date = new Date(m.match_date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const homeForm = getTeamForm(m.home_team, allMatches, m.match_date);
  const awayForm = getTeamForm(m.away_team, allMatches, m.match_date);

  const homeWin = (m.ft_home_goals ?? 0) > (m.ft_away_goals ?? 0);
  const awayWin = (m.ft_away_goals ?? 0) > (m.ft_home_goals ?? 0);
  const isDraw = (m.ft_home_goals ?? 0) === (m.ft_away_goals ?? 0);

  return (
    <div className="animate-in fade-in-0 duration-150">
      <div className="px-4 pt-4 pb-3">
        <div className="text-center mb-3">
          <div className="flex items-center justify-center gap-2">
            <LeagueLogo leagueName={m.league_name} size="sm" />
            <span className="text-xs font-semibold text-primary">{m.league_name}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
        </div>

        <div className="flex items-center h-14 overflow-hidden rounded-xl border border-border">
          <div className={cn(
            "flex-1 h-full flex items-center justify-between px-3",
            homeWin && "bg-stat-positive/10",
            awayWin && "bg-stat-negative/5",
            isDraw && "bg-stat-warn/5",
          )}>
            <TeamLogo teamName={m.home_team} size="sm" />
            <span className="font-bold text-xs">{m.home_team}</span>
          </div>
          <div className="flex items-center h-full bg-foreground/90 px-4 gap-0 z-10">
            <span className="font-mono font-bold text-lg text-background min-w-[1.2rem] text-center">{m.ft_home_goals ?? 0}</span>
            <span className="mx-2 text-xs text-muted/60">-</span>
            <span className="font-mono font-bold text-lg text-background min-w-[1.2rem] text-center">{m.ft_away_goals ?? 0}</span>
          </div>
          <div className={cn(
            "flex-1 h-full flex items-center justify-between px-3",
            awayWin && "bg-stat-positive/10",
            homeWin && "bg-stat-negative/5",
            isDraw && "bg-stat-warn/5",
          )}>
            <span className="font-bold text-xs">{m.away_team}</span>
            <TeamLogo teamName={m.away_team} size="sm" />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono mt-2 text-center">HT {m.ht_home_goals ?? "?"} – {m.ht_away_goals ?? "?"}</p>
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground font-medium mb-2 text-center">Match Statistics</p>
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          <StatRow label="Shots" home={m.home_shots ?? 0} away={m.away_shots ?? 0} />
          <StatRow label="On Target" home={m.home_shots_target ?? 0} away={m.away_shots_target ?? 0} highlight />
          <StatRow label="Corners" home={m.home_corners ?? 0} away={m.away_corners ?? 0} />
          <StatRow label="Fouls" home={m.home_fouls ?? 0} away={m.away_fouls ?? 0} highlight />
          <StatRow label="Yellows" home={m.home_yellows ?? 0} away={m.away_yellows ?? 0} />
          <StatRow label="Reds" home={m.home_reds ?? 0} away={m.away_reds ?? 0} highlight />
        </div>
        {m.referee && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            <span className="font-medium">Referee:</span> {m.referee}
          </p>
        )}
      </div>

      <div className="px-4 py-3">
        <p className="text-xs text-muted-foreground font-medium mb-3 text-center">Recent Form</p>
        <div className="space-y-3">
          {[
            { team: m.home_team, form: homeForm, tag: "HOME" },
            { team: m.away_team, form: awayForm, tag: "AWAY" },
          ].map(({ team, form, tag }) => {
            const wins = form.filter((f) => f.result === "W").length;
            const draws = form.filter((f) => f.result === "D").length;
            const losses = form.filter((f) => f.result === "L").length;
            return (
              <div key={team} className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{team}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-primary/10 text-primary font-medium rounded-md">{tag}</span>
                  </div>
                  {form.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] font-mono font-semibold">
                      <span className="text-stat-positive">{wins}W</span>
                      <span className="text-stat-warn">{draws}D</span>
                      <span className="text-stat-negative">{losses}L</span>
                    </div>
                  )}
                </div>
                {form.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No prior matches</p>
                ) : (
                  <div className="divide-y divide-border">
                    {form.map((f, i) => {
                      const fm = f.match;
                      const isHome = fm.home_team === team;
                      const opponent = isHome ? fm.away_team : fm.home_team;
                      const dateStr = new Date(fm.match_date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                      return (
                        <button
                          key={i}
                          onClick={() => onNavigate(fm)}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                        >
                          <span className={cn(
                            "w-6 h-6 flex items-center justify-center text-[10px] font-semibold font-mono rounded-md flex-shrink-0",
                            f.result === "W" && "bg-stat-positive/15 text-stat-positive",
                            f.result === "D" && "bg-stat-warn/15 text-stat-warn",
                            f.result === "L" && "bg-stat-negative/15 text-stat-negative"
                          )}>
                            {f.result}
                          </span>
                          <TeamLogo teamName={opponent} size="xs" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">{isHome ? "vs" : "at"}</span>
                              <span className="text-xs font-medium truncate">{opponent}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground">{fm.league_name}</span>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span className="font-mono text-xs font-semibold">{fm.ft_home_goals}-{fm.ft_away_goals}</span>
                            <p className="text-[9px] text-muted-foreground">{dateStr}</p>
                          </div>
                          <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="h-6" />
    </div>
  );
};

export const MatchDetailSheet = ({ match, allMatches, onClose }: Props) => {
  const [stack, setStack] = useState<Match[]>([match]);
  const currentMatch = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const handleNavigate = (m: Match) => setStack((prev) => [...prev, m]);
  const handleBack = () => setStack((prev) => prev.slice(0, -1));

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] bg-card rounded-t-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button onClick={handleBack} className="flex items-center gap-0.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            {!canGoBack && <span className="text-sm text-muted-foreground font-medium">Match Detail</span>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <MatchView key={currentMatch.id} match={currentMatch} allMatches={allMatches} onNavigate={handleNavigate} />
        </div>
      </div>
    </div>,
    document.body
  );
};
