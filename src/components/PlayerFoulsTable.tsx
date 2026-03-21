import type { PlayerFoulProfile } from "@/data/teamStats";

type PlayerFoulsTableProps = {
  players: PlayerFoulProfile[];
};

export const PlayerFoulsTable = ({ players }: PlayerFoulsTableProps) => {
  const sorted = [...players].sort((a, b) => b.foulsDrawn / b.appearances - a.foulsDrawn / a.appearances);

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full" style={{ animationDelay: "500ms" }}>
      <span className="stat-label mb-4 block">Player Foul Profiles</span>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider">Player</th>
              <th className="text-left font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Pos</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Fouls/G</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">Drawn/G</th>
              <th className="text-right font-medium text-muted-foreground px-3 pb-3 text-xs uppercase tracking-wider">🟨</th>
              <th className="text-right font-medium text-muted-foreground px-5 pb-3 text-xs uppercase tracking-wider">🟥</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((player, i) => (
              <tr key={player.name} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-5 py-3 font-medium">{player.name}</td>
                <td className="px-3 py-3 text-muted-foreground text-xs font-mono">{player.position}</td>
                <td className="px-3 py-3 text-right font-mono text-sm">
                  {(player.foulsCommitted / player.appearances).toFixed(1)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm text-stat-warn font-semibold">
                  {(player.foulsDrawn / player.appearances).toFixed(1)}
                </td>
                <td className="px-3 py-3 text-right font-mono text-sm">{player.yellowCards}</td>
                <td className="px-5 py-3 text-right font-mono text-sm">
                  {player.redCards > 0 ? (
                    <span className="text-stat-negative font-semibold">{player.redCards}</span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 px-0">
        Sorted by fouls drawn per game — higher = more likely to win free kicks
      </p>
    </div>
  );
};
