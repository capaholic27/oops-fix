import { useState, useMemo, useCallback } from "react";
import { useMatches } from "@/hooks/useMatches";
import { getTeamMatchView } from "@/lib/matchStats";
import { FormBadge } from "@/components/FormBadge";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { cn } from "@/lib/utils";
import type { Match } from "@/lib/matchStats";

/* ── helpers ── */
function getTeamFormQuick(team: string, allMatches: Match[], beforeDate: string, count = 5) {
  return allMatches
    .filter((m) => (m.home_team === team || m.away_team === team) && m.match_date < beforeDate)
    .sort((a, b) => b.match_date.localeCompare(a.match_date))
    .slice(0, count)
    .map((m) => {
      const v = getTeamMatchView(m, team);
      return v ? v.result : null;
    })
    .filter(Boolean) as ("W" | "D" | "L")[];
}

/* ── tiny form dots ── */
const FormDots = ({ form }: { form: ("W" | "D" | "L")[] }) => (
  <div className="flex gap-[3px]">
    {form.map((r, i) => (
      <span
        key={i}
        className={cn(
          "w-[6px] h-[6px] rounded-full",
          r === "W" && "bg-stat-positive",
          r === "D" && "bg-stat-warn",
          r === "L" && "bg-stat-negative"
        )}
      />
    ))}
  </div>
);

/* ── Match Row ── */
const MatchRow = ({
  match,
  allMatches,
  isLast,
  onSelect,
}: {
  match: Match;
  allMatches: Match[];
  isLast: boolean;
  onSelect: (m: Match) => void;
}) => {
  const m = match;
  const homeWin = m.ft_home_goals > m.ft_away_goals;
  const awayWin = m.ft_away_goals > m.ft_home_goals;

  const homeForm = useMemo(() => getTeamFormQuick(m.home_team, allMatches, m.match_date), [m, allMatches]);
  const awayForm = useMemo(() => getTeamFormQuick(m.away_team, allMatches, m.match_date), [m, allMatches]);

  return (
    <button
      onClick={() => onSelect(m)}
      className={cn(
        "w-full flex items-center px-2.5 py-2 text-xs hover:bg-muted/50 transition-colors text-left",
        !isLast && "border-b border-border"
      )}
    >
      {/* Home side */}
      <div className="flex-1 min-w-0 text-right space-y-0.5">
        <p className={cn("truncate", homeWin && "font-bold")}>{m.home_team}</p>
        <div className="flex justify-end">
          <FormDots form={homeForm} />
        </div>
      </div>

      {/* Score */}
      <div className="px-2.5 flex-shrink-0">
        <span className="font-mono font-bold text-sm bg-muted border border-border px-2 py-0.5 inline-block min-w-[2.8rem] text-center">
          {m.ft_home_goals} - {m.ft_away_goals}
        </span>
      </div>

      {/* Away side */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className={cn("truncate", awayWin && "font-bold")}>{m.away_team}</p>
        <FormDots form={awayForm} />
      </div>
    </button>
  );
};

/* ── Main Page ── */
const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const [matchStack, setMatchStack] = useState<Match[]>([]);

  const selectedMatch = matchStack.length > 0 ? matchStack[matchStack.length - 1] : null;

  const handleSelect = useCallback((m: Match) => {
    setMatchStack([m]);
  }, []);

  const handleNavigate = useCallback((m: Match) => {
    setMatchStack((prev) => [...prev, m]);
  }, []);

  const handleClose = useCallback(() => {
    setMatchStack((prev) => {
      if (prev.length <= 1) return [];
      return prev.slice(0, -1);
    });
  }, []);

  // Group last 80 matches by date
  const grouped = useMemo(() => {
    const sorted = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 80);

    const map = new Map<string, Match[]>();
    sorted.forEach((m) => {
      const existing = map.get(m.match_date) || [];
      existing.push(m);
      map.set(m.match_date, existing);
    });
    return Array.from(map.entries());
  }, [allMatches]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">Loading…</p>
      </div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="border-2 border-border bg-card p-6 text-center shadow-[3px_3px_0_hsl(var(--border))]">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">No match data — sync first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-20 max-w-lg mx-auto">
      <h2 className="text-lg text-center mb-3">Results</h2>

      {grouped.map(([date, matches]) => {
        const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

        // Group by league
        const byLeague = new Map<string, Match[]>();
        matches.forEach((m) => {
          const existing = byLeague.get(m.league_name) || [];
          existing.push(m);
          byLeague.set(m.league_name, existing);
        });

        return (
          <div key={date} className="mb-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
              {formatted}
            </div>

            {Array.from(byLeague.entries()).map(([league, leagueMatches]) => (
              <div key={league} className="mb-1.5">
                <div className="text-[8px] uppercase tracking-[0.15em] text-primary font-bold px-1 mb-0.5">
                  {league}
                </div>
                <div className="border border-border bg-card rounded-sm overflow-hidden">
                  {leagueMatches.map((m, i) => (
                    <MatchRow
                      key={m.id}
                      match={m}
                      allMatches={allMatches}
                      isLast={i === leagueMatches.length - 1}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {/* Detail sheet — supports back navigation via stack */}
      {selectedMatch && (
        <MatchDetailSheet
          match={selectedMatch}
          allMatches={allMatches}
          onClose={handleClose}
          onNavigateMatch={handleNavigate}
        />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
