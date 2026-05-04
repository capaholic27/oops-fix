import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/matchStats";
import { getTeamAliases, normalizeTeamName } from "@/lib/teamNormalize";

/**
 * Build a stable dedup key for a match. Uses normalized team names so that
 * "Brighton" vs "Brighton & Hove Albion" collapse into the same fixture.
 */
function matchKey(m: { match_date: string; home_team: string; away_team: string }) {
  return `${m.match_date}|${normalizeTeamName(m.home_team).toLowerCase()}|${normalizeTeamName(m.away_team).toLowerCase()}`;
}

export type Fixture = {
  id: string;
  league_code: string;
  league_name: string;
  match_date: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  referee: string | null;
};

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

      // Deduplicate by (date, normalized home, normalized away).
      const seen = new Set<string>();
      const unique: Match[] = [];
      // Prefer rows with the LONGER name (Fotmob form) when there's a clash.
      const sorted = [...allMatches].sort((a, b) =>
        (b.home_team.length + b.away_team.length) - (a.home_team.length + a.away_team.length)
      );
      for (const m of sorted) {
        const key = matchKey(m);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(m);
      }
      // Re-sort by match_date ascending for consumers that expect that order.
      unique.sort((a, b) => a.match_date.localeCompare(b.match_date));
      return unique;
    },
  });
}

export function useTeamMatches(teamName: string | undefined, leagueCode?: string) {
  return useQuery({
    queryKey: ["team-matches", teamName, leagueCode],
    queryFn: async (): Promise<Match[]> => {
      if (!teamName) return [];

      // Query all aliases for this team name (e.g. "Manchester City" and "Man City")
      const aliases = getTeamAliases(teamName);
      const homeFilter = aliases.map(a => `home_team.eq.${a}`).join(",");
      const awayFilter = aliases.map(a => `away_team.eq.${a}`).join(",");

      let homeQuery = supabase
        .from("matches")
        .select("*")
        .or(homeFilter)
        .order("match_date", { ascending: true });

      let awayQuery = supabase
        .from("matches")
        .select("*")
        .or(awayFilter)
        .order("match_date", { ascending: true });

      if (leagueCode) {
        homeQuery = homeQuery.eq("league_code", leagueCode);
        awayQuery = awayQuery.eq("league_code", leagueCode);
      }

      const [homeRes, awayRes] = await Promise.all([homeQuery, awayQuery]);
      if (homeRes.error) throw homeRes.error;
      if (awayRes.error) throw awayRes.error;

      const all = [...(homeRes.data || []), ...(awayRes.data || [])] as unknown as Match[];
      // Deduplicate by (date, home, away) — same fixture may appear under
      // multiple seasons/league_codes when sources overlap.
      const seen = new Set<string>();
      const unique: Match[] = [];
      for (const m of all) {
        const key = `${m.match_date}|${m.home_team.toLowerCase()}|${m.away_team.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(m);
      }
      return unique.sort((a, b) => a.match_date.localeCompare(b.match_date));
    },
    enabled: !!teamName,
  });
}

export function useFixtures(teamName?: string) {
  return useQuery({
    queryKey: ["fixtures", teamName],
    queryFn: async (): Promise<Fixture[]> => {
      let query = supabase
        .from("fixtures")
        .select("*")
        .order("match_date", { ascending: true });

      if (teamName) {
        const aliases = getTeamAliases(teamName);
        const parts = aliases.flatMap(a => [`home_team.eq.${a}`, `away_team.eq.${a}`]);
        query = query.or(parts.join(","));
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Fixture[];
    },
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

export function useSyncFixtures() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const url = `https://${projectId}.supabase.co/functions/v1/fetch-fixtures`;

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
      queryClient.invalidateQueries({ queryKey: ["fixtures"] });
    },
  });
}

// useSyncApiFootball removed — Fotmob is the sole data source.
// Use useSyncFixtures() instead, which already handles results + fixtures.
