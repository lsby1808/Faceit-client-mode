export type OfficialEloLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type EloScopeTier = OfficialEloLevel | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20;

/** Minimum ELO for official levels 2-10. */
const OFFICIAL_LEVEL_THRESHOLDS = [801, 951, 1_101, 1_251, 1_401, 1_551, 1_701, 1_851, 2_001] as const;

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
 * The optional EloScope scale never changes the official FACEIT level.
 * Tier 11 begins at 2251 and each further tier adds 250 ELO; tier 20 begins
 * at 4501 and has no upper bound.
 */
export const getEloTier = (elo: number, extended = false): EloScopeTier => {
  const official = getOfficialEloLevel(elo);
  if (!extended || official < 10 || elo < 2_251) return official;
  return Math.min(20, 11 + Math.floor((elo - 2_251) / 250)) as EloScopeTier;
};
