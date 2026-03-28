import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { X, Home, Plane } from "lucide-react";
import { FormBadge } from "./FormBadge";
import type { Match } from "@/lib/matchStats";
import { getTeamMatchView } from "@/lib/matchStats";

type Props = {
  match: Match;
  allMatches: Match[];
  onClose: () => void;
  onNavigateMatch: (match: Match) => void;
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
const StatRow = ({ label, home, away, highlight }: StatRowProps) => (
  <div className={cn("flex items-center py-1.5 text-xs", highlight && "bg-muted/50")}>
    <span className="flex-1 text-right font-mono font-semibold">{home}</span>
    <span className="w-24 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
    <span className="flex-1 font-mono font-semibold">{away}</span>
  </div>
);

export const MatchDetailSheet = ({ match, allMatches, onClose, onNavigateMatch }: Props) => {
  const m = match;
  const date = new Date(m.match_date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const homeForm = getTeamForm(m.home_team, allMatches, m.match_date);
  const awayForm = getTeamForm(m.away_team, allMatches, m.match_date);

  const homeWin = m.ft_home_goals > m.ft_away_goals;
  const awayWin = m.ft_away_goals > m.ft_home_goals;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 animate-in fade-in-0 duration-150" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[85vh] bg-card border-t-2 border-foreground overflow-y-auto animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card z-10 border-b border-border">
          <div className="flex items-center justify-between px-3 py-2">
            <div>
              <span className="text-[9px] uppercase tracking-wider text-primary font-bold">{m.league_name}</span>
              <p className="text-[10px] text-muted-foreground">{date}</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-muted rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Score Header */}
          <div className="flex items-center px-4 py-3">
            <div className="flex-1 text-right">
              <p className={cn("text-sm", homeWin && "font-bold")}>{m.home_team}</p>
              <div className="flex items-center justify-end gap-0.5 mt-1">
                <Home className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground uppercase">Home</span>
              </div>
            </div>
            <div className="px-4">
              <span className="font-mono text-2xl font-bold">
                {m.ft_home_goals} - {m.ft_away_goals}
              </span>
              <p className="text-[9px] text-center text-muted-foreground font-mono">
                HT {m.ht_home_goals}-{m.ht_away_goals}
              </p>
            </div>
            <div className="flex-1">
              <p className={cn("text-sm", awayWin && "font-bold")}>{m.away_team}</p>
              <div className="flex items-center gap-0.5 mt-1">
                <Plane className="w-2.5 h-2.5 text-muted-foreground" />
                <span className="text-[9px] text-muted-foreground uppercase">Away</span>
              </div>
            </div>
          </div>
        </div>

        {/* Match Stats */}
        <div className="px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1.5 text-center">Match Statistics</p>
          <div className="border border-border rounded divide-y divide-border">
            <StatRow label="Shots" home={m.home_shots} away={m.away_shots} />
            <StatRow label="On Target" home={m.home_shots_target} away={m.away_shots_target} highlight />
            <StatRow label="Corners" home={m.home_corners} away={m.away_corners} />
            <StatRow label="Fouls" home={m.home_fouls} away={m.away_fouls} highlight />
            <StatRow label="Yellows" home={m.home_yellows} away={m.away_yellows} />
            <StatRow label="Reds" home={m.home_reds} away={m.away_reds} highlight />
          </div>
          {m.referee && (
            <p className="text-[9px] text-muted-foreground text-center mt-1.5">Referee: {m.referee}</p>
          )}
        </div>

        {/* Form Sections */}
        <div className="px-3 py-2 space-y-3">
          {[
            { team: m.home_team, form: homeForm },
            { team: m.away_team, form: awayForm },
          ].map(({ team, form }) => (
            <div key={team}>
              <p className="text-[10px] uppercase tracking-wider font-bold mb-1">{team} — Last {form.length}</p>
              {form.length === 0 ? (
                <p className="text-[10px] text-muted-foreground">No prior data</p>
              ) : (
                <div className="flex gap-1">
                  {form.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigateMatch(f.match)}
                      className="group relative"
                      title={`${f.match.home_team} ${f.match.ft_home_goals}-${f.match.ft_away_goals} ${f.match.away_team}`}
                    >
                      <FormBadge result={f.result} />
                      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[7px] text-muted-foreground opacity-0 group-hover:opacity-100 whitespace-nowrap transition-opacity">
                        {f.match.home_team.slice(0, 3)}-{f.match.away_team.slice(0, 3)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Spacer */}
        <div className="h-4" />
      </div>
    </div>,
    document.body
  );
};
