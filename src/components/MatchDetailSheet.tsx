import { useState } from "react";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, Home, Plane } from "lucide-react";
import { FormBadge } from "./FormBadge";
import { TeamLogo } from "./TeamLogo";
import { LeagueLogo } from "./LeagueLogo";
import type { Match } from "@/lib/matchStats";
import { getTeamMatchView } from "@/lib/matchStats";

type Props = {
  match: Match;
  allMatches: Match[];
  onClose: () => void;
};

function getTeamForm(team: string, allMatches: Match[], beforeDate: string, count = 5) {
  return allMatches
    .filter(
      (m) =>
        (m.home_team === team || m.away_team === team) &&
        m.match_date < beforeDate
    )
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .slice(0, count)
    .map((m) => {
      const view = getTeamMatchView(m, team);
      return view ? { result: view.result, match: m } : null;
    })
    .filter(Boolean) as { result: "W" | "D" | "L"; match: Match }[];
}

type StatRowProps = { label: string; home: number | string; away: number | string; highlight?: boolean };
const StatRow = ({ label, home, away, highlight }: StatRowProps) => {
  const hNum = typeof home === "number" ? home : parseFloat(home) || 0;
  const aNum = typeof away === "number" ? away : parseFloat(away) || 0;
  const total = hNum + aNum || 1;

  return (
    <div className={cn("flex items-center py-2 px-3 text-xs", highlight && "bg-muted/30")}>
      <span className={cn("flex-1 text-right font-mono font-bold", hNum > aNum && "text-stat-positive")}>{home}</span>
      <div className="w-32 mx-3 space-y-1">
        <span className="block text-center text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</span>
        <div className="flex h-1 rounded-full overflow-hidden bg-muted">
          <div className="bg-primary/70 transition-all duration-500" style={{ width: `${(hNum / total) * 100}%` }} />
          <div className="bg-accent/70 transition-all duration-500" style={{ width: `${(aNum / total) * 100}%` }} />
        </div>
      </div>
      <span className={cn("flex-1 font-mono font-bold", aNum > hNum && "text-stat-positive")}>{away}</span>
    </div>
  );
};

