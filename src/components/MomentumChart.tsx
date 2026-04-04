import { useMemo } from "react";
import type { TeamMatchView } from "@/lib/matchStats";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Swords, Target, Crosshair, Flag, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  views: TeamMatchView[];
  teamName: string;
};

type MomentumPoint = {
  label: string;
  opponent: string;
  momentum: number;       // cumulative momentum score
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  shotsFor: number;
  shotsAgainst: number;
  sotFor: number;
  sotAgainst: number;
  cornersFor: number;
  foulsCommitted: number;
};

function computeMomentum(views: TeamMatchView[]): MomentumPoint[] {
  let momentum = 0;
  return views.map((v, i) => {
    // Momentum formula: win=+3, draw=0, loss=-3, plus goal diff bonus
    const resultScore = v.result === "W" ? 3 : v.result === "L" ? -3 : 0;
    const gdBonus = Math.max(-2, Math.min(2, (v.goalsFor - v.goalsAgainst) * 0.5));
    // Shots dominance bonus
    const shotBonus = v.shotsFor > v.shotsAgainst ? 0.5 : v.shotsFor < v.shotsAgainst ? -0.5 : 0;
    momentum += resultScore + gdBonus + shotBonus;

    return {
      label: `M${i + 1}`,
      opponent: `${v.isHome ? "vs" : "@"} ${v.opponent}`,
      momentum: Math.round(momentum * 10) / 10,
      goalsFor: v.goalsFor,
      goalsAgainst: v.goalsAgainst,
      result: v.result,
      shotsFor: v.shotsFor,
      shotsAgainst: v.shotsAgainst,
      sotFor: v.shotsOnTargetFor,
      sotAgainst: v.shotsOnTargetAgainst,
      cornersFor: v.cornersFor,
      foulsCommitted: v.foulsCommitted,
    };
  });
}

type StatBarProps = {
  label: string;
  forVal: number;
  againstVal: number;
  icon: React.ReactNode;
  format?: "decimal" | "integer";
};

const StatBar = ({ label, forVal, againstVal, icon, format = "decimal" }: StatBarProps) => {
  const total = forVal + againstVal;
  const pct = total > 0 ? (forVal / total) * 100 : 50;
  const fmt = (v: number) => format === "integer" ? Math.round(v).toString() : v.toFixed(1);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider">
        <span className="font-mono font-bold text-stat-positive">{fmt(forVal)}</span>
        <div className="flex items-center gap-1 text-muted-foreground font-semibold">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono font-bold text-stat-negative">{fmt(againstVal)}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden border border-border">
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{
            width: `${pct}%`,
            background: "hsl(var(--primary))",
          }}
        />
        <div
          className="h-full transition-all duration-700 ease-out"
          style={{
            width: `${100 - pct}%`,
            background: "hsl(var(--destructive, 0 84% 60%))",
            opacity: 0.7,
          }}
        />
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MomentumPoint;
  return (
    <div className="border-2 border-foreground bg-card p-2 shadow-[3px_3px_0_hsl(var(--foreground))] text-xs space-y-1">
      <p className="font-bold">{d.opponent}</p>
      <div className="flex items-center gap-2">
        <span className={cn(
          "px-1 font-bold text-[10px]",
          d.result === "W" ? "bg-stat-positive text-background" :
          d.result === "L" ? "bg-stat-negative text-background" :
          "bg-stat-warn text-background"
        )}>{d.result}</span>
        <span className="font-mono">{d.goalsFor}-{d.goalsAgainst}</span>
      </div>
      <p className="text-muted-foreground">Momentum: <span className="font-mono font-bold text-foreground">{d.momentum}</span></p>
      <p className="text-muted-foreground">Shots: {d.shotsFor}-{d.shotsAgainst} · SOT: {d.sotFor}-{d.sotAgainst}</p>
    </div>
  );
};

