import { describe, expect, it } from "vitest";
import { canonicalTeamKey, getTeamAliases, matchesTeamQuery, uniqueTeamNames } from "@/lib/teamNormalize";
import { deduplicateFixtures } from "@/lib/fixtureIdentity";

describe("Fotmob club identity and fixtures", () => {
  it("keeps Spain's Barcelona separate from Ecuador's Barcelona SC", () => {
    expect(uniqueTeamNames(["Barcelona SC", "Barcelona", "FC Barcelona"])).toEqual(["Barcelona", "Barcelona SC"]);
    expect(matchesTeamQuery("Barcelona", "barca")).toBe(true);
    expect(canonicalTeamKey("Barcelona SC")).not.toBe(canonicalTeamKey("Barcelona"));
  });
  it("keeps both Manchester clubs and Liverpool selectable under aliases", () => {
    const names = uniqueTeamNames(["Manchester City", "man city", "Man United", "Manchester United", "Liverpool FC", "Liverpool"]);
    expect(names).toEqual(["Liverpool", "Manchester City", "Manchester United"]);
    expect(matchesTeamQuery("Manchester City", "man city")).toBe(true);
    expect(matchesTeamQuery("Manchester United", "man utd")).toBe(true);
    expect(getTeamAliases("Liverpool")).toContain("Liverpool FC");
  });
  it("does not turn unassigned cup slots into selectable clubs", () => {
    expect(uniqueTeamNames(["Barcelona/Atletico Madrid", "Winner semi-final", "Barcelona"])).toEqual(["Barcelona"]);
  });
  const first = { id: "older", match_date: "2026-10-20", match_time: "18:00", home_team: "FC Barcelona", away_team: "Atletico Madrid", created_at: "2026-10-19" };
  const latest = { ...first, id: "latest", home_team: "Barcelona", away_team: "Atlético Madrid", match_time: "19:00", created_at: "2026-10-20" };
  it("shows one match despite aliases and kickoff corrections, preferring the newest record", () => {
    expect(deduplicateFixtures([first, latest])).toEqual([latest]);
  });
  it("does not show a finished match again as upcoming", () => {
    expect(deduplicateFixtures([first, latest], [latest])).toEqual([]);
  });
  it("retains genuine rematches on different dates and different Barcelona clubs", () => {
    expect(deduplicateFixtures([first, { ...latest, match_date: "2026-10-27" }, { ...latest, home_team: "Barcelona SC" }])).toHaveLength(3);
  });
});