/* Internal detail view for a single match */
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const homeForm = getTeamForm(m.home_team, allMatches, m.match_date);
  const awayForm = getTeamForm(m.away_team, allMatches, m.match_date);

  const homeWin = (m.ft_home_goals ?? 0) > (m.ft_away_goals ?? 0);
  const awayWin = (m.ft_away_goals ?? 0) > (m.ft_home_goals ?? 0);
  const isDraw = (m.ft_home_goals ?? 0) === (m.ft_away_goals ?? 0);

  return (
    <div className="animate-in fade-in-0 duration-150">
      {/* Score Hero */}
      <div className={cn(
        "px-4 py-5",
        homeWin && "bg-gradient-to-r from-stat-positive/10 to-transparent",
        awayWin && "bg-gradient-to-r from-transparent to-stat-positive/10",
        isDraw && "bg-muted/20"
      )}>
        <div className="text-center mb-1">
          <div className="flex items-center justify-center gap-1.5">
            <LeagueLogo leagueName={m.league_name} size="sm" />
            <span className="text-[9px] uppercase tracking-[0.2em] text-primary font-bold">{m.league_name}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">{date}</p>
        </div>

        <div className="flex items-center justify-center gap-4 mt-3">
          <div className="flex-1 text-right space-y-1">
            <p className={cn("text-sm font-display", homeWin && "text-stat-positive")}>{m.home_team}</p>
            <div className="flex items-center justify-end gap-1">
              <Home className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Home</span>
            </div>
          </div>

          <div className="text-center">
            <div className="border-2 border-foreground bg-card px-4 py-2 shadow-[3px_3px_0_hsl(var(--foreground))]">
              <span className="font-mono text-3xl font-bold tracking-wider">
                {m.ft_home_goals} — {m.ft_away_goals}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground font-mono mt-1">
              HT {m.ht_home_goals ?? "?"} – {m.ht_away_goals ?? "?"}
            </p>
          </div>

          <div className="flex-1 space-y-1">
            <p className={cn("text-sm font-display", awayWin && "text-stat-positive")}>{m.away_team}</p>
            <div className="flex items-center gap-1">
              <Plane className="w-2.5 h-2.5 text-muted-foreground" />
              <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Away</span>
            </div>
          </div>
        </div>
      </div>

      {/* Match Stats */}
      <div className="px-3 py-3">
        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-2 text-center">
          Match Statistics
        </p>
        <div className="border border-border rounded-sm overflow-hidden divide-y divide-border">
          <StatRow label="Shots" home={m.home_shots ?? 0} away={m.away_shots ?? 0} />
          <StatRow label="On Target" home={m.home_shots_target ?? 0} away={m.away_shots_target ?? 0} highlight />
          <StatRow label="Corners" home={m.home_corners ?? 0} away={m.away_corners ?? 0} />
          <StatRow label="Fouls" home={m.home_fouls ?? 0} away={m.away_fouls ?? 0} highlight />
          <StatRow label="Yellows" home={m.home_yellows ?? 0} away={m.away_yellows ?? 0} />
          <StatRow label="Reds" home={m.home_reds ?? 0} away={m.away_reds ?? 0} highlight />
        </div>
        {m.referee && (
          <p className="text-[9px] text-muted-foreground text-center mt-2">
            <span className="font-semibold">Referee:</span> {m.referee}
          </p>
        )}
      </div>

      {/* Form Sections */}
      <div className="px-3 py-3">
        <p className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-bold mb-3 text-center">
          Recent Form
        </p>
        <div className="space-y-2">
          {[
            { team: m.home_team, form: homeForm, tag: "HOME" },
            { team: m.away_team, form: awayForm, tag: "AWAY" },
          ].map(({ team, form, tag }) => {
            const wins = form.filter((f) => f.result === "W").length;
            const draws = form.filter((f) => f.result === "D").length;
            const losses = form.filter((f) => f.result === "L").length;

            return (
              <div key={team} className="border border-border rounded-sm overflow-hidden">
                {/* Team header bar */}
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wide">{team}</span>
                    <span className="text-[8px] px-1.5 py-0.5 bg-primary/10 text-primary font-bold uppercase tracking-wider rounded-sm">{tag}</span>
                  </div>
                  {form.length > 0 && (
                    <div className="flex items-center gap-2 text-[9px] font-mono font-bold">
                      <span className="text-stat-positive">{wins}W</span>
                      <span className="text-stat-warn">{draws}D</span>
                      <span className="text-stat-negative">{losses}L</span>
                    </div>
                  )}
                </div>

                {form.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-3 italic">No prior matches</p>
                ) : (
                  <div className="divide-y divide-border">
                    {form.map((f, i) => {
                      const fm = f.match;
                      const isHome = fm.home_team === team;
                      const opponent = isHome ? fm.away_team : fm.home_team;
                      const dateStr = new Date(fm.match_date + "T00:00:00").toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      });

                      return (
                        <button
                          key={i}
                          onClick={() => onNavigate(fm)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                        >
                          {/* Result badge */}
                          <span
                            className={cn(
                              "w-6 h-6 flex items-center justify-center text-[10px] font-bold font-mono rounded-sm flex-shrink-0",
                              f.result === "W" && "bg-stat-positive/15 text-stat-positive",
                              f.result === "D" && "bg-stat-warn/15 text-stat-warn",
                              f.result === "L" && "bg-stat-negative/15 text-stat-negative"
                            )}
                          >
                            {f.result}
                          </span>

                          {/* Match info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-muted-foreground uppercase">{isHome ? "vs" : "at"}</span>
                              <span className="text-[11px] font-semibold truncate">{opponent}</span>
                            </div>
                            <span className="text-[8px] text-muted-foreground">{fm.league_name}</span>
                          </div>

                          {/* Score + date */}
                          <div className="text-right flex-shrink-0">
                            <span className="font-mono text-xs font-bold">
                              {fm.ft_home_goals}-{fm.ft_away_goals}
                            </span>
                            <p className="text-[8px] text-muted-foreground">{dateStr}</p>
                          </div>

                          {/* Chevron */}
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

/* Main exported component — single sheet with internal navigation stack */
export const MatchDetailSheet = ({ match, allMatches, onClose }: Props) => {
  const [stack, setStack] = useState<Match[]>([match]);
  const currentMatch = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const handleNavigate = (m: Match) => {
    setStack((prev) => [...prev, m]);
  };

  const handleBack = () => {
    setStack((prev) => prev.slice(0, -1));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 animate-in fade-in-0 duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[88vh] bg-card border-t-2 border-foreground overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card flex-shrink-0">
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button
                onClick={handleBack}
                className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            {!canGoBack && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Match Detail
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-sm transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <MatchView
            key={currentMatch.id}
            match={currentMatch}
            allMatches={allMatches}
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};
