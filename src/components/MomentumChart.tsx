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
  momentum: number;
  goalsFor: number;
  goalsAgainst: number;
  result: "W" | "D" | "L";
  shotsFor: number;
  shotsAgainst: number;
  sotFor: number;
  sotAgainst: number;
};

function computeMomentum(views: TeamMatchView[]): MomentumPoint[] {
  let momentum = 0;
  return views.map((v, i) => {
    const resultScore = v.result === "W" ? 3 : v.result === "L" ? -3 : 0;
    const gdBonus = Math.max(-2, Math.min(2, (v.goalsFor - v.goalsAgainst) * 0.5));
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
    };
  });
}

/* ── Stat comparison bar ── */
const StatBar = ({ label, forVal, againstVal, icon }: { label: string; forVal: number; againstVal: number; icon: React.ReactNode }) => {
  const total = forVal + againstVal;
  const pct = total > 0 ? (forVal / total) * 100 : 50;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[9px]">
        <span className="font-mono font-bold text-primary">{forVal.toFixed(1)}</span>
        <div className="flex items-center gap-1 text-muted-foreground">
          {icon}
          <span className="text-[8px] uppercase tracking-wider font-semibold">{label}</span>
        </div>
        <span className="font-mono font-bold text-muted-foreground">{againstVal.toFixed(1)}</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-l-full transition-all duration-700" style={{ width: `${pct}%`, background: "hsl(var(--primary))" }} />
        <div className="h-full rounded-r-full transition-all duration-700 opacity-40" style={{ width: `${100 - pct}%`, background: "hsl(var(--destructive, 0 84% 60%))" }} />
      </div>
    </div>
  );
};

/* ── Tooltip ── */
const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as MomentumPoint;
  return (
    <div className="border border-border bg-card/95 backdrop-blur-sm p-2 rounded-md shadow-lg text-xs space-y-1">
      <p className="font-bold">{d.opponent}</p>
      <div className="flex items-center gap-2">
        <span className={cn(
          "px-1 py-px rounded text-[9px] font-bold",
          d.result === "W" ? "bg-stat-positive/20 text-stat-positive" :
          d.result === "L" ? "bg-stat-negative/20 text-stat-negative" :
          "bg-stat-warn/20 text-stat-warn"
        )}>{d.result}</span>
        <span className="font-mono">{d.goalsFor}–{d.goalsAgainst}</span>
      </div>
      <p className="text-muted-foreground">Momentum: <span className="font-mono font-bold text-foreground">{d.momentum}</span></p>
    </div>
  );
};

export const MomentumChart = ({ views, teamName }: Props) => {
  const data = useMemo(() => computeMomentum(views), [views]);

  const summary = useMemo(() => {
    const n = views.length;
    if (n === 0) return null;
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / n;
    return {
      avgGF: avg(views.map(v => v.goalsFor)),
      avgGA: avg(views.map(v => v.goalsAgainst)),
      avgShots: avg(views.map(v => v.shotsFor)),
      avgShotsA: avg(views.map(v => v.shotsAgainst)),
      avgSOT: avg(views.map(v => v.shotsOnTargetFor)),
      avgSOTA: avg(views.map(v => v.shotsOnTargetAgainst)),
      avgCorners: avg(views.map(v => v.cornersFor)),
      avgCornersA: avg(views.map(v => v.cornersAgainst)),
      avgFouls: avg(views.map(v => v.foulsCommitted)),
      avgFoulsDrawn: avg(views.map(v => v.foulsDrawn)),
    };
  }, [views]);

  if (!summary || data.length === 0) return null;

  const lastMomentum = data[data.length - 1].momentum;
  const trendIcon = lastMomentum > 3 ? <TrendingUp className="w-3 h-3" /> :
                    lastMomentum < -3 ? <TrendingDown className="w-3 h-3" /> :
                    <Minus className="w-3 h-3" />;
  const trendLabel = lastMomentum > 5 ? "Hot Streak" :
                     lastMomentum > 2 ? "Rising" :
                     lastMomentum < -5 ? "Crisis" :
                     lastMomentum < -2 ? "Declining" : "Neutral";
  const trendColor = lastMomentum > 2 ? "text-stat-positive" :
                     lastMomentum < -2 ? "text-stat-negative" : "text-muted-foreground";

  return (
    <section className="space-y-3">
      {/* ── Momentum Trend ── */}
      <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "520ms" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="stat-label">Momentum</span>
          <div className={cn("flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider", trendColor)}>
            {trendIcon}
            <span>{trendLabel}</span>
          </div>
        </div>

        <div className="h-28 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="momGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
              <Area type="monotone" dataKey="momentum" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#momGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Result dots */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[7px] uppercase tracking-wider text-muted-foreground">Oldest</span>
          <div className="flex gap-[2px]">
            {data.map((d, i) => (
              <div key={i} className={cn(
                "w-1.5 h-1.5 rounded-full",
                d.result === "W" ? "bg-stat-positive" : d.result === "L" ? "bg-stat-negative" : "bg-stat-warn"
              )} title={`${d.opponent}: ${d.goalsFor}-${d.goalsAgainst}`} />
            ))}
          </div>
          <span className="text-[7px] uppercase tracking-wider text-muted-foreground">Latest</span>
        </div>
      </div>

      {/* ── Averages Comparison ── */}
      <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "560ms" }}>
        <div className="flex items-center justify-between mb-2.5">
          <span className="stat-label">Avg per Game</span>
          <div className="flex gap-3 text-[7px] uppercase tracking-wider text-muted-foreground font-semibold">
            <span className="text-primary">{teamName}</span>
            <span>vs Opp</span>
          </div>
        </div>
        <div className="space-y-2.5">
          <StatBar label="Goals" forVal={summary.avgGF} againstVal={summary.avgGA} icon={<Swords className="w-2.5 h-2.5" />} />
          <StatBar label="Shots" forVal={summary.avgShots} againstVal={summary.avgShotsA} icon={<Target className="w-2.5 h-2.5" />} />
          <StatBar label="On Target" forVal={summary.avgSOT} againstVal={summary.avgSOTA} icon={<Crosshair className="w-2.5 h-2.5" />} />
          <StatBar label="Corners" forVal={summary.avgCorners} againstVal={summary.avgCornersA} icon={<Flag className="w-2.5 h-2.5" />} />
          <StatBar label="Fouls" forVal={summary.avgFouls} againstVal={summary.avgFoulsDrawn} icon={<Shield className="w-2.5 h-2.5" />} />
        </div>
      </div>
    </section>
  );
};
