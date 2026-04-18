import { useMemo, useState } from "react";
import type { TeamMatchView } from "@/lib/matchStats";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
} from "recharts";
import { Trophy, Target, Crosshair, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getSyntheticSquad } from "@/lib/playerNames";
import { useTeamPlayers, type RealPlayer } from "@/hooks/useTeamPlayers";

type Props = {
  views: TeamMatchView[];
  teamName: string;
};

/* ─── Mock per-team top players with multi-stat profiles ───
 * Each value is a 0-100 percentile vs league.
 * Sorted descending by overall (goals + assists + shots/10). */
type PlayerProfile = {
  name: string;
  position: string;
  number?: number | null;
  photoUrl?: string | null;
  goals: number;
  assists: number;
  shots: number;
  // Radar attributes 0-100
  attacking: number;
  creativity: number;
  finishing: number;
  aerial: number;
  defending: number;
  passing: number;
};

/** Convert an API-Football real player into a 0-100 radar profile.
 *  Heuristic — based on per-90 goals, assists, shots, fouls drawn, position. */
function realToProfile(p: RealPlayer): PlayerProfile {
  const apps = Math.max(1, p.appearances || 1);
  const g90 = p.goals / apps;
  const a90 = p.assists / apps;
  const s90 = p.shots / apps;
  const fc90 = p.fouls / apps;
  const pos = (p.position || "").toUpperCase();

  const isFwd = pos.startsWith("ATT") || pos === "F" || pos === "ST";
  const isDef = pos.startsWith("DEF") || pos === "D" || pos === "CB";
  const isMid = pos.startsWith("MID") || pos === "M";
  const isGK = pos.startsWith("GOAL") || pos === "G";

  const clamp = (v: number) => Math.max(15, Math.min(99, Math.round(v)));
  const base = p.rating ? clamp((p.rating - 5) * 18 + 55) : 55;

  return {
    name: p.name,
    position: p.position || "—",
    number: p.number,
    photoUrl: p.photo,
    goals: p.goals,
    assists: p.assists,
    shots: p.shots,
    attacking: clamp(base + g90 * 60 + s90 * 8 + (isFwd ? 8 : 0) - (isDef ? 15 : 0) - (isGK ? 30 : 0)),
    creativity: clamp(base + a90 * 80 + (isMid ? 10 : 0) - (isGK ? 25 : 0)),
    finishing: clamp(base + (s90 > 0 ? (g90 / Math.max(0.1, s90)) * 80 : 0) + g90 * 30 - (isDef ? 20 : 0) - (isGK ? 30 : 0)),
    aerial: clamp(base + (isDef ? 22 : 0) + (isFwd ? 12 : 0) - (isMid ? 6 : 0)),
    defending: clamp(base + fc90 * 30 + (isDef ? 28 : 0) + (isGK ? 25 : 0) - (isFwd ? 18 : 0)),
    passing: clamp(base + a90 * 50 + (isMid ? 18 : 0) + (isDef ? 4 : 0) - (isGK ? 10 : 0)),
  };
}

