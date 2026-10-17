import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TeamLogo } from "@/components/TeamLogo";
import { cn } from "@/lib/utils";

type LiveEvent = { type?: string; minuteStr?: string; minute?: number | null; team?: string; isHome?: boolean; player?: string; text?: string };
type LiveRow = {
  id: string; fotmob_match_id: number; league_name: string; home_team: string; away_team: string;
  home_goals: number; away_goals: number; status: string; status_label: string | null; minute: number | null;
  events: LiveEvent[]; stats: Record<string, [number | null, number | null]>;
};

/** Live + just-finished matches, refreshed every 20s and pushed via realtime. */
export function useLiveMatches() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["live-matches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("live_matches").select("*").order("league_name");
      if (error) throw error;
      return (data ?? []) as unknown as LiveRow[];
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
  useEffect(() => {
    // Nudge the server to refresh from Fotmob while someone is watching (like Fotmob's ~20s cadence).
    const ping = () => { if (!document.hidden) supabase.functions.invoke("fetch-live").catch(() => {}); };
    ping();
    const t = setInterval(ping, 20_000);
    const onVis = () => { if (!document.hidden) { ping(); qc.invalidateQueries({ queryKey: ["live-matches"] }); } };
    document.addEventListener("visibilitychange", onVis);
    const ch = supabase.channel("live-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_matches" },
        () => qc.invalidateQueries({ queryKey: ["live-matches"] }))
      .subscribe();
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [qc]);
  return q;
}

const STAT_LABELS: [string, string][] = [
  ["possession", "Possession %"], ["xg", "xG"], ["shots", "Shots"], ["shotsOnTarget", "On target"],
  ["corners", "Corners"], ["fouls", "Fouls"], ["yellows", "Yellow cards"], ["reds", "Red cards"],
];


type LiveTip = { market: string; pick: string; confidence: number; why: string };

