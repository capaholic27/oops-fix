import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Match } from "@/lib/matchStats";
import { getTeamAliases, uniqueTeamNames } from "@/lib/teamNormalize";
import { matchKey, deduplicateFixtures } from "@/lib/fixtureIdentity";
export { matchKey } from "@/lib/fixtureIdentity";

/**
 * Build a stable dedup key for a match. Uses canonical team names so that
 * "Brighton" / "Brighton & Hove Albion" and "Atletico Madrid" / "Atlético
 * Madrid" collapse into the same fixture.
 */

export type Fixture = {
  id: string;
  league_code: string;
  league_name: string;
  match_date: string;
  match_time: string | null;
  home_team: string;
  away_team: string;
  referee: string | null;
  created_at?: string | null;
};

const MATCHES_STALE_MS = 10 * 60 * 1000;
const PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 8;
/** Slightly wider than the stats recency window so nothing it needs is cut. */
const ALL_MATCHES_WINDOW_DAYS = 420;

export function useMatches(leagueCode?: string) {
  return useQuery({
    queryKey: ["matches", leagueCode],
    staleTime: MATCHES_STALE_MS,
    queryFn: async (): Promise<Match[]> => {
      const cutoffDate = new Date(Date.now() - ALL_MATCHES_WINDOW_DAYS * 86400000);
      const recentCutoff = cutoffDate.toISOString().slice(0, 10);
      const buildQuery = (withCount = false) => {
        let q = supabase
          .from("matches")
          .select("*", withCount ? { count: "estimated" } : undefined)
          .order("match_date", { ascending: true })
          .order("id", { ascending: true });
        // A single competition keeps its full history (e.g. World Cup
        // archive). The all-competitions view only needs recent games, which
        // keeps the first load small and fast.
        if (leagueCode) q = q.eq("league_code", leagueCode);
        else q = q.gte("match_date", recentCutoff);
        return q;
      };

      // First page also tells us roughly how many rows exist, so the rest
      // can be downloaded in parallel instead of one page after another.
      const first = await buildQuery(true).range(0, PAGE_SIZE - 1);
      if (first.error) throw first.error;
      const allMatches: Match[] = [...((first.data ?? []) as unknown as Match[])];

      if ((first.data?.length ?? 0) === PAGE_SIZE) {
        const estimate = Math.max(first.count ?? 0, PAGE_SIZE * 2);
        // Over-fetch a couple of pages in case the estimate is low.
        const pageCount = Math.ceil(estimate / PAGE_SIZE) + 2;
        const offsets: number[] = [];
        for (let p = 1; p < pageCount; p++) offsets.push(p * PAGE_SIZE);

        const pages: Match[][] = new Array(offsets.length);
        let cursor = 0;
        let reachedEnd = false;
        const worker = async () => {
          while (cursor < offsets.length && !reachedEnd) {
            const idx = cursor++;
            const from = offsets[idx];
            let { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
            if (error) {
              // One slow page (this backend times out on deep offsets) used to
              // reject the whole load, leaving the screen on its spinner for
              // good. Retry that page once; if it still fails, stop paging and
              // keep the pages that did arrive so the app can still render.
              ({ data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1));
              if (error) {
                reachedEnd = true;
                return;
              }
            }
            pages[idx] = (data ?? []) as unknown as Match[];
            if ((data?.length ?? 0) < PAGE_SIZE) reachedEnd = true;
          }
        };
        await Promise.all(Array.from({ length: PAGE_CONCURRENCY }, worker));
        for (const pg of pages) if (pg) allMatches.push(...pg);

        // Estimate was too low and every page was full: fetch the remainder.
        let from = offsets.length ? offsets[offsets.length - 1] + PAGE_SIZE : PAGE_SIZE;
        let last = pages[pages.length - 1];
        while (!reachedEnd && last && last.length === PAGE_SIZE) {
          const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          last = (data ?? []) as unknown as Match[];
          allMatches.push(...last);
          from += PAGE_SIZE;
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

/**
 * Competitions that should always show up in a team's recent form, no matter
 * which league is currently selected: cups, continental and national-team
 * competitions plus friendlies.
 */
export const ALWAYS_INCLUDE_CODES = new Set([
  "CFR", "INTL", "WCQ",
  // Domestic cups
  "ENGLC", "ENGFA", "ENGCS", "ESPCR", "ESPSC", "ITACI", "ITASC",
  "GERDP", "FRACF", "FRASC", "PORCUP", "TURCUP", "SCOCUP",
  "BRACUP", "USACUP", "LGSCUP",
  // Continental club competitions
  "UCL", "UEL", "UECL", "USC",
  "AFCCL", "AFCCL2", "CAFCL", "CCC", "LIB", "SUD", "FIC", "CWC",
  // National-team competitions
  "WC", "EURO", "COPA", "AFCON", "ASCUP", "GOLD", "UNL", "CNL", "EUROQ",
]);

export function useTeamMatches(teamName: string | undefined, leagueCode?: string) {
  return useQuery({
    queryKey: ["team-matches", teamName, leagueCode],
    staleTime: MATCHES_STALE_MS,
    queryFn: async (): Promise<Match[]> => {
      if (!teamName) return [];

      // Query all aliases for this team name (e.g. "Manchester City" and "Man City")
      const aliases = getTeamAliases(teamName);
      const homeFilter = aliases.map(a => `home_team.eq.${a}`).join(",");
      const awayFilter = aliases.map(a => `away_team.eq.${a}`).join(",");

      const homeQuery = supabase
        .from("matches")
        .select("*")
        .or(homeFilter)
        .order("match_date", { ascending: true });

      const awayQuery = supabase
        .from("matches")
        .select("*")
        .or(awayFilter)
        .order("match_date", { ascending: true });

      const [homeRes, awayRes] = await Promise.all([homeQuery, awayQuery]);
      if (homeRes.error) throw homeRes.error;
      if (awayRes.error) throw awayRes.error;

      let all = [...(homeRes.data || []), ...(awayRes.data || [])] as unknown as Match[];
      // League filtering happens client-side so friendlies / international
      // games are always part of the picture.
      if (leagueCode) {
        all = all.filter(
          (m) => m.league_code === leagueCode || ALWAYS_INCLUDE_CODES.has(m.league_code)
        );
      }

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
    staleTime: MATCHES_STALE_MS,
    queryFn: async (): Promise<Fixture[]> => {
      const buildQuery = () => {
        let query = supabase
        .from("fixtures")
        .select("*")
        .gte("match_date", new Date(Date.now() - 86400000).toISOString().slice(0, 10))
        .order("match_date", { ascending: true })
        .order("id", { ascending: true });

      if (teamName) {
        const aliases = getTeamAliases(teamName);
        const parts = aliases.flatMap(a => [`home_team.eq.${a}`, `away_team.eq.${a}`]);
        query = query.or(parts.join(","));
      }
        return query;
      };
      const rows: Fixture[] = [];
      // Never silently truncate at the database's 1,000-row response limit.
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as Fixture[]));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
      return deduplicateFixtures(rows);
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

/**
 * Competition groups used when refreshing. The full list is too large for one
 * request, so it is split into chunks that each finish comfortably.
 */
export const SYNC_LEAGUE_GROUPS: string[][] = [
  ["E0", "E1", "SP1", "D1"],
  ["I1", "I2", "F1", "N1", "P1"],
  ["T1", "SC0", "SP2", "D2", "B1", "G1"],
  ["SUI1", "DEN1", "NOR1", "SWE1", "AUS1"],
  ["MLS", "MEX1", "BRA1", "ARG1", "KSA1", "JPN1", "KOR1"],
  ["ENGLC", "ENGFA", "ENGCS", "ESPCR", "ESPSC", "ITACI", "ITASC"],
  ["GERDP", "FRACF", "FRASC", "PORCUP", "TURCUP", "SCOCUP"],
  ["BRACUP", "USACUP", "LGSCUP"],
  ["UCL", "UEL", "UECL", "USC"],
  ["AFCCL", "AFCCL2", "CAFCL", "CCC", "LIB", "SUD", "FIC"],
  ["WC", "EURO", "COPA", "AFCON", "ASCUP", "GOLD", "CWC"],
  ["UNL", "CNL", "EUROQ", "WCQ"],
  ["CFR", "INTL"],
];

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

      const settled = await Promise.allSettled(
        SYNC_LEAGUE_GROUPS.map((leagues) =>
          fetch(`${base}/fetch-fixtures`, {
            method: "POST",
            headers,
            body: JSON.stringify({ force: true, leagues }),
          })
        )
      );
      const ok = settled.filter((s) => s.status === "fulfilled" && s.value.ok).length;
      if (ok === 0) throw new Error("Sync failed");
      const out = { success: true, groups: ok };


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

/** One roster for every search: Fotmob tables + scheduled teams + results. */
export function useTeamCatalog() {
  const { data: standings = [] } = useStandings();
  const { data: fixtures = [] } = useFixtures();
  const { data: matches = [] } = useMatches();
  return uniqueTeamNames([
    ...standings.flatMap(s => s.rows.map(r => r.name)),
    ...fixtures.flatMap(f => [f.home_team, f.away_team]),
    ...matches.flatMap(m => [m.home_team, m.away_team]),
  ]);
}


// useSyncApiFootball removed — Fotmob is the sole data source.
// Use useSyncFixtures() instead, which already handles results + fixtures.

/* ------------------------------------------------------------------ *
 * Automatic background sync
 *
 * Primary refresh happens server-side on a schedule (database cron jobs
 * hitting the fetch-* functions), so data stays current even when nobody
 * has the app open. This hook is the client-side safety net: if the data
 * a user loads is older than the freshness threshold — e.g. the scheduled
 * run was missed — it quietly triggers one sync per session.
 *
 * It never blocks rendering and shows no toasts.
 * ------------------------------------------------------------------ */

const AUTO_SYNC_STALE_MS = 20 * 60 * 1000; // 20 min — fixtures job runs every 15
const AUTO_SYNC_SESSION_KEY = "fe:lastAutoSync";
let autoSyncAttempted = false;

export function useAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (autoSyncAttempted) return;
    autoSyncAttempted = true;

    // Don't re-check within the same session window.
    try {
      const last = Number(sessionStorage.getItem(AUTO_SYNC_SESSION_KEY) ?? 0);
      if (last && Date.now() - last < AUTO_SYNC_STALE_MS) return;
    } catch {
      /* sessionStorage unavailable — proceed */
    }

    (async () => {
      // Let the first screen load before starting any heavy refresh work.
      await new Promise((r) => setTimeout(r, 20000));
      try {
        // Newest fixture row tells us when the last successful sync landed.
        const [fixtureRes, standingsRes] = await Promise.all([
          supabase
            .from("fixtures")
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("standings")
            .select("fetched_at")
            .order("fetched_at", { ascending: false })
            .limit(1),
        ]);

        const newestFixture = fixtureRes.data?.[0]?.created_at
          ? new Date(fixtureRes.data[0].created_at as string).getTime()
          : 0;
        const newestStanding = standingsRes.data?.[0]?.fetched_at
          ? new Date(standingsRes.data[0].fetched_at as string).getTime()
          : 0;

        const newest = Math.max(newestFixture, newestStanding);
        const stale = !newest || Date.now() - newest > AUTO_SYNC_STALE_MS;
        if (!stale) return;

        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        };
        const base = `https://${projectId}.supabase.co/functions/v1`;

        await Promise.allSettled([
          ...SYNC_LEAGUE_GROUPS.map((leagues) =>
            fetch(`${base}/fetch-fixtures`, {
              method: "POST",
              headers,
              body: JSON.stringify({ force: true, leagues }),
            })
          ),
          fetch(`${base}/fetch-standings`, {
            method: "POST",
            headers,
            body: JSON.stringify({}),
          }),
        ]);


        try {
          sessionStorage.setItem(AUTO_SYNC_SESSION_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }

        queryClient.invalidateQueries({ queryKey: ["fixtures"] });
        queryClient.invalidateQueries({ queryKey: ["matches"] });
        queryClient.invalidateQueries({ queryKey: ["standings"] });
      } catch (e) {
        // Non-fatal: the scheduled server-side jobs remain the primary path.
        console.warn("auto-sync skipped", e);
      }
    })();
  }, [queryClient]);
}

/** Schedule of the automatic server-side refresh jobs (for display). */
export type SyncJob = {
  job_name: string;
  label: string;
  schedule: string;
  target_function: string;
  enabled: boolean;
};

export function useSyncJobs() {
  return useQuery({
    queryKey: ["sync-jobs"],
    queryFn: async (): Promise<SyncJob[]> => {
      const { data, error } = await supabase
        .from("sync_jobs")
        .select("job_name, label, schedule, target_function, enabled")
        .eq("enabled", true)
        .order("label");
      if (error) throw error;
      return (data ?? []) as unknown as SyncJob[];
    },
    staleTime: 60 * 60 * 1000,
  });
}