export const MomentumChart = ({ views, teamName }: Props) => {
  const data = useMemo(() => computeMomentum(views), [views]);

  // Summary stats
  const summary = useMemo(() => {
    const n = views.length;
    if (n === 0) return null;
    const avgGF = views.reduce((s, v) => s + v.goalsFor, 0) / n;
    const avgGA = views.reduce((s, v) => s + v.goalsAgainst, 0) / n;
    const avgShots = views.reduce((s, v) => s + v.shotsFor, 0) / n;
    const avgShotsA = views.reduce((s, v) => s + v.shotsAgainst, 0) / n;
    const avgSOT = views.reduce((s, v) => s + v.shotsOnTargetFor, 0) / n;
    const avgSOTA = views.reduce((s, v) => s + v.shotsOnTargetAgainst, 0) / n;
    const avgCorners = views.reduce((s, v) => s + v.cornersFor, 0) / n;
    const avgCornersA = views.reduce((s, v) => s + v.cornersAgainst, 0) / n;
    const avgFouls = views.reduce((s, v) => s + v.foulsCommitted, 0) / n;
    const avgFoulsDrawn = views.reduce((s, v) => s + v.foulsDrawn, 0) / n;
    return { avgGF, avgGA, avgShots, avgShotsA, avgSOT, avgSOTA, avgCorners, avgCornersA, avgFouls, avgFoulsDrawn };
  }, [views]);

  if (!summary || data.length === 0) return null;

  const lastMomentum = data[data.length - 1].momentum;
  const trendIcon = lastMomentum > 3 ? <TrendingUp className="w-3.5 h-3.5 text-stat-positive" /> :
                    lastMomentum < -3 ? <TrendingDown className="w-3.5 h-3.5 text-stat-negative" /> :
                    <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  const trendLabel = lastMomentum > 5 ? "Hot Streak" :
                     lastMomentum > 2 ? "Rising" :
                     lastMomentum < -5 ? "Crisis" :
                     lastMomentum < -2 ? "Declining" :
                     "Neutral";

  return (
    <div className="stat-card opacity-0 animate-fade-up col-span-full space-y-4" style={{ animationDelay: "550ms" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="stat-label">Momentum & Stats</span>
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
          {trendIcon}
          <span className={cn(
            lastMomentum > 2 ? "text-stat-positive" :
            lastMomentum < -2 ? "text-stat-negative" :
            "text-muted-foreground"
          )}>{trendLabel}</span>
        </div>
      </div>

      {/* Momentum Chart */}
      <div className="h-32 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="momentumGradientPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="momentumGradientNeg" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area
              type="monotone"
              dataKey="momentum"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#momentumGradientPos)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Result dots timeline */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">Oldest</span>
        <div className="flex gap-[3px]">
          {data.map((d, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                d.result === "W" ? "bg-stat-positive" :
                d.result === "L" ? "bg-stat-negative" :
                "bg-stat-warn"
              )}
              title={`${d.opponent}: ${d.goalsFor}-${d.goalsAgainst}`}
            />
          ))}
        </div>
        <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">Latest</span>
      </div>

      {/* Stat Comparison Bars */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-muted-foreground font-semibold px-1">
          <span>{teamName}</span>
          <span>Opponent Avg</span>
        </div>
        <StatBar label="Goals" forVal={summary.avgGF} againstVal={summary.avgGA} icon={<Swords className="w-3 h-3" />} />
        <StatBar label="Shots" forVal={summary.avgShots} againstVal={summary.avgShotsA} icon={<Target className="w-3 h-3" />} />
        <StatBar label="On Target" forVal={summary.avgSOT} againstVal={summary.avgSOTA} icon={<Crosshair className="w-3 h-3" />} />
        <StatBar label="Corners" forVal={summary.avgCorners} againstVal={summary.avgCornersA} icon={<Flag className="w-3 h-3" />} />
        <StatBar label="Fouls" forVal={summary.avgFouls} againstVal={summary.avgFoulsDrawn} icon={<Shield className="w-3 h-3" />} />
      </div>
    </div>
  );
};
