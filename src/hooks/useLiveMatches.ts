import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveEvent = {
  type?: string;
  minuteStr?: string;
  minute?: number | null;
  team?: string;
  isHome?: boolean;
  player?: string;
  text?: string;
};

export type LiveMatch = {
  id: string;
  fotmob_match_id: number;
  league_code: string | null;
  league_name: string;
  home_team: string;
  away_team: string;
  home_goals: number;
  away_goals: number;
  status: string; // "live" | "ht" | "ft"
  status_label: string | null;
  minute: number | null;
  kickoff_at: string | null;
  finished_at: string | null;
  updated_at: string;
  events: LiveEvent[];
  stats: Record<string, [number | null, number | null]>;
};

/**
 * Live + just-finished matches from the `live_matches` table, kept fresh by the
 * `fetch-live` cron. Polled every 10s, pushed instantly via realtime, and
 * nudges the server to refresh from Fotmob while someone is watching.
 */
export function useLiveMatches() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["live-matches"],
    queryFn: async (): Promise<LiveMatch[]> => {
      const { data, error } = await supabase.from("live_matches").select("*").order("league_name");
      if (error) throw error;
      return (data ?? []) as unknown as LiveMatch[];
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
  useEffect(() => {
    // Nudge the server to refresh from Fotmob while someone is watching.
    const ping = () => { if (!document.hidden) supabase.functions.invoke("fetch-live").catch(() => {}); };
    ping();
    const t = setInterval(ping, 20_000);
    const onVis = () => { if (!document.hidden) { ping(); qc.invalidateQueries({ queryKey: ["live-matches"] }); } };
    document.addEventListener("visibilitychange", onVis);
    const ch = supabase.channel("live-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_matches" },
        () => qc.invalidateQueries({ queryKey: ["live-matches"] }))
      .subscribe();
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); supabase.removeChannel(ch); };
  }, [qc]);
  return q;
}