/** Rule-based live market ideas from score, minute and in-play stats. */
export function liveMarketTips(m: Pick<LiveRow, "home_team" | "away_team" | "home_goals" | "away_goals" | "minute" | "status" | "stats" | "events">): LiveTip[] {
  if (m.status === "ft") return [];
  const st = m.stats ?? {};
  const g = (k: string): [number, number] => [Number(st[k]?.[0] ?? 0), Number(st[k]?.[1] ?? 0)];
  const min = Math.max(1, Math.min(95, m.minute ?? 45));
  const left = Math.max(0, 90 - min);
  const goals = m.home_goals + m.away_goals;
  const [xgH, xgA] = g("xg"), [sotH, sotA] = g("shotsOnTarget"), [shH, shA] = g("shots");
  const [corH, corA] = g("corners"), [yH, yA] = g("yellows"), [posH] = g("possession");
  const tips: LiveTip[] = [];
  const clamp = (n: number) => Math.round(Math.max(35, Math.min(88, n)));
  // Goal pace: blend shot/xG rate with time left.
  const xgRate = (xgH + xgA) / min, sotRate = (sotH + sotA) / min;
  const expRest = left * Math.max(xgRate, sotRate * 0.3, 0.015);
  const line = goals + 0.5;
  const pOver = 1 - Math.exp(-expRest);
  tips.push(pOver >= 0.5
    ? { market: "Total goals", pick: `Over ${line}`, confidence: clamp(pOver * 100), why: `${(xgH + xgA).toFixed(1)} xG and ${sotH + sotA} shots on target so far — about ${expRest.toFixed(1)} more goals expected.` }
    : { market: "Total goals", pick: `Under ${line + 1}`, confidence: clamp((1 - pOver * 0.6) * 100), why: `Low chance creation (${sotH + sotA} on target) with ${left}' left.` });
  // Next goal: who is dominating.
  const pressH = xgH * 2 + sotH + shH * 0.3 + corH * 0.2, pressA = xgA * 2 + sotA + shA * 0.3 + corA * 0.2;
  if (left > 10 && pressH + pressA > 2) {
    const home = pressH >= pressA, share = Math.max(pressH, pressA) / (pressH + pressA);
    if (share > 0.58) tips.push({ market: "Next goal", pick: home ? m.home_team : m.away_team, confidence: clamp(share * 95), why: `${home ? m.home_team : m.away_team} lead on xG and shots${posH ? ` with ${home ? posH : 100 - posH}% possession` : ""}.` });
  }
  // Losing team pushing.
  const diff = m.home_goals - m.away_goals;
  if (diff !== 0 && left > 15) {
    const trailing = diff > 0 ? m.away_team : m.home_team;
    const tp = diff > 0 ? pressA : pressH, lp = diff > 0 ? pressH : pressA;
    if (tp > lp) tips.push({ market: "Both teams to score", pick: "Yes", confidence: clamp(55 + (tp - lp) * 4), why: `${trailing} are behind but creating more.` });
  }
  if (diff === 0 && goals === 0 && min > 60 && sotH + sotA < 4) tips.push({ market: "Full-time result", pick: "Draw", confidence: clamp(50 + (min - 60)), why: "Goalless and few clear chances late on." });
  // Corners.
  const cor = corH + corA;
  if (min > 15) {
    const proj = cor + (cor / min) * left, cl = Math.floor(proj) - 0.5;
    if (cl > cor) tips.push({ market: "Total corners", pick: `Over ${cl}`, confidence: clamp(50 + (proj - cl) * 12), why: `${cor} corners in ${min}' — on pace for ${proj.toFixed(0)}.` });
  }
  // Cards.
  const cards = yH + yA, [fH, fA] = g("fouls");
  if (min > 20 && (cards / min) * 90 + (fH + fA) / min * 10 > 4.5) tips.push({ market: "Total cards", pick: `Over ${cards + 1.5}`, confidence: clamp(48 + (fH + fA) / 2), why: `${fH + fA} fouls and ${cards} yellows — a heated game.` });
  // Player in form from events.
  const scorers = new Map<string, number>();
  for (const e of m.events ?? []) if (/goal/i.test(e.type ?? "") && e.player) scorers.set(e.player, (scorers.get(e.player) ?? 0) + 1);
  const hot = [...scorers.entries()].sort((a, b) => b[1] - a[1])[0];
  if (hot && left > 15) tips.push({ market: "Anytime scorer", pick: hot[0], confidence: clamp(40 + hot[1] * 10), why: `Already scored ${hot[1]} today and in form.` });
  return tips.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

const LiveMarkets = ({ m }: { m: LiveRow }) => {
  const tips = liveMarketTips(m);
  if (!tips.length) return null;
  return (
    <div className="px-4">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Live bet ideas</p>
      <div className="space-y-1.5">
        {tips.map((t, i) => (
          <div key={i} className="rounded-md border border-border bg-muted/20 px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">{t.market}</span>
              <span className={cn("text-[10px] font-mono font-bold", t.confidence >= 65 ? "text-stat-positive" : "text-foreground")}>{t.confidence}%</span>
            </div>
            <p className="text-xs font-semibold">{t.pick}</p>
            <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{t.why}</p>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-muted-foreground mt-1.5">Based on live stats only — not guaranteed. Bet responsibly.</p>
    </div>
  );
};

const LiveSheet = ({ m, onClose }: { m: LiveRow; onClose: () => void }) => createPortal(
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-xl border border-border bg-card pb-8" onClick={e => e.stopPropagation()}>
      <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.league_name}</span>
        <button onClick={onClose} className="text-xs text-muted-foreground px-2 py-1" aria-label="Close">✕</button>
      </div>
      <div className="flex items-center justify-between px-4 py-5">
        <div className="flex flex-col items-center gap-1 w-24 text-center"><TeamLogo teamName={m.home_team} size="lg" /><span className="text-xs font-semibold">{m.home_team}</span></div>
        <div className="text-center">
          <p className="font-mono text-3xl font-bold">{m.home_goals} – {m.away_goals}</p>
          <p className={cn("text-xs font-bold mt-1", m.status === "ft" ? "text-muted-foreground" : "text-stat-positive animate-pulse")}>{m.status_label ?? "LIVE"}</p>
        </div>
        <div className="flex flex-col items-center gap-1 w-24 text-center"><TeamLogo teamName={m.away_team} size="lg" /><span className="text-xs font-semibold">{m.away_team}</span></div>
      </div>
      <LiveMarkets m={m} />
      <div className="px-4 space-y-1.5 mt-4">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Live stats</p>
        {STAT_LABELS.map(([k, label]) => {
          const v = m.stats?.[k];
          if (!v || (v[0] == null && v[1] == null)) return null;
          const a = Number(v[0] ?? 0), b = Number(v[1] ?? 0), tot = a + b || 1;
          return (
            <div key={k}>
              <div className="flex justify-between text-[11px] font-mono"><span>{a}</span><span className="text-muted-foreground font-sans">{label}</span><span>{b}</span></div>
              <div className="flex h-1 rounded-full overflow-hidden bg-muted"><div className="bg-primary" style={{ width: `${(a / tot) * 100}%` }} /><div className="bg-stat-negative" style={{ width: `${(b / tot) * 100}%` }} /></div>
            </div>
          );
        })}
      </div>
      {m.events?.length > 0 && (
        <div className="px-4 mt-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5">Live feed</p>
          <div className="space-y-1">
            {[...m.events].reverse().map((e, i) => (
              <div key={i} className={cn("flex items-center gap-2 text-[11px] rounded-md bg-muted/20 px-2 py-1.5", e.isHome === false && "flex-row-reverse text-right")}>
                <span className="font-mono text-muted-foreground w-8 shrink-0">{e.minuteStr || e.minute}'</span>
                <span className="font-semibold">{e.type}</span>
                <span className="truncate">{e.player ?? e.text ?? ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  </div>,
  document.body,
);

export const LiveStrip = () => {
  const { data } = useLiveMatches();
  const [open, setOpen] = useState<LiveRow | null>(null);
  const current = open && data?.find(d => d.id === open.id);
  if (!data?.length) return null;
  const liveCount = data.filter(d => d.status !== "ft").length;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-stat-negative animate-pulse" />
        <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">Live · {liveCount}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {data.map(m => (
          <button key={m.id} onClick={() => setOpen(m)} className="shrink-0 w-36 rounded-md border border-border bg-card px-2 py-1.5 text-left active:scale-[0.98] transition-transform">
            {[[m.home_team, m.home_goals], [m.away_team, m.away_goals]].map(([t, g]) => (
              <div key={String(t)} className="flex items-center gap-1 text-[11px] leading-5">
                <TeamLogo teamName={String(t)} size="sm" />
                <span className="truncate flex-1">{t}</span>
                <span className="font-mono font-bold">{g}</span>
              </div>
            ))}
            <p className={cn("text-[9px] font-bold mt-0.5", m.status === "ft" ? "text-muted-foreground" : "text-stat-positive")}>{m.status_label ?? "LIVE"}</p>
          </button>
        ))}
      </div>
      {current && <LiveSheet m={current} onClose={() => setOpen(null)} />}
    </div>
  );
};
