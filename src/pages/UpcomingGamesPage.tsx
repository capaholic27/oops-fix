import { useState, useMemo, useCallback } from "react";
import { useMatches } from "@/hooks/useMatches";
import { getTeamMatchView } from "@/lib/matchStats";
import { MatchDetailSheet } from "@/components/MatchDetailSheet";
import { TeamLogo } from "@/components/TeamLogo";
import { LeagueLogo } from "@/components/LeagueLogo";
import { AdBanner } from "@/components/AdBanner";
import { cn } from "@/lib/utils";
import { Trophy, TrendingUp, Target, Flame, Zap } from "lucide-react";
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
          "w-[5px] h-[5px] rounded-full",
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
  onSelect,
}: {
  match: Match;
  allMatches: Match[];
  onSelect: (m: Match) => void;
}) => {
  const m = match;
  const homeGoals = m.ft_home_goals ?? 0;
  const awayGoals = m.ft_away_goals ?? 0;
  const homeWin = homeGoals > awayGoals;
  const awayWin = awayGoals > homeGoals;
  const isDraw = homeGoals === awayGoals;

  const homeForm = useMemo(() => getTeamFormQuick(m.home_team, allMatches, m.match_date), [m, allMatches]);
  const awayForm = useMemo(() => getTeamFormQuick(m.away_team, allMatches, m.match_date), [m, allMatches]);

  return (
    <button
      onClick={() => onSelect(m)}
      className="w-full flex items-center px-3 py-2.5 text-xs hover:bg-muted/40 transition-colors text-left border-b border-border last:border-b-0"
    >
      {/* Home side */}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
        <div className="min-w-0 text-right space-y-0.5">
          <p className="truncate text-[11px] font-medium">{m.home_team}</p>
          <div className="flex justify-end">
            <FormDots form={homeForm} />
          </div>
        </div>
        <TeamLogo teamName={m.home_team} size="xs" />
      </div>

      {/* Score with lightning bolt separator */}
      <div className="px-1.5 flex-shrink-0">
        <div
          className={cn(
            "flex items-center gap-0 rounded-md overflow-hidden border",
            homeWin && "border-stat-positive/30",
            awayWin && "border-stat-positive/30",
            isDraw && "border-stat-warn/30"
          )}
        >
          {/* Home score */}
          <span
            className={cn(
              "font-mono font-bold text-sm px-2 py-1 min-w-[1.5rem] text-center",
              homeWin && "bg-stat-positive/15 text-stat-positive",
              awayWin && "bg-stat-negative/10 text-stat-negative",
              isDraw && "bg-stat-warn/10 text-stat-warn"
            )}
          >
            {homeGoals}
          </span>

          {/* Lightning bolt divider */}
          <div className={cn(
            "flex items-center justify-center px-0.5 py-1",
            homeWin && "bg-stat-positive/8",
            awayWin && "bg-stat-positive/8",
            isDraw && "bg-stat-warn/8"
          )}>
            <Zap className={cn(
              "w-2.5 h-2.5",
              homeWin && "text-stat-positive/60",
              awayWin && "text-stat-positive/60",
              isDraw && "text-stat-warn/60"
            )} />
          </div>

          {/* Away score */}
          <span
            className={cn(
              "font-mono font-bold text-sm px-2 py-1 min-w-[1.5rem] text-center",
              awayWin && "bg-stat-positive/15 text-stat-positive",
              homeWin && "bg-stat-negative/10 text-stat-negative",
              isDraw && "bg-stat-warn/10 text-stat-warn"
            )}
          >
            {awayGoals}
          </span>
        </div>
      </div>

      {/* Away side */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <TeamLogo teamName={m.away_team} size="xs" />
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-[11px] font-medium">{m.away_team}</p>
          <FormDots form={awayForm} />
        </div>
      </div>
    </button>
  );
};

/* ── Stat bar item ── */
const StatBar = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="flex-1 min-w-0 text-center">
    <span className={cn("font-mono text-xs font-bold", color || "text-foreground")}>{value}</span>
    <p className="text-[7px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">{label}</p>
  </div>
);

