/**
 * Shared recent-form computation.
 *
 * Both the Stats page (TeamPage) and the match-detail sheet use this so the
 * 5-icon quick form and the "More" detailed list always show the same matches
 * in the same order.
 *
 * Sorting uses match_date + match_time (when available) so same-day matches
 * are ordered by actual kickoff time, not arbitrarily.
 */

import type { Match, TeamMatchView } from "@/lib/matchStats";
import { getTeamMatchView } from "@/lib/matchStats";
import { normalizeTeamName, getTeamAliases } from "@/lib/teamNormalize";
import { localToday } from "@/lib/datetime";

/**
 * Match sort key: date + time (when available). Used for chronological ordering.
 */
function matchSortKey(m: { match_date: string; match_time?: string | null }): string {
  return `${m.match_date}T${m.match_time ?? "00:00"}`;
}

/**
 * Get a team's recent completed matches from a list of all matches.
 *
 * - Uses normalized team names + aliases so "Man City" and "Manchester City"
 *   collapse to the same team.
 * - Excludes future matches (match_date > today in local timezone).
 * - Sorts by actual kickoff timestamp (date + time).
 * - Returns the latest `count` matches as TeamMatchViews, most-recent LAST
 *   (consistent with the existing convention where formLast5 = views.slice(-5)).
 */
export function getTeamRecentViews(
  teamName: string,
  allMatches: Match[],
  count?: number,
  beforeDate?: string,
): TeamMatchView[] {
  const aliases = getTeamAliases(teamName);
  const aliasSet = new Set(aliases.map((a) => normalizeTeamName(a).toLowerCase()));
  const today = localToday();

  const views = allMatches
    .filter((m) => {
      // Match the team by normalized name or alias.
      const homeKey = normalizeTeamName(m.home_team).toLowerCase();
      const awayKey = normalizeTeamName(m.away_team).toLowerCase();
      if (!aliasSet.has(homeKey) && !aliasSet.has(awayKey)) return false;
      // Exclude future matches.
      if (m.match_date > today) return false;
      // Exclude matches after the reference date (for "form before this match").
      if (beforeDate && m.match_date >= beforeDate) return false;
      return true;
    })
    .map((m) => getTeamMatchView(m, teamName))
    .filter((v): v is TeamMatchView => v !== null)
    .sort((a, b) => matchSortKey(a.match).localeCompare(matchSortKey(b.match)));

  return count ? views.slice(-count) : views;
}

/**
 * Get a team's recent form as an array of "W" | "D" | "L", most-recent LAST.
 * This is the same array used by the 5-icon quick display.
 */
export function getTeamFormArray(
  teamName: string,
  allMatches: Match[],
  count = 5,
  beforeDate?: string,
): ("W" | "D" | "L")[] {
  return getTeamRecentViews(teamName, allMatches, count, beforeDate).map((v) => v.result);
}
