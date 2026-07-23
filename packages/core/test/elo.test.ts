import { describe, expect, it } from "vitest";

import {
  ELO_TIER_PALETTE,
  estimateEloStake,
  getEloTier,
  getEloTierPresentation,
  getEloTierProgress,
  getOfficialEloLevel,
  getOfficialEloProgress,
  type EloScopeTier,
} from "../src/index.js";

const stakeMatch = (
  firstProbability: number | undefined,
  secondProbability: number | undefined,
  overrides: { calculateElo?: boolean; premiumMatch?: boolean } = {},
) => ({
  calculateElo: overrides.calculateElo ?? true,
  premiumMatch: overrides.premiumMatch ?? false,
  teams: [
    {
      id: "alpha",
      players: [],
      ...(firstProbability === undefined ? {} : { winProbability: firstProbability }),
    },
    {
      id: "bravo",
      players: [],
      ...(secondProbability === undefined ? {} : { winProbability: secondProbability }),
    },
  ],
});

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

const EXPECTED_PRESENTATIONS: ReadonlyArray<
  readonly [EloScopeTier, string, string, string]
> = [
  [1, "#A7ADB7", "#0B1115", "#A7ADB747"],
  [2, "#69C96B", "#0B1115", "#69C96B47"],
  [3, "#8CCF4D", "#0B1115", "#8CCF4D47"],
  [4, "#C7D83D", "#0B1115", "#C7D83D47"],
  [5, "#F0C341", "#0B1115", "#F0C34147"],
  [6, "#F3A43B", "#0B1115", "#F3A43B47"],
  [7, "#F27A3D", "#0B1115", "#F27A3D47"],
  [8, "#EE5656", "#0B1115", "#EE565647"],
  [9, "#E74372", "#0B1115", "#E7437247"],
  [10, "#FF2854", "#0B1115", "#FF285447"],
  [11, "#22E6F3", "#05272B", "#22E6F380"],
  [12, "#42A5FF", "#0A2034", "#42A5FF80"],
  [13, "#6E76FF", "#0D122A", "#6E76FF80"],
  [14, "#B084FF", "#251936", "#B084FF80"],
  [15, "#D64DFF", "#2C0F35", "#D64DFF80"],
  [16, "#FF69E4", "#35152F", "#FF69E480"],
  [17, "#FF4D91", "#350E1F", "#FF4D9180"],
  [18, "#FF7068", "#351611", "#FF706880"],
  [19, "#FF982E", "#342007", "#FF982E80"],
  [20, "#FFE55C", "#302A09", "#FFE55C80"],
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

function oklab(hex: string): readonly [number, number, number] {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabDistance(first: string, second: string): number {
  const [firstL, firstA, firstB] = oklab(first);
  const [secondL, secondA, secondB] = oklab(second);
  return Math.hypot(firstL - secondL, firstA - secondA, firstB - secondB) * 100;
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
    for (const [tier, foreground, background, glow] of EXPECTED_PRESENTATIONS) {
      const presentation = getEloTierPresentation(tier);
      expect(presentation).toEqual({
        tier,
        foreground,
        background,
        glow,
      });
      expect(ELO_TIER_PALETTE[tier]).toBe(presentation);
      expect(Object.isFrozen(presentation)).toBe(true);
      expect(contrastRatio(presentation.foreground, presentation.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps every extended-tier color perceptually distinct", () => {
    const extended = EXPECTED_PRESENTATIONS.filter(([tier]) => tier >= 11);
    for (let firstIndex = 0; firstIndex < extended.length; firstIndex += 1) {
      const first = extended[firstIndex];
      if (!first) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < extended.length; secondIndex += 1) {
        const second = extended[secondIndex];
        if (!second) continue;
        expect(
          oklabDistance(first[1], second[1]),
          `tiers ${first[0]} and ${second[0]} should remain visibly distinct`,
        ).toBeGreaterThanOrEqual(9);
      }
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

describe("expected match Elo stake", () => {
  it("uses FACEIT probabilities with the standard 50-point stake", () => {
    expect(estimateEloStake(stakeMatch(0.5, 0.5))).toEqual([
      { teamId: "alpha", gain: 25, loss: -25 },
      { teamId: "bravo", gain: 25, loss: -25 },
    ]);
    expect(estimateEloStake(stakeMatch(0.4, 0.6))).toEqual([
      { teamId: "alpha", gain: 30, loss: -20 },
      { teamId: "bravo", gain: 20, loss: -30 },
    ]);
    expect(estimateEloStake(stakeMatch(0, 1))).toEqual([
      { teamId: "alpha", gain: 50, loss: 0 },
      { teamId: "bravo", gain: 0, loss: -50 },
    ]);
  });

  it("uses the 20 percent Premium Match uplift", () => {
    expect(estimateEloStake(stakeMatch(0.5, 0.5, { premiumMatch: true }))).toEqual([
      { teamId: "alpha", gain: 30, loss: -30 },
      { teamId: "bravo", gain: 30, loss: -30 },
    ]);
  });

  it("fails closed for non-Elo and contradictory probability contracts", () => {
    expect(estimateEloStake(stakeMatch(0.5, 0.5, { calculateElo: false }))).toBeUndefined();
    expect(estimateEloStake(stakeMatch(undefined, 0.5))).toBeUndefined();
    expect(estimateEloStake(stakeMatch(-0.1, 1.1))).toBeUndefined();
    expect(estimateEloStake(stakeMatch(0.4, 0.5))).toBeUndefined();
    expect(estimateEloStake({ ...stakeMatch(0.5, 0.5), teams: [] })).toBeUndefined();
  });
});
