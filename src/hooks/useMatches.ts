import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/matchStats";

export function useMatches(leagueCode?: string) {
  return useQuery({
    queryKey: ["matches", leagueCode],
    queryFn: async (): Promise<Match[]> => {
      let query = supabase
        .from("matches")
        .select("*")
        .order("match_date", { ascending: true });

      if (leagueCode) {
        query = query.eq("league_code", leagueCode);
      }

      // Fetch in batches to overcome 1000 row limit
      const allMatches: Match[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await query.range(from, from + batchSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allMatches.push(...(data as unknown as Match[]));
          from += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allMatches;
    },
  });
}

export function useTeamMatches(teamName: string | undefined, leagueCode?: string) {
  return useQuery({
    queryKey: ["team-matches", teamName, leagueCode],
    queryFn: async (): Promise<Match[]> => {
      if (!teamName) return [];

      let homeQuery = supabase
        .from("matches")
        .select("*")
        .eq("home_team", teamName)
        .order("match_date", { ascending: true });

      let awayQuery = supabase
        .from("matches")
        .select("*")
        .eq("away_team", teamName)
        .order("match_date", { ascending: true });

      if (leagueCode) {
        homeQuery = homeQuery.eq("league_code", leagueCode);
        awayQuery = awayQuery.eq("league_code", leagueCode);
      }

      const [homeRes, awayRes] = await Promise.all([homeQuery, awayQuery]);
      if (homeRes.error) throw homeRes.error;
      if (awayRes.error) throw awayRes.error;

      const all = [...(homeRes.data || []), ...(awayRes.data || [])] as unknown as Match[];
      return all.sort((a, b) => a.match_date.localeCompare(b.match_date));
    },
    enabled: !!teamName,
  });
}

export function useSyncData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params?: { season?: string; league?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.season) searchParams.set("season", params.season);
      if (params?.league) searchParams.set("league", params.league);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/fetch-football-data?${searchParams}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });

      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["team-matches"] });
    },
  });
}
