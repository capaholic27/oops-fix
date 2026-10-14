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
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    // Nudge the server to refresh from Fotmob while someone is watching.
    const ping = () => { if (!document.hidden) supabase.functions.invoke("fetch-live").catch(() => {}); };
    ping();
    const t = setInterval(ping, 60_000);
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
      <div className="px-4 space-y-1.5">
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
  return (
    <div className="flex-shrink-0 border-b border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-stat-negative animate-pulse" />
        <span className="text-[10px] uppercase tracking-wider font-bold">Live now · {data.filter(d => d.status !== "ft").length}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {data.map(m => (
          <button key={m.id} onClick={() => setOpen(m)} className="shrink-0 w-44 rounded-lg border border-border bg-muted/20 p-2 text-left">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span className="truncate max-w-[6.5rem]">{m.league_name}</span>
              <span className={cn("font-bold", m.status === "ft" ? "" : "text-stat-positive")}>{m.status_label ?? "LIVE"}</span>
            </div>
            {[[m.home_team, m.home_goals], [m.away_team, m.away_goals]].map(([t, g]) => (
              <div key={String(t)} className="flex items-center gap-1.5 text-xs">
                <TeamLogo teamName={String(t)} size="sm" />
                <span className="truncate flex-1">{t}</span>
                <span className="font-mono font-bold">{g}</span>
              </div>
            ))}
          </button>
        ))}
      </div>
      {current && <LiveSheet m={current} onClose={() => setOpen(null)} />}
    </div>
  );
};
