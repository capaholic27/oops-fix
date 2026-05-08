import { createPortal } from "react-dom";
import { useEffect } from "react";
import { X, TrendingUp, Target, Shield, Zap, Brain, BarChart3 } from "lucide-react";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";

export type PlayerInsightProfile = {
  name: string;
  position: string;
  number?: number | null;
  photoUrl?: string | null;
  goals: number;
  assists: number;
  shots: number;
  attacking: number;
  creativity: number;
  finishing: number;
  aerial: number;
  defending: number;
  passing: number;
};

type Props = { player: PlayerInsightProfile | null; teamName: string; onClose: () => void };

function classify(p: PlayerInsightProfile) {
  const pos = (p.position || "").toUpperCase();
  const isGK = /GK|GOAL/.test(pos);
  const isDef = !isGK && /DEF|CB|RB|LB|WB/.test(pos);
  const isFwd = !isGK && !isDef && /ST|CF|LW|RW|FWD|ATT|FOR/.test(pos);
  const isMid = !isGK && !isDef && !isFwd;
  return { isGK, isDef, isFwd, isMid };
}

function topAttributes(p: PlayerInsightProfile) {
  const arr: { key: string; label: string; v: number }[] = [
    { key: "attacking", label: "Attacking threat", v: p.attacking },
    { key: "creativity", label: "Creativity", v: p.creativity },
    { key: "finishing", label: "Finishing", v: p.finishing },
    { key: "aerial", label: "Aerial duels", v: p.aerial },
    { key: "defending", label: "Defending", v: p.defending },
    { key: "passing", label: "Passing", v: p.passing },
  ];
  return arr.sort((a, b) => b.v - a.v);
}

function buildDescription(p: PlayerInsightProfile) {
  const c = classify(p);
  const top = topAttributes(p);
  const role = c.isGK
    ? "shot-stopper anchoring the back line"
    : c.isDef
    ? "defender focused on duels and structure"
    : c.isMid
    ? "midfielder linking play through the thirds"
    : "forward leading the attacking line";
  const strength = top[0].label.toLowerCase();
  const second = top[1].label.toLowerCase();
  const tier = top[0].v >= 85 ? "elite" : top[0].v >= 70 ? "high-level" : top[0].v >= 55 ? "reliable" : "developing";
  return `${p.name} is a ${tier} ${role}. Stands out for ${strength}, with ${second} as a clear secondary weapon.`;
}

