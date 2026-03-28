import { useMemo } from "react";
import { useMatches } from "@/hooks/useMatches";
import { FormBadge } from "@/components/FormBadge";
import { cn } from "@/lib/utils";

type MatchRow = {
  id: string;
  match_date: string;
  home_team: string;
  away_team: string;
  ft_home_goals: number;
  ft_away_goals: number;
  ft_result: string;
  league_name: string;
  league_code: string;
};

const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();

  // Group last 60 matches by date, most recent first
  const grouped = useMemo(() => {
    const sorted = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 60) as MatchRow[];

    const map = new Map<string, MatchRow[]>();
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
        <div className="retro-border bg-card p-6 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">No match data — sync first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 pb-20 space-y-3 max-w-lg mx-auto">
      <h2 className="text-lg text-center">Recent Results</h2>

      {grouped.map(([date, matches]) => {
        const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });

        // Group by league within each date
        const byLeague = new Map<string, MatchRow[]>();
        matches.forEach((m) => {
          const existing = byLeague.get(m.league_name) || [];
          existing.push(m);
          byLeague.set(m.league_name, existing);
        });

        return (
          <div key={date}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
              {formatted}
            </div>

            {Array.from(byLeague.entries()).map(([league, leagueMatches]) => (
              <div key={league} className="mb-2">
                <div className="text-[9px] uppercase tracking-wider text-primary font-bold px-2 mb-0.5">
                  {league}
                </div>
                <div className="border-2 border-border bg-card shadow-[2px_2px_0_hsl(var(--border))]">
                  {leagueMatches.map((m, i) => {
                    const homeWin = m.ft_home_goals > m.ft_away_goals;
                    const awayWin = m.ft_away_goals > m.ft_home_goals;

                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "flex items-center px-2 py-1.5 text-xs",
                          i < leagueMatches.length - 1 && "border-b border-border"
                        )}
                      >
                        <span className={cn(
                          "flex-1 truncate text-right pr-2",
                          homeWin && "font-bold"
                        )}>
                          {m.home_team}
                        </span>
                        <span className="font-mono font-bold text-sm px-2 min-w-[3rem] text-center bg-muted border border-border">
                          {m.ft_home_goals} - {m.ft_away_goals}
                        </span>
                        <span className={cn(
                          "flex-1 truncate pl-2",
                          awayWin && "font-bold"
                        )}>
                          {m.away_team}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
};

export default UpcomingGamesPage;
