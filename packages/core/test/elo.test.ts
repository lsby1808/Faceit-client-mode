import { describe, expect, it } from "vitest";

import {
  ELO_TIER_PALETTE,
  getEloTier,
  getEloTierPresentation,
  getEloTierProgress,
  getOfficialEloLevel,
  getOfficialEloProgress,
  type EloScopeTier,
} from "../src/index.js";

const TIER_BOUNDS: ReadonlyArray<Readonly<{
  tier: EloScopeTier;
  floor: number;
  next: number | null;
}>> = [
  { tier: 1, floor: 0, next: 801 },
  { tier: 2, floor: 801, next: 951 },
  { tier: 3, floor: 951, next: 1_101 },
  { tier: 4, floor: 1_101, next: 1_251 },
  { tier: 5, floor: 1_251, next: 1_401 },
  { tier: 6, floor: 1_401, next: 1_551 },
  { tier: 7, floor: 1_551, next: 1_701 },
  { tier: 8, floor: 1_701, next: 1_851 },
  { tier: 9, floor: 1_851, next: 2_001 },
  { tier: 10, floor: 2_001, next: 2_251 },
  { tier: 11, floor: 2_251, next: 2_501 },
  { tier: 12, floor: 2_501, next: 2_751 },
  { tier: 13, floor: 2_751, next: 3_001 },
  { tier: 14, floor: 3_001, next: 3_251 },
  { tier: 15, floor: 3_251, next: 3_501 },
  { tier: 16, floor: 3_501, next: 3_751 },
  { tier: 17, floor: 3_751, next: 4_001 },
  { tier: 18, floor: 4_001, next: 4_251 },
  { tier: 19, floor: 4_251, next: 4_501 },
  { tier: 20, floor: 4_501, next: null },
];

const EXPECTED_FOREGROUNDS: ReadonlyArray<readonly [EloScopeTier, string]> = [
  [1, "#A7ADB7"],
  [2, "#69C96B"],
  [3, "#8CCF4D"],
  [4, "#C7D83D"],
  [5, "#F0C341"],
  [6, "#F3A43B"],
  [7, "#F27A3D"],
  [8, "#EE5656"],
  [9, "#E74372"],
  [10, "#FF2854"],
  [11, "#4DD8FF"],
  [12, "#39BFFF"],
  [13, "#5CA2FF"],
  [14, "#8284FF"],
  [15, "#A974FF"],
  [16, "#CD63FF"],
  [17, "#F05CC6"],
  [18, "#FF628E"],
  [19, "#FF914D"],
  [20, "#FFD45A"],
];

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("ELO levels", () => {
  it("keeps the official 1-10 scale intact", () => {
    expect(getOfficialEloLevel(800)).toBe(1);
    expect(getOfficialEloLevel(801)).toBe(2);
    expect(getOfficialEloLevel(2_000)).toBe(9);
    expect(getOfficialEloLevel(2_001)).toBe(10);
    expect(getEloTier(4_999, false)).toBe(10);
  });

  it("covers every boundary in the optional 1-20 scale", () => {
    for (const { tier, floor, next } of TIER_BOUNDS) {
      expect(getEloTier(floor, true), `tier ${tier} floor`).toBe(tier);
      if (floor > 0) {
        expect(getEloTier(floor - 1, true), `tier ${tier} lower boundary`).toBe(tier - 1);
      }
      if (next !== null) {
        expect(getEloTier(next - 1, true), `tier ${tier} ceiling`).toBe(tier);
        expect(getEloTier(next, true), `tier ${tier} next boundary`).toBe(tier + 1);
      }
    }
    expect(getEloTier(99_999, true)).toBe(20);
  });

  it("keeps every above-2000 ELO on official level 10 while the extension is off", () => {
    for (const elo of [2_001, 2_250, 2_251, 3_751, 4_501, 99_999]) {
      expect(getEloTier(elo, false)).toBe(10);
    }
  });

  it("reports exact progress across all twenty tiers", () => {
    for (const { tier, floor, next } of TIER_BOUNDS) {
      const atFloor = getEloTierProgress(floor);
      expect(atFloor).toEqual({
        tier,
        currentFloor: floor,
        nextThreshold: next,
        pointsNeeded: next === null ? null : next - floor,
        percent: next === null ? 100 : 0,
      });

      if (next === null) continue;
      const span = next - floor;
      const midpoint = floor + Math.floor(span / 2);
      const atMidpoint = getEloTierProgress(midpoint);
      expect(atMidpoint.tier).toBe(tier);
      expect(atMidpoint.pointsNeeded).toBe(next - midpoint);
      expect(atMidpoint.percent).toBeCloseTo(((midpoint - floor) / span) * 100, 10);

      const atCeiling = getEloTierProgress(next - 1);
      expect(atCeiling.tier).toBe(tier);
      expect(atCeiling.pointsNeeded).toBe(1);
      expect(atCeiling.percent).toBeCloseTo(((span - 1) / span) * 100, 10);
    }

    expect(getEloTierProgress(99_999)).toEqual({
      tier: 20,
      currentFloor: 4_501,
      nextThreshold: null,
      pointsNeeded: null,
      percent: 100,
    });
  });

  it("floors fractional ELO and fails safely for invalid progress input", () => {
    expect(getEloTierProgress(2_500.99)).toMatchObject({
      tier: 11,
      pointsNeeded: 1,
      percent: 99.6,
    });
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -500]) {
      expect(getEloTierProgress(invalid)).toEqual({
        tier: 1,
        currentFloor: 0,
        nextThreshold: 801,
        pointsNeeded: 801,
        percent: 0,
      });
    }
  });

  it("exposes one immutable exact palette for all 20 tiers", () => {
    expect(Object.isFrozen(ELO_TIER_PALETTE)).toBe(true);
    expect(Object.keys(ELO_TIER_PALETTE)).toHaveLength(20);
    for (const [tier, foreground] of EXPECTED_FOREGROUNDS) {
      const presentation = getEloTierPresentation(tier);
      expect(presentation).toEqual({
        tier,
        foreground,
        background: "#0B1115",
        glow: `${foreground}47`,
      });
      expect(ELO_TIER_PALETTE[tier]).toBe(presentation);
      expect(Object.isFrozen(presentation)).toBe(true);
      expect(contrastRatio(presentation.foreground, presentation.background)).toBeGreaterThanOrEqual(4.5);
    }
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
