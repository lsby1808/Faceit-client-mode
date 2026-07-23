import type { PlayerMatch, StatsWindow } from "./types.js";

const MAX_DATE_EPOCH_MS = 8_640_000_000_000_000;

export const toEpochMs = (value: string | number | Date): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return Number.NaN;
    // FACEIT payloads use both Unix seconds and JavaScript milliseconds.
    return Math.abs(value) < 100_000_000_000 ? value * 1_000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

/** The one eligibility gate shared by aggregation, FCR history and battery calculations. */
export const isCompletedCs2FiveVFive = (match: PlayerMatch): boolean => {
  const game = match.game.trim().toLowerCase();
  const mode = match.mode.replaceAll(" ", "").toLowerCase();
  const status = match.status.trim().toLowerCase();

  const requiredStats = [
    match.roundsPlayed,
    match.kills,
    match.assists,
    match.deaths,
    match.damage,
  ];
  const optionalStats = [match.headshots, match.firstKills, match.survivedRounds];
  const finishedAt = toEpochMs(match.finishedAt);

  return (
    game === "cs2" &&
    mode === "5v5" &&
    (status === "finished" || status === "completed") &&
    Number.isFinite(finishedAt) &&
    Math.abs(finishedAt) <= MAX_DATE_EPOCH_MS &&
    Number.isFinite(match.roundsPlayed) &&
    match.roundsPlayed > 0 &&
    requiredStats.every((value) => Number.isFinite(value) && value >= 0) &&
    optionalStats.every((value) => value === undefined || (Number.isFinite(value) && value >= 0))
  );
};

export const eligibleMatches = (matches: readonly PlayerMatch[], limit?: StatsWindow): PlayerMatch[] => {
  const sorted = matches
    .filter(isCompletedCs2FiveVFive)
    .sort((left, right) => toEpochMs(right.finishedAt) - toEpochMs(left.finishedAt));

  return limit === undefined ? sorted : sorted.slice(0, limit);
};
