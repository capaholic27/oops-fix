import { useMemo, useState } from "react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { computePlayerProps, type PlayerProp } from "@/lib/playerProps";
import type { RealPlayer } from "@/hooks/useTeamPlayers";
import { cn } from "@/lib/utils";

type Props = {
  homeTeam: string;
  awayTeam: string;
  homeSquad: RealPlayer[];
  awaySquad: RealPlayer[];
  homeOut: Set<string>;
  awayOut: Set<string>;
  lambdaHome: number;
  lambdaAway: number;
};

type MarketKey = "scoreOrAssist" | "anytimeScorer" | "assist" | "yellowCard" | "expectedFouls";

const MARKETS: { key: MarketKey; label: string }[] = [
  { key: "anytimeScorer", label: "To score" },
  { key: "assist", label: "To assist" },
  { key: "scoreOrAssist", label: "Score or assist" },
  { key: "yellowCard", label: "To be booked" },
  { key: "expectedFouls", label: "Foul risk" },
];

function confClass(v: number) {
  return v >= 45
    ? "bg-stat-positive/15 text-stat-positive"
    : v >= 25
      ? "bg-stat-warn/15 text-stat-warn"
      : "bg-muted text-muted-foreground";
}

export const PlayerPropsPanel = ({
  homeTeam, awayTeam, homeSquad, awaySquad, homeOut, awayOut, lambdaHome, lambdaAway,
}: Props) => {
  const [market, setMarket] = useState<MarketKey>("anytimeScorer");

  const props = useMemo(() => {
    const h = computePlayerProps(homeSquad, homeTeam, lambdaHome, homeOut);
    const a = computePlayerProps(awaySquad, awayTeam, lambdaAway, awayOut);
    return [...h, ...a];
  }, [homeSquad, awaySquad, homeTeam, awayTeam, lambdaHome, lambdaAway, homeOut, awayOut]);

  const ranked = useMemo(() => {
    const sorted = [...props].sort((a, b) => (b[market] as number) - (a[market] as number));
    return sorted.slice(0, 10);
  }, [props, market]);

  const value = (p: PlayerProp) =>
    market === "expectedFouls" ? `${p.expectedFouls.toFixed(1)} fpg` : `${(p[market] as number).toFixed(0)}%`;

  if (props.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-[11px] text-muted-foreground">
          Player data isn't available for these teams yet — full-match markets still work.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground">Player Markets</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-border">
        {MARKETS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMarket(m.key)}
            className={cn(
              "px-2.5 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap border transition-colors",
              market === m.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-border">
        {ranked.map((p) => (
          <div key={`${p.team}-${p.player}`} className="flex items-center gap-2 px-3 py-2">
            <PlayerAvatar name={p.player} photoUrl={p.photo} size="xs" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold truncate">{p.player}</p>
              <p className="text-[9px] text-muted-foreground truncate">{p.team} · {p.position || "—"}</p>
            </div>
            <span className={cn("font-mono text-[10px] font-bold px-1.5 py-0.5 rounded", confClass(market === "expectedFouls" ? p.expectedFouls * 20 : (p[market] as number)))}>
              {value(p)}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground px-3 py-2 border-t border-border leading-relaxed">
        Derived from each player's share of team output scaled to the projected team xG
        ({lambdaHome.toFixed(2)} – {lambdaAway.toFixed(2)}). Unavailable players are excluded.
      </p>
    </div>
  );
};
