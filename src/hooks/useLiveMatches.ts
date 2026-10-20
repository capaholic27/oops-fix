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

type LiveListener = () => void;

/**
 * Shared realtime subscription for `live_matches`. Supabase dedupes channels by
 * topic, so two concurrent `useLiveMatches` mounts would otherwise collide —
 * the second `.on()` after the first `.subscribe()` throws. Ref-count instead:
 * one channel for all listeners, with a unique topic per generation so a
 * channel being torn down never collides with its replacement.
 */
const liveListeners = new Set<LiveListener>();
let liveChannel: ReturnType<typeof supabase.channel> | null = null;
let liveChannelSeq = 0;

function ensureLiveChannel() {
  if (liveChannel) return;
  liveChannel = supabase.channel(`live-matches-${++liveChannelSeq}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "live_matches" },
      () => liveListeners.forEach((l) => l()))
    .subscribe();
}

function releaseLiveChannel() {
  if (!liveChannel) return;
  const ch = liveChannel;
  liveChannel = null;
  supabase.removeChannel(ch);
}

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
    const listener = () => qc.invalidateQueries({ queryKey: ["live-matches"] });
    liveListeners.add(listener);
    ensureLiveChannel();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      liveListeners.delete(listener);
      if (liveListeners.size === 0) releaseLiveChannel();
    };
  }, [qc]);
  return q;
}
