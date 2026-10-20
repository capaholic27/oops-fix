import { describe, it, expect } from "vitest";
import { liveMarketTips } from "@/components/LiveStrip";
import { matchesTeamQuery } from "@/lib/teamNormalize";
const base = { home_team: "A", away_team: "B", home_goals: 0, away_goals: 0, minute: 30, status: "live", events: [], stats: { xg: [1.5, 0.2], shotsOnTarget: [5, 0], shots: [10, 2], corners: [5, 1] } as any };
describe("live tips", () => {
  it("none after full time", () => expect(liveMarketTips({ ...base, status: "ft" })).toEqual([]));
  it("dominant team suggested for next goal", () => expect(liveMarketTips(base).find(t => t.market === "Next goal")?.pick).toBe("A"));
});
describe("team search", () => {
  it("man city", () => expect(matchesTeamQuery("Manchester City", "man city")).toBe(true));
  it("man united", () => expect(matchesTeamQuery("Man United", "man united")).toBe(true));
  it("manchester finds both", () => { expect(matchesTeamQuery("Manchester City", "manchester")).toBe(true); expect(matchesTeamQuery("Manchester United", "manchester")).toBe(true); });
  it("liverpool", () => expect(matchesTeamQuery("Liverpool", "liver")).toBe(true));
});
