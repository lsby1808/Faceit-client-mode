import { describe, expect, it } from "vitest";

import { getEloTier, getOfficialEloLevel, getOfficialEloProgress } from "../src/index.js";

describe("ELO levels", () => {
  it("keeps the official 1-10 scale intact", () => {
    expect(getOfficialEloLevel(800)).toBe(1);
    expect(getOfficialEloLevel(801)).toBe(2);
    expect(getOfficialEloLevel(2_000)).toBe(9);
    expect(getOfficialEloLevel(2_001)).toBe(10);
    expect(getEloTier(4_999, false)).toBe(10);
  });

  it("uses 2251 then 250-ELO steps for optional tiers 11-20", () => {
    expect(getEloTier(2_250, true)).toBe(10);
    expect(getEloTier(2_251, true)).toBe(11);
    expect(getEloTier(2_500, true)).toBe(11);
    expect(getEloTier(2_501, true)).toBe(12);
    expect(getEloTier(4_500, true)).toBe(19);
    expect(getEloTier(4_501, true)).toBe(20);
    expect(getEloTier(99_999, true)).toBe(20);
  });

  it("reports exact progress to the next official level without extending level 10", () => {
    expect(getOfficialEloProgress(900)).toEqual({
      level: 2,
      currentFloor: 801,
      nextThreshold: 951,
      pointsNeeded: 51,
      percent: 66,
    });
    expect(getOfficialEloProgress(2_500)).toEqual({
      level: 10,
      currentFloor: 2_001,
      nextThreshold: null,
      pointsNeeded: null,
      percent: 100,
    });
  });
});