const PLAYER_PROFILES: Record<string, PlayerProfile[]> = {
  Arsenal: [
    { name: "B. Saka", position: "RW", goals: 14, assists: 9, shots: 72, attacking: 92, creativity: 88, finishing: 80, aerial: 35, defending: 45, passing: 82 },
    { name: "M. Ødegaard", position: "AM", goals: 8, assists: 11, shots: 56, attacking: 78, creativity: 95, finishing: 70, aerial: 30, defending: 40, passing: 94 },
    { name: "K. Havertz", position: "ST", goals: 13, assists: 5, shots: 84, attacking: 85, creativity: 65, finishing: 78, aerial: 82, defending: 50, passing: 72 },
    { name: "D. Rice", position: "DM", goals: 6, assists: 4, shots: 38, attacking: 60, creativity: 70, finishing: 55, aerial: 78, defending: 92, passing: 86 },
    { name: "G. Martinelli", position: "LW", goals: 9, assists: 6, shots: 65, attacking: 84, creativity: 75, finishing: 72, aerial: 40, defending: 38, passing: 70 },
  ],
  Liverpool: [
    { name: "M. Salah", position: "RW", goals: 19, assists: 13, shots: 89, attacking: 96, creativity: 90, finishing: 92, aerial: 38, defending: 35, passing: 82 },
    { name: "L. Díaz", position: "LW", goals: 11, assists: 7, shots: 68, attacking: 86, creativity: 78, finishing: 76, aerial: 45, defending: 42, passing: 74 },
    { name: "D. Núñez", position: "ST", goals: 14, assists: 6, shots: 92, attacking: 88, creativity: 60, finishing: 75, aerial: 78, defending: 40, passing: 65 },
    { name: "C. Gakpo", position: "AM", goals: 8, assists: 9, shots: 58, attacking: 80, creativity: 84, finishing: 72, aerial: 60, defending: 45, passing: 80 },
    { name: "A. Mac Allister", position: "MF", goals: 5, assists: 8, shots: 42, attacking: 70, creativity: 88, finishing: 65, aerial: 55, defending: 78, passing: 92 },
  ],
  "Manchester City": [
    { name: "E. Haaland", position: "ST", goals: 22, assists: 5, shots: 95, attacking: 98, creativity: 60, finishing: 96, aerial: 88, defending: 30, passing: 65 },
    { name: "P. Foden", position: "AM", goals: 12, assists: 8, shots: 70, attacking: 88, creativity: 92, finishing: 82, aerial: 40, defending: 45, passing: 90 },
    { name: "K. De Bruyne", position: "AM", goals: 6, assists: 10, shots: 52, attacking: 80, creativity: 98, finishing: 75, aerial: 50, defending: 50, passing: 96 },
    { name: "B. Silva", position: "MF", goals: 7, assists: 7, shots: 48, attacking: 78, creativity: 90, finishing: 70, aerial: 35, defending: 65, passing: 92 },
    { name: "Rodri", position: "DM", goals: 5, assists: 4, shots: 40, attacking: 60, creativity: 78, finishing: 60, aerial: 80, defending: 96, passing: 94 },
  ],
  "Real Madrid": [
    { name: "Vinícius Jr", position: "LW", goals: 15, assists: 9, shots: 82, attacking: 94, creativity: 88, finishing: 84, aerial: 40, defending: 35, passing: 78 },
    { name: "J. Bellingham", position: "AM", goals: 12, assists: 9, shots: 68, attacking: 88, creativity: 90, finishing: 82, aerial: 70, defending: 60, passing: 88 },
    { name: "Rodrygo", position: "RW", goals: 9, assists: 6, shots: 58, attacking: 82, creativity: 80, finishing: 76, aerial: 42, defending: 40, passing: 78 },
    { name: "F. Valverde", position: "MF", goals: 6, assists: 5, shots: 50, attacking: 75, creativity: 78, finishing: 70, aerial: 70, defending: 82, passing: 86 },
    { name: "L. Modrić", position: "MF", goals: 3, assists: 7, shots: 32, attacking: 65, creativity: 94, finishing: 60, aerial: 45, defending: 70, passing: 96 },
  ],
  Barcelona: [
    { name: "R. Lewandowski", position: "ST", goals: 18, assists: 4, shots: 88, attacking: 94, creativity: 65, finishing: 94, aerial: 82, defending: 30, passing: 70 },
    { name: "L. Yamal", position: "RW", goals: 7, assists: 12, shots: 60, attacking: 86, creativity: 92, finishing: 76, aerial: 30, defending: 40, passing: 84 },
    { name: "Pedri", position: "MF", goals: 4, assists: 8, shots: 38, attacking: 70, creativity: 94, finishing: 65, aerial: 35, defending: 65, passing: 96 },
    { name: "Raphinha", position: "LW", goals: 11, assists: 7, shots: 64, attacking: 84, creativity: 82, finishing: 78, aerial: 45, defending: 42, passing: 78 },
    { name: "F. de Jong", position: "MF", goals: 3, assists: 6, shots: 30, attacking: 68, creativity: 88, finishing: 60, aerial: 50, defending: 78, passing: 94 },
  ],
};

/* Generate fallback profile from team views when team is not in mock list.
 * Uses synthetic but realistic player names + shirt numbers (deterministic per team). */
