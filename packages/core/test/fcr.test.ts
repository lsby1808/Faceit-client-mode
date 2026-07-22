import { describe, expect, it } from "vitest";

import {
  calculateCompletedMatchTeamFcr,
  calculateTeamFcr,
  FCR_WEIGHTS,
  formatFcr,
} from "../src/index.js";
import { makeMatch } from "./fixtures.js";

describe("calculateTeamFcr", () => {
  it("uses the documented category weights and displays an exact 100.0% team total", () => {
    expect(FCR_WEIGHTS).toEqual({ kills: 0.35, assists: 0.1, damage: 0.3, survival: 0.1, firstKills: 0.15 });
    const result = calculateTeamFcr([
      { playerId: "a", kills: 30, assists: 10, damage: 3_000, survivedRounds: 15, firstKills: 5 },
      { playerId: "b", kills: 20, assists: 8, damage: 2_200, survivedRounds: 12, firstKills: 3 },
      { playerId: "c", kills: 15, assists: 6, damage: 1_800, survivedRounds: 10, firstKills: 2 },
      { playerId: "d", kills: 10, assists: 4, damage: 1_200, survivedRounds: 8, firstKills: 1 },
      { playerId: "e", kills: 5, assists: 2, damage: 800, survivedRounds: 5, firstKills: 0 },
    ]);

    expect(result.reduce((sum, row) => sum + row.scoreTenths, 0)).toBe(1_000);
    expect(result.map(formatFcr).join(" + ")).toContain("%");
    expect(result[0]?.score).toBeGreaterThan(result[4]?.score ?? 0);
  });

  it("splits a statless team deterministically instead of emitting NaN", () => {
    const result = calculateTeamFcr(
      Array.from({ length: 3 }, (_, index) => ({
        playerId: String(index),
        kills: 0,
        assists: 0,
        damage: 0,
        survivedRounds: 0,
        firstKills: 0,
      })),
    );
    expect(result.map(({ scoreTenths }) => scoreTenths)).toEqual([334, 333, 333]);
  });

  it("offers a guarded facade that rejects non-5v5 or unfinished matches", () => {
    const players = [
      { playerId: "a", kills: 1, assists: 1, damage: 100, survivedRounds: 1, firstKills: 1 },
    ];
    expect(calculateCompletedMatchTeamFcr(makeMatch(), players)).toHaveLength(1);
    expect(calculateCompletedMatchTeamFcr(makeMatch({ mode: "2v2" }), players)).toEqual([]);
    expect(calculateCompletedMatchTeamFcr(makeMatch({ status: "ongoing" }), players)).toEqual([]);
  });
});
