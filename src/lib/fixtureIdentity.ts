import { canonicalTeamKey, isConcreteTeam } from "@/lib/teamNormalize";

type Game = { match_date: string; home_team: string; away_team: string };
type ScheduledGame = Game & { match_time: string | null; created_at?: string | null };

export function matchKey(game: Game): string {
  return `${game.match_date}|${canonicalTeamKey(game.home_team)}|${canonicalTeamKey(game.away_team)}`;
}

/** Same UTC date + teams regardless of naming, competition or kickoff corrections. */
export function deduplicateFixtures<T extends ScheduledGame>(fixtures: T[], results: Game[] = []): T[] {
  const played = new Set(results.map(matchKey));
  const games = new Map<string, T>();
  for (const fixture of fixtures) {
    if (!isConcreteTeam(fixture.home_team) || !isConcreteTeam(fixture.away_team)) continue;
    const key = matchKey(fixture);
    if (played.has(key)) continue;
    const existing = games.get(key);
    if (!existing || (fixture.created_at ?? "") > (existing.created_at ?? "") ||
      ((fixture.created_at ?? "") === (existing.created_at ?? "") && !existing.match_time && fixture.match_time)) {
      games.set(key, fixture);
    }
  }
  return [...games.values()].sort((a, b) =>
    a.match_date.localeCompare(b.match_date) || (a.match_time ?? "99:99").localeCompare(b.match_time ?? "99:99"));
}