function generateFallbackPlayers(views: TeamMatchView[], teamName: string): PlayerProfile[] {
  if (views.length === 0) return [];
  const avgGF = views.reduce((s, v) => s + v.goalsFor, 0) / views.length;
  const avgShots = views.reduce((s, v) => s + v.shotsFor, 0) / views.length;
  const positions: { pos: string; mult: number }[] = [
    { pos: "ST", mult: 1.0 },
    { pos: "AM", mult: 0.85 },
    { pos: "RW", mult: 0.78 },
    { pos: "LW", mult: 0.72 },
    { pos: "MF", mult: 0.6 },
    { pos: "DM", mult: 0.55 },
    { pos: "CB", mult: 0.45 },
    { pos: "CB", mult: 0.42 },
    { pos: "RB", mult: 0.5 },
    { pos: "LB", mult: 0.48 },
    { pos: "MF", mult: 0.4 },
    { pos: "GK", mult: 0.25 },
  ];
  const squad = getSyntheticSquad(teamName, positions.length);
  return positions.map((p, i) => ({
    name: squad[i].name,
    number: squad[i].number,
    position: p.pos,
    goals: Math.max(0, Math.round(avgGF * views.length * p.mult * 0.4)),
    assists: Math.max(0, Math.round(avgGF * views.length * p.mult * 0.25)),
    shots: Math.max(0, Math.round(avgShots * views.length * p.mult * 0.15)),
    attacking: Math.max(20, Math.min(95, 60 + i * -3 + Math.round(avgGF * 10))),
    creativity: Math.max(20, Math.min(95, 70 - i * 3)),
    finishing: Math.max(20, Math.min(95, 55 + i * -3 + Math.round(avgGF * 8))),
    aerial: Math.max(20, Math.min(95, 50 + (p.pos === "ST" || p.pos === "CB" ? 25 : -5))),
    defending: Math.max(20, Math.min(95, 35 + (p.pos === "DM" || p.pos === "CB" ? 40 : 0) + i * 2)),
    passing: Math.max(40, Math.min(96, 75 + (p.pos === "MF" || p.pos === "AM" || p.pos === "DM" ? 12 : 0) - i)),
  }));
}

export const MomentumChart = ({ views, teamName }: Props) => {
  const players = useMemo(() => {
    return PLAYER_PROFILES[teamName] ?? generateFallbackPlayers(views, teamName);
  }, [views, teamName]);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const player = players[selectedIdx];

  if (!player) return null;

  const radarData = [
    { attr: "Attack", value: player.attacking },
    { attr: "Creativity", value: player.creativity },
    { attr: "Finishing", value: player.finishing },
    { attr: "Aerial", value: player.aerial },
    { attr: "Defense", value: player.defending },
    { attr: "Passing", value: player.passing },
  ];

  const overall = Math.round(
    (player.attacking + player.creativity + player.finishing + player.aerial + player.defending + player.passing) / 6
  );

  return (
    <section className="space-y-3">
      <div className="stat-card opacity-0 animate-fade-up" style={{ animationDelay: "520ms" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-primary" />
            <span className="stat-label">Squad Profiles</span>
          </div>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            {players.length} players
          </span>
        </div>

        {/* Player selector pills — all squad players, compact, horizontally scrollable */}
        <div className="flex gap-1 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
          {players.map((p, i) => {
            const active = selectedIdx === i;
            return (
              <button
                key={`${p.name}-${i}`}
                onClick={() => setSelectedIdx(i)}
                title={`${p.name}${p.number ? " #" + p.number : ""}`}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full text-[10px] font-semibold transition-all border",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/60 text-muted-foreground border-transparent hover:text-foreground hover:bg-muted"
                )}
              >
                <PlayerAvatar name={p.name} number={p.number} size="xs" />
                <span className="truncate max-w-[80px]">{p.name}</span>
              </button>
            );
          })}
        </div>

        {/* Player header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-2.5">
            <PlayerAvatar name={player.name} number={player.number} size="md" />
            <div>
              <p className="text-base font-bold leading-tight">
                {player.name}
                {typeof player.number === "number" && (
                  <span className="ml-1.5 text-[10px] font-mono text-muted-foreground">#{player.number}</span>
                )}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                {player.position} · Rank #{selectedIdx + 1}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-bold text-primary leading-none">{overall}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">Overall</p>
          </div>
        </div>

        {/* Radar / Hexagon chart */}
        <div className="h-56 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="72%">
              <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <PolarAngleAxis
                dataKey="attr"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontWeight: 600 }}
              />
              <Radar
                name={player.name}
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.45}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-3 gap-2 mt-1 pt-3 border-t border-border">
          <StatPill icon={<Target className="w-3 h-3" />} label="Goals" value={player.goals} />
          <StatPill icon={<Zap className="w-3 h-3" />} label="Assists" value={player.assists} />
          <StatPill icon={<Crosshair className="w-3 h-3" />} label="Shots" value={player.shots} />
        </div>
      </div>
    </section>
  );
};

const StatPill = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="flex flex-col items-center justify-center rounded-lg bg-muted/60 py-2">
    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
      {icon}
      <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
    </div>
    <span className="font-mono text-base font-bold text-foreground leading-none">{value}</span>
  </div>
);