function buildBetMarkets(p: PlayerInsightProfile) {
  const c = classify(p);
  const out: { market: string; reason: string; confidence: number }[] = [];

  if (c.isFwd || (c.isMid && p.finishing >= 70)) {
    const conf = Math.min(95, 35 + Math.round(p.finishing * 0.5) + Math.min(20, p.goals * 2));
    out.push({
      market: "Anytime goalscorer",
      reason: `Finishing ${p.finishing}/100 · ${p.goals} goals so far`,
      confidence: conf,
    });
    if (p.shots >= 30 || p.attacking >= 80) {
      out.push({
        market: "2+ shots on target",
        reason: `Shot volume strong (${p.shots} attempts)`,
        confidence: Math.min(90, 45 + Math.round(p.attacking * 0.4)),
      });
    }
  }

  if (p.creativity >= 70 || p.assists >= 4) {
    out.push({
      market: "To assist",
      reason: `Creativity ${p.creativity}/100 · ${p.assists} assists`,
      confidence: Math.min(85, 30 + Math.round(p.creativity * 0.45) + p.assists * 2),
    });
  }

  if (c.isDef || c.isMid) {
    const cardConf = Math.min(80, 25 + Math.round((100 - p.passing) * 0.4) + Math.round(p.defending * 0.3));
    out.push({
      market: "To be carded",
      reason: c.isDef ? "Defensive duels increase booking risk" : "Midfield engagement leads to fouls",
      confidence: cardConf,
    });
  }

  if (c.isFwd && p.aerial >= 70) {
    out.push({
      market: "Header on goal",
      reason: `Aerial dominance ${p.aerial}/100`,
      confidence: Math.min(80, 40 + Math.round(p.aerial * 0.35)),
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 4);
}

function buildMentality(p: PlayerInsightProfile) {
  const c = classify(p);
  const drive = Math.round((p.attacking + p.finishing) / 2);
  const grit = Math.round((p.defending + p.aerial) / 2);
  if (c.isFwd && drive >= 80) return { label: "Killer Instinct", desc: "Hunts every chance — thrives on volume." };
  if (c.isFwd) return { label: "Patient Predator", desc: "Picks moments, finishes when service arrives." };
  if (c.isMid && p.creativity >= 80) return { label: "Conductor", desc: "Wants the ball, dictates tempo, takes risks." };
  if (c.isMid) return { label: "Box-to-Box Engine", desc: "Covers ground, balances attack and defense." };
  if (c.isDef && grit >= 75) return { label: "Warrior", desc: "Aggressive, wins duels, sets the tone at the back." };
  if (c.isDef) return { label: "Composed Reader", desc: "Positionally smart, prefers interceptions to tackles." };
  return { label: "Last Wall", desc: "Calm presence, organises the line, commands the area." };
}

export const PlayerInsightSheet = ({ player, teamName, onClose }: Props) => {
  useEffect(() => {
    if (!player) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [player]);

  if (!player) return null;

  const top = topAttributes(player);
  const overall = Math.round(top.reduce((s, a) => s + a.v, 0) / top.length);
  const desc = buildDescription(player);
  const markets = buildBetMarkets(player);
  const mentality = buildMentality(player);

  const sheet = (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto bg-card border-t border-border rounded-t-2xl shadow-2xl animate-slide-up"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/95 backdrop-blur z-10 flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <PlayerAvatar name={player.name} number={player.number ?? undefined} photoUrl={player.photoUrl} size="lg" />
            <div>
              <p className="text-base font-bold leading-tight">{player.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider">
                {player.position} · {teamName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Overall + mentality */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col items-center justify-center">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Overall</span>
              <span className="font-mono text-3xl font-bold text-primary">{overall}</span>
            </div>
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain className="w-3 h-3 text-primary" />
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">Mentality</span>
              </div>
              <p className="text-sm font-bold leading-tight">{mentality.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{mentality.desc}</p>
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Target className="w-3 h-3 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Player profile</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/90">{desc}</p>
          </div>

          {/* Strengths */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <TrendingUp className="w-3 h-3 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Top strengths</span>
            </div>
            <div className="space-y-1.5">
              {top.slice(0, 3).map(a => (
                <div key={a.key} className="flex items-center gap-2">
                  <span className="text-[11px] font-medium w-24 flex-shrink-0">{a.label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${a.v}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-bold w-8 text-right">{a.v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bet markets */}
          {markets.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <BarChart3 className="w-3 h-3 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Smart bet markets</span>
              </div>
              <div className="space-y-2">
                {markets.map(m => {
                  const tier = m.confidence >= 75 ? "high" : m.confidence >= 55 ? "med" : "low";
                  return (
                    <div key={m.market} className="rounded-lg border border-border bg-card p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-bold">{m.market}</p>
                        <span
                          className={cn(
                            "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider",
                            tier === "high" && "bg-primary/15 text-primary",
                            tier === "med" && "bg-amber-500/15 text-amber-500",
                            tier === "low" && "bg-muted text-muted-foreground"
                          )}
                        >
                          {m.confidence}% conf
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-tight">{m.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            <Stat icon={<Target className="w-3 h-3" />} label="Goals" value={player.goals} />
            <Stat icon={<Zap className="w-3 h-3" />} label="Assists" value={player.assists} />
            <Stat icon={<Shield className="w-3 h-3" />} label="Shots" value={player.shots} />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="flex flex-col items-center justify-center rounded-lg bg-muted/60 py-2">
    <div className="flex items-center gap-1 text-muted-foreground mb-0.5">
      {icon}
      <span className="text-[9px] uppercase tracking-wider font-semibold">{label}</span>
    </div>
    <span className="font-mono text-base font-bold text-foreground leading-none">{value}</span>
  </div>
);
