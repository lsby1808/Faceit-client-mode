export type OfficialEloLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type EloScopeTier = OfficialEloLevel | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

/** Minimum ELO for official levels 2-10. */
const OFFICIAL_LEVEL_THRESHOLDS = [801, 951, 1_101, 1_251, 1_401, 1_551, 1_701, 1_851, 2_001] as const;

/** Minimum ELO for every EloScope tier, indexed by tier - 1. */
const ELOSCOPE_TIER_FLOORS = [
  0,
  801,
  951,
  1_101,
  1_251,
  1_401,
  1_551,
  1_701,
  1_851,
  2_001,
  2_251,
  2_501,
  2_751,
  3_001,
  3_251,
  3_501,
  3_751,
  4_001,
  4_251,
  4_501,
] as const;

const TIER_BACKGROUND = "#0B1115";
const GLOW_ALPHA_HEX = "47";

export interface EloTierProgress {
  readonly tier: EloScopeTier;
  readonly currentFloor: number;
  readonly nextThreshold: number | null;
  readonly pointsNeeded: number | null;
  readonly percent: number;
}

export interface EloTierPresentation {
  readonly tier: EloScopeTier;
  readonly foreground: string;
  readonly background: string;
  readonly glow: string;
}

function tierPresentation(tier: EloScopeTier, foreground: string): EloTierPresentation {
  return Object.freeze({
    tier,
    foreground,
    background: TIER_BACKGROUND,
    glow: `${foreground}${GLOW_ALPHA_HEX}`,
  });
}

/**
 * One presentation source for profile rails, match-room replacements and any
 * future tier surface. Glow uses the foreground at roughly 28% alpha.
 */
export const ELO_TIER_PALETTE: Readonly<Record<EloScopeTier, EloTierPresentation>> = Object.freeze({
  1: tierPresentation(1, "#A7ADB7"),
  2: tierPresentation(2, "#69C96B"),
  3: tierPresentation(3, "#8CCF4D"),
  4: tierPresentation(4, "#C7D83D"),
  5: tierPresentation(5, "#F0C341"),
  6: tierPresentation(6, "#F3A43B"),
  7: tierPresentation(7, "#F27A3D"),
  8: tierPresentation(8, "#EE5656"),
  9: tierPresentation(9, "#E74372"),
  10: tierPresentation(10, "#FF2854"),
  11: tierPresentation(11, "#4DD8FF"),
  12: tierPresentation(12, "#39BFFF"),
  13: tierPresentation(13, "#5CA2FF"),
  14: tierPresentation(14, "#8284FF"),
  15: tierPresentation(15, "#A974FF"),
  16: tierPresentation(16, "#CD63FF"),
  17: tierPresentation(17, "#F05CC6"),
  18: tierPresentation(18, "#FF628E"),
  19: tierPresentation(19, "#FF914D"),
  20: tierPresentation(20, "#FFD45A"),
});

export interface OfficialEloProgress {
  level: OfficialEloLevel;
  currentFloor: number;
  nextThreshold: number | null;
  pointsNeeded: number | null;
  percent: number;
}

export const getOfficialEloLevel = (elo: number): OfficialEloLevel => {
  const safeElo = Number.isFinite(elo) ? Math.max(0, elo) : 0;
  let level: OfficialEloLevel = 1;
  for (const threshold of OFFICIAL_LEVEL_THRESHOLDS) {
    if (safeElo < threshold) break;
    level = (level + 1) as OfficialEloLevel;
  }
  return level;
};

export const getOfficialEloProgress = (elo: number): OfficialEloProgress => {
  const safeElo = Number.isFinite(elo) ? Math.max(0, Math.floor(elo)) : 0;
  const level = getOfficialEloLevel(safeElo);
  const currentFloor = level === 1 ? 0 : (OFFICIAL_LEVEL_THRESHOLDS[level - 2] ?? 0);
  const nextThreshold = level === 10 ? null : (OFFICIAL_LEVEL_THRESHOLDS[level - 1] ?? null);
  if (nextThreshold === null) {
    return { level, currentFloor, nextThreshold, pointsNeeded: null, percent: 100 };
  }
  const span = Math.max(1, nextThreshold - currentFloor);
  const percent = Math.max(0, Math.min(100, ((safeElo - currentFloor) / span) * 100));
  return {
    level,
    currentFloor,
    nextThreshold,
    pointsNeeded: Math.max(0, nextThreshold - safeElo),
    percent,
  };
};

/**
 * The optional EloScope scale is calculated separately from the official
 * FACEIT level; UI surfaces may display it while retaining the official value.
 * Tier 11 begins at 2251 and each further tier adds 250 ELO; tier 20 begins
 * at 4501 and has no upper bound.
 */
export const getEloTier = (elo: number, extended = false): EloScopeTier => {
  const safeElo = Number.isFinite(elo) ? Math.max(0, elo) : 0;
  const official = getOfficialEloLevel(safeElo);
  if (!extended || official < 10 || safeElo < 2_251) return official;
  return Math.min(20, 11 + Math.floor((safeElo - 2_251) / 250)) as EloScopeTier;
};

/** Progress through the optional EloScope 1-20 scale. */
export const getEloTierProgress = (elo: number): EloTierProgress => {
  const safeElo = Number.isFinite(elo) ? Math.max(0, Math.floor(elo)) : 0;
  const tier = getEloTier(safeElo, true);
  const currentFloor = ELOSCOPE_TIER_FLOORS[tier - 1] ?? 0;
  const nextThreshold = tier === 20 ? null : (ELOSCOPE_TIER_FLOORS[tier] ?? null);
  if (nextThreshold === null) {
    return { tier, currentFloor, nextThreshold, pointsNeeded: null, percent: 100 };
  }
  const span = Math.max(1, nextThreshold - currentFloor);
  const percent = Math.max(0, Math.min(100, ((safeElo - currentFloor) / span) * 100));
  return {
    tier,
    currentFloor,
    nextThreshold,
    pointsNeeded: Math.max(0, nextThreshold - safeElo),
    percent,
  };
};

export const getEloTierPresentation = (tier: EloScopeTier): EloTierPresentation => ELO_TIER_PALETTE[tier];
