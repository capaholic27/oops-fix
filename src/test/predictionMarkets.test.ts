import { describe, it, expect } from "vitest";
import { predictMatch } from "@/lib/dixonColes";
import { aggregateStats } from "@/lib/matchStats";
import { buildPredictionMarkets, PREDICTION_MARKETS, type MarketInputs } from "@/lib/predictionMarkets";
import type { RealPlayer } from "@/hooks/useTeamPlayers";

const team = { goalsScored: 18, goalsConceded: 10, matchesPlayed: 10 };
function inputs(): MarketInputs {
  return { prediction: predictMatch(team, team), home: "Man City", away: "Liverpool", statsHome: { ...aggregateStats([]), matchesPlayed: 10 }, statsAway: { ...aggregateStats([]), matchesPlayed: 10 }, homeViews: [], awayViews: [] };
}
describe("Prediction metric markets", () => {
  it("contains all 28 Edge market categories in prediction", () => {
    const result = buildPredictionMarkets(inputs());
    expect(result.map(m => m.id)).toEqual(PREDICTION_MARKETS.map(m => m.id));
    expect(result).toHaveLength(28);
    expect(result.some(m => m.id === "player_fouls")).toBe(true);
  });
  it("preserves original win probabilities and complementary goal probabilities", () => {
    const input = inputs();
    const markets = buildPredictionMarkets(input);
    expect(markets.find(m => m.id === "1x2")?.outcomes.map(o => o.probability)).toEqual([input.prediction.homeWin, input.prediction.draw, input.prediction.awayWin]);
    const goals = markets.find(m => m.id === "over_under_goals")?.outcomes ?? [];
    expect(goals[2].probability + goals[3].probability).toBeCloseTo(100, 8);
    const btts = markets.find(m => m.id === "btts")?.outcomes ?? [];
    expect(btts.reduce((s, o) => s + o.probability, 0)).toBeCloseTo(100, 8);
  });
  it("does not invent confidence or probabilities for unsupported data", () => {
    const markets = buildPredictionMarkets(inputs());
    for (const id of ["offsides", "ht_ft", "first_scorer", "corners", "cards", "player_card"]) {
      const market = markets.find(m => m.id === id);
      expect(market?.outcomes).toEqual([]);
      expect(market?.confidence).toBe("Unavailable");
    }
  });
  it("excludes deselected players from all player markets", () => {
    const player: RealPlayer = { name: "Test forward", fullName: "Test forward", photo: null, position: "ST", number: 9, goals: 10, assists: 4, appearances: 10, shots: 30, shotsOnTarget: 20, fouls: 5, foulsDrawn: 4, yellow: 2, red: 0, rating: null };
    const input = { ...inputs(), squadHome: [player] };
    expect(buildPredictionMarkets(input).find(m => m.id === "anytime_scorer")?.outcomes[0].probability).toBeGreaterThan(0);
    const excluded = buildPredictionMarkets({ ...input, outHome: new Set([player.name]) });
    expect(excluded.filter(m => m.category === "Players").flatMap(m => m.outcomes)).toEqual([]);
  });
  it("draw-no-bet conditions on decisive outcomes rather than reusing 1X2", () => {
    const input = inputs();
    const market = buildPredictionMarkets(input).find(m => m.id === "draw_no_bet");
    expect(market?.outcomes[0].probability).toBeCloseTo(input.prediction.homeWin / (input.prediction.homeWin + input.prediction.awayWin) * 100, 8);
  });
});