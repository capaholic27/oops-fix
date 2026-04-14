import { useState } from "react";
import type { Match } from "@/lib/matchStats";
import { getTeamMatchView, aggregateStats } from "@/lib/matchStats";
import { normalizeTeamName } from "@/lib/teamNormalize";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [showAll, setShowAll] = useState(false);

  // Group teams by normalized name to merge duplicates
  const teamGroups = new Map<string, string[]>();
  const allTeams = new Set<string>();
  matches.forEach(m => { allTeams.add(m.home_team); allTeams.add(m.away_team); });

  allTeams.forEach(team => {
    const canonical = normalizeTeamName(team);
    if (!teamGroups.has(canonical)) teamGroups.set(canonical, []);
    if (!teamGroups.get(canonical)!.includes(team)) teamGroups.get(canonical)!.push(team);
  });

  const ranked: RankedTeam[] = Array.from(teamGroups.entries()).map(([canonical, variants]) => {
    // Collect all match views across all name variants
    const allViews = variants.flatMap(variant =>
      matches
        .map(m => getTeamMatchView(m, variant))
        .filter((v): v is NonNullable<ReturnType<typeof getTeamMatchView>> => v !== null)
    );

    // Deduplicate by match id
    const seen = new Set<string>();
    const uniqueViews = allViews.filter(v => {
      if (seen.has(v.match.id)) return false;
      seen.add(v.match.id);
      return true;
    });

    const stats = aggregateStats(uniqueViews);

    return {
      name: canonical,
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

  const displayed = showAll ? ranked : ranked.slice(0, 6);

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full" style={{ animationDelay: "650ms" }}>
      <div className="flex items-center justify-between mb-4">
        <span className="stat-label">{leagueName || "League"} Rankings</span>
        {ranked.length > 6 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all",
              showAll ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? "Show Less" : `Show All (${ranked.length})`}
          </button>
        )}
      </div>
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
            {displayed.map((t, i) => (
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
