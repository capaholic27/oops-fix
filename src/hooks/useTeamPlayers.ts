import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RealPlayer = {
  name: string;
  fullName: string;
  photo: string | null;
  number: number | null;
  position: string | null;
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  fouls: number;
  foulsDrawn: number;
  yellow: number;
  red: number;
  appearances: number;
  rating: number | null;
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Returns the real squad for a team (or [] if unavailable, so caller can fall back). */
export function useTeamPlayers(teamName: string | undefined) {
  return useQuery({
    queryKey: ["team-players", teamName],
    enabled: !!teamName,
    staleTime: CACHE_TTL_MS,
    gcTime: CACHE_TTL_MS,
    queryFn: async (): Promise<RealPlayer[]> => {
      if (!teamName) return [];

      // 1) Read DB cache first (fast path)
      const { data: cached } = await supabase
        .from("team_players")
        .select("players, fetched_at")
        .eq("team_name", teamName)
        .maybeSingle();

      const fresh = cached && (Date.now() - new Date(cached.fetched_at).getTime()) < CACHE_TTL_MS;
      if (fresh && Array.isArray(cached!.players) && (cached!.players as any[]).length > 0) {
        return cached!.players as unknown as RealPlayer[];
      }

      // 2) Otherwise hit edge function (which writes the cache)
      const { data, error } = await supabase.functions.invoke("fetch-team-players", {
        body: { team: teamName },
      });
      if (error) {
        console.warn("fetch-team-players failed", error);
        // Fall back to whatever stale cache we have
        return (cached?.players as unknown as RealPlayer[]) ?? [];
      }
      return (data?.players as RealPlayer[]) ?? [];
    },
  });
}