/* ── Main Page ── */
const UpcomingGamesPage = () => {
  const { data: allMatches = [], isLoading } = useMatches();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const handleSelect = useCallback((m: Match) => setSelectedMatch(m), []);
  const handleClose = useCallback(() => setSelectedMatch(null), []);

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

  // Summary stats
  const summaryStats = useMemo(() => {
    const recent = [...allMatches]
      .sort((a, b) => b.match_date.localeCompare(a.match_date))
      .slice(0, 80);

    const totalGoals = recent.reduce((s, m) => s + (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0), 0);
    const homeWins = recent.filter((m) => (m.ft_home_goals ?? 0) > (m.ft_away_goals ?? 0)).length;
    const draws = recent.filter((m) => (m.ft_home_goals ?? 0) === (m.ft_away_goals ?? 0)).length;
    const avgGoals = recent.length ? (totalGoals / recent.length).toFixed(1) : "0";

    // Highest scoring match
    let topMatch: Match | null = null;
    let topGoals = 0;
    recent.forEach((m) => {
      const g = (m.ft_home_goals ?? 0) + (m.ft_away_goals ?? 0);
      if (g > topGoals) { topGoals = g; topMatch = m; }
    });

    return { totalGoals, homeWins, draws, avgGoals, topMatch, topGoals, total: recent.length };
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

      {/* Summary stats bar */}
      <div className="flex gap-1.5 mb-3">
        <QuickStat icon={Target} label="Goals" value={summaryStats.totalGoals} />
        <QuickStat icon={TrendingUp} label="Avg/Game" value={summaryStats.avgGoals} />
        <QuickStat icon={Trophy} label="Home Wins" value={summaryStats.homeWins} />
        <QuickStat icon={Flame} label="Draws" value={summaryStats.draws} />
      </div>

      {/* Top scoring match highlight */}
      {summaryStats.topMatch && (
        <button
          onClick={() => handleSelect(summaryStats.topMatch!)}
          className="w-full mb-3 border border-accent/30 bg-accent/5 rounded-md px-3 py-2 flex items-center gap-2 text-left hover:bg-accent/10 transition-colors"
        >
          <Flame className="w-4 h-4 text-accent flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[9px] uppercase tracking-widest text-accent font-bold">Highest Scoring</p>
            <p className="text-[11px] font-semibold truncate">
              {summaryStats.topMatch.home_team} {summaryStats.topMatch.ft_home_goals} – {summaryStats.topMatch.ft_away_goals} {summaryStats.topMatch.away_team}
            </p>
          </div>
          <span className="font-mono text-xs font-bold text-accent">{summaryStats.topGoals} goals</span>
        </button>
      )}

      <AdBanner variant="inline" />

      {grouped.map(([date, matches], groupIdx) => {
        const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

        const byLeague = new Map<string, Match[]>();
        matches.forEach((m) => {
          const existing = byLeague.get(m.league_name) || [];
          existing.push(m);
          byLeague.set(m.league_name, existing);
        });

        return (
          <div key={date}>
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-0.5">
                {formatted}
              </div>

              {Array.from(byLeague.entries()).map(([league, leagueMatches]) => (
                <div key={league} className="mb-1.5">
                  <div className="flex items-center gap-1 px-1 mb-0.5">
                    <LeagueLogo leagueName={league} size="xs" />
                    <span className="text-[8px] uppercase tracking-[0.15em] text-primary font-bold">{league}</span>
                  </div>
                  <div className="border border-border bg-card rounded-sm overflow-hidden">
                    {leagueMatches.map((m) => (
                      <MatchRow
                        key={m.id}
                        match={m}
                        allMatches={allMatches}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Mid-page ad after 3rd date group */}
            {groupIdx === 2 && <AdBanner variant="inline" />}
          </div>
        );
      })}

      {/* Ad banner after results */}
      <AdBanner variant="inline" />

      {/* Single detail sheet with internal stack */}
      {selectedMatch && (
        <MatchDetailSheet
          match={selectedMatch}
          allMatches={allMatches}
          onClose={handleClose}
        />
      )}
    </div>
  );
};

export default UpcomingGamesPage;
