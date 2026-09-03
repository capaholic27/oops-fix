import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Match } from "@/lib/matchStats";
import { normalizeTeamName } from "@/lib/teamNormalize";

/**
 * Fetches finished results from competitions that are NOT synced into the
 * Supabase `matches` table by the deployed edge function — specifically
 * international friendlies (INTL) and club friendlies (FRLY).
 *
 * Fotmob's public league endpoint returns these in a single call per league
 * and allows CORS, so we can fetch them client-side and merge with the DB
 * matches to show every game a team has played across all competitions.
 */

const FOTMOB_EXTRA_LEAGUES = [
  { id: 114, code: "INTL", name: "International" },
  { id: 489, code: "FRLY", name: "Friendlies" },
];

async function fetchFotmobLeagueResults(
  leagueId: number,
  code: string,
  name: string
): Promise<Match[]> {
  const res = await fetch(
    `https://www.fotmob.com/api/data/leagues?id=${leagueId}`,
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const matches: any[] = data?.fixtures?.allMatches ?? [];
  const results: Match[] = [];
  for (const m of matches) {
    if (!m?.status?.finished) continue;
    const utc: string | undefined = m?.status?.utcTime;
    if (!utc) continue;
    const d = new Date(utc);
    if (isNaN(d.getTime())) continue;
    if (m?.status?.cancelled) continue;
    const home = m?.home?.name?.trim();
    const away = m?.away?.name?.trim();
    if (!home || !away) continue;
    const score: string = m?.status?.scoreStr ?? "";
    const parts = score.split(/[-–:]/).map((s: string) => s.trim());
    const hg = Number(parts[0]);
    const ag = Number(parts[1]);
    if (!Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const yr = d.getUTCFullYear();
    const season = `${String(yr % 100).padStart(2, "0")}${String((yr + 1) % 100).padStart(2, "0")}`;
    results.push({
      id: `${code}-${m.id}`,
      league_code: code,
      league_name: name,
      season,
      match_date: d.toISOString().slice(0, 10),
      home_team: home,
      away_team: away,
      ft_home_goals: hg,
      ft_away_goals: ag,
      ft_result: hg > ag ? "H" : hg < ag ? "A" : "D",
      ht_home_goals: 0,
      ht_away_goals: 0,
      ht_result: "D",
      home_shots: 0,
      away_shots: 0,
      home_shots_target: 0,
      away_shots_target: 0,
      home_fouls: 0,
      away_fouls: 0,
      home_corners: 0,
      away_corners: 0,
      home_yellows: 0,
      away_yellows: 0,
      home_reds: 0,
      away_reds: 0,
      referee: null,
    });
  }
  return results;
}

/** All finished results from INTL + FRLY (cached for 6 hours). */
function useAllExtraResults() {
  return useQuery({
    queryKey: ["extra-results"],
    queryFn: async (): Promise<Match[]> => {
      const all = await Promise.all(
        FOTMOB_EXTRA_LEAGUES.map((lg) =>
          fetchFotmobLeagueResults(lg.id, lg.code, lg.name)
        )
      );
      return all.flat();
    },
    staleTime: 6 * 60 * 60 * 1000,
    gcTime: 12 * 60 * 60 * 1000,
  });
}

/**
 * Finished INTL/FRLY results for a specific team, deduped by (date, teams).
 * These are merged with DB matches in TeamPage so every game appears.
 */
export function useExtraTeamMatches(teamName: string | undefined) {
  const { data: allExtra = [] } = useAllExtraResults();
  return useMemo(() => {
    if (!teamName) return [];
    const target = normalizeTeamName(teamName).toLowerCase();
    return allExtra.filter(
      (m) =>
        normalizeTeamName(m.home_team).toLowerCase() === target ||
        normalizeTeamName(m.away_team).toLowerCase() === target
    );
  }, [allExtra, teamName]);
}
