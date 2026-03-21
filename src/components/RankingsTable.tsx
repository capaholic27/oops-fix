import type { Match } from "@/lib/matchStats";
import { getTeamMatchView, aggregateStats } from "@/lib/matchStats";

type Props = {
  matches: Match[];
  leagueName: string;
};

type RankedTeam = {
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  avgShots: number;
  avgSOT: number;
};

export const RankingsTable = ({ matches, leagueName }: Props) => {
  const teams = new Set<string>();
  matches.forEach(m => { teams.add(m.home_team); teams.add(m.away_team); });

  const ranked: RankedTeam[] = Array.from(teams).map(team => {
    const views = matches
      .map(m => getTeamMatchView(m, team))
      .filter(Boolean) as ReturnType<typeof getTeamMatchView>[];

    const validViews = views.filter((v): v is NonNullable<typeof v> => v !== null);
    const stats = aggregateStats(validViews);

    return {
      name: team,
      played: stats.matchesPlayed,
      wins: stats.wins,
      draws: stats.draws,
      losses: stats.losses,
      gf: stats.goalsFor,
      ga: stats.goalsAgainst,
      gd: stats.goalsFor - stats.goalsAgainst,
      points: stats.wins * 3 + stats.draws,
      avgShots: stats.avgShotsFor,
      avgSOT: stats.avgShotsOnTargetFor,
    };
  }).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full" style={{ animationDelay: "650ms" }}>
      <span className="stat-label mb-4 block">{leagueName || "League"} Rankings</span>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider w-8">#</th>
              <th className="text-left font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Team</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">P</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">W</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">D</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">L</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">GD</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Avg Shots</th>
              <th className="text-right font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider font-semibold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((t, i) => (
              <tr key={t.name} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium">{t.name}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.played}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.wins}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.draws}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.losses}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">
                  <span className={t.gd > 0 ? "text-stat-positive" : t.gd < 0 ? "text-stat-negative" : ""}>
                    {t.gd > 0 ? "+" : ""}{t.gd}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{t.avgShots.toFixed(1)}</td>
                <td className="px-5 py-2.5 text-right font-mono text-sm font-bold">{t.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
