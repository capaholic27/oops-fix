import type { TeamMatchView } from "@/lib/matchStats";
import { FormBadge } from "./FormBadge";

type Props = {
  views: TeamMatchView[];
};

export const RecentResults = ({ views }: Props) => {
  const recent = views.slice(-10).reverse();

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full" style={{ animationDelay: "600ms" }}>
      <span className="stat-label mb-4 block">Recent Results</span>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider">Date</th>
              <th className="text-left font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Opponent</th>
              <th className="text-center font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Result</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Shots</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">SOT</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Corners</th>
              <th className="text-right font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider">Fouls</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((v, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-2.5 font-mono text-xs text-muted-foreground">{v.match.match_date}</td>
                <td className="px-3 py-2.5 font-medium text-sm">
                  {v.isHome ? "vs" : "@"} {v.opponent}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <FormBadge result={v.result} />
                    <span className="font-mono text-xs">{v.goalsFor}-{v.goalsAgainst}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{v.shotsFor}-{v.shotsAgainst}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{v.shotsOnTargetFor}-{v.shotsOnTargetAgainst}</td>
                <td className="px-3 py-2.5 text-right font-mono text-sm">{v.cornersFor}-{v.cornersAgainst}</td>
                <td className="px-5 py-2.5 text-right font-mono text-sm">{v.foulsCommitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {recent.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">No match data available. Sync data first.</p>
      )}
    </div>
  );
};
