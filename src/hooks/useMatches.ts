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
      // Deduplicate by (date, normalized home, normalized away) — collapses
      // alias variants (e.g. "Brighton" / "Brighton & Hove Albion").
      const seen = new Set<string>();
      const unique: Match[] = [];
      const sorted = [...all].sort((a, b) =>
        (b.home_team.length + b.away_team.length) - (a.home_team.length + a.away_team.length)
      );
      for (const m of sorted) {
        const key = matchKey(m);
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
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      };
      const base = `https://${projectId}.supabase.co/functions/v1`;

      const res = await fetch(`${base}/fetch-fixtures`, { method: "POST", headers });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      const out = await res.json();

      // Fire-and-forget: refresh official league tables (promoted/relegated
      // teams, live positions) and backfill major tournament history.
      // Both are idempotent.
      try {
        await Promise.allSettled([
          fetch(`${base}/fetch-standings`, { method: "POST", headers, body: JSON.stringify({}) }),
          fetch(`${base}/fetch-wc-history`, { method: "POST", headers, body: JSON.stringify({}) }),
        ]);
      } catch (e) {
        console.warn("Post-sync refresh failed (non-fatal)", e);
      }

      return out;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fixtures"] });
      queryClient.invalidateQueries({ queryKey: ["matches"] });
      queryClient.invalidateQueries({ queryKey: ["standings"] });
    },
  });
}

export type StandingsTeam = {
  position: number;
  team_id: number;
  name: string;
  logo: string;
  played: number;
  points: number;
};

export type LeagueStandings = {
  league_code: string;
  league_name: string;
  season: string | null;
  rows: StandingsTeam[];
  fetched_at: string;
};

const STANDINGS_STALE_MS = 6 * 60 * 60 * 1000; // matches edge-function cache TTL
let standingsRefreshInFlight = false;

/**
 * Official current-season standings for every league. This is the
 * authoritative roster: when a new season starts, promoted teams appear and
 * relegated teams disappear as soon as the source table updates.
 */
export function useStandings() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["standings"],
    queryFn: async (): Promise<LeagueStandings[]> => {
      const { data, error } = await supabase
        .from("standings")
        .select("league_code, league_name, season, rows, fetched_at");
      if (error) throw error;
      const rows = (data ?? []) as unknown as LeagueStandings[];

      // If any table is stale (or missing), trigger a background refresh so a
      // new season's promoted/relegated teams are picked up automatically.
      const stale = rows.length === 0 || rows.some(
        (r) => Date.now() - new Date(r.fetched_at).getTime() > STANDINGS_STALE_MS
      );
      if (stale && !standingsRefreshInFlight) {
        standingsRefreshInFlight = true;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        fetch(`https://${projectId}.supabase.co/functions/v1/fetch-standings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({}),
        })
          .then(() => queryClient.invalidateQueries({ queryKey: ["standings"] }))
          .catch((e) => console.warn("standings auto-refresh failed", e))
          .finally(() => { standingsRefreshInFlight = false; });
      }

      return rows;
    },
    staleTime: STANDINGS_STALE_MS,
  });
}


// useSyncApiFootball removed — Fotmob is the sole data source.
// Use useSyncFixtures() instead, which already handles results + fixtures.
