import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
};

/**
 * Currently in-play (and recently finished) matches from the `live_matches`
 * table, kept fresh by the `fetch-live` cron (runs every minute). Polled on a
 * short interval so the Games page reflects live scores in real time.
 */
export function useLiveMatches() {
  return useQuery({
    queryKey: ["live-matches"],
    queryFn: async (): Promise<LiveMatch[]> => {
      const { data, error } = await supabase
        .from("live_matches")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LiveMatch[];
    },
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
}
