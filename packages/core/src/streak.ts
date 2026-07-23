import { eligibleMatches, toEpochMs } from "./matches.js";
import type { MatchResult, PlayerMatch } from "./types.js";

export type CurrentMatchStreak =
  | Readonly<{
      status: "known";
      result: MatchResult;
      count: number;
      isLowerBound?: true;
    }>
  | Readonly<{
      status: "unknown";
      reason: "no-eligible-matches" | "conflicting-duplicates";
    }>;

export type CurrentMatchStreakOptions = Readonly<{
  sampleLimit?: number;
}>;

/**
 * Calculates the uninterrupted win/loss streak starting at the newest unique,
 * completed CS2 5v5 match. Older results after the first opposite result do
 * not contribute to the current streak.
 *
 * When the caller supplies the bridge sample limit and every eligible match
 * in a full sample belongs to the streak, the count is marked as a lower
 * bound because an older page could continue the same series.
 */
export const calculateCurrentMatchStreak = (
  matches: readonly PlayerMatch[],
  options: CurrentMatchStreakOptions = {},
): CurrentMatchStreak => {
  const eligible = eligibleMatches(matches);
  const canonicalByMatchId = new Map<string, Readonly<{
    result: MatchResult;
    finishedAt: number;
  }>>();

  for (const match of eligible) {
    const canonical = {
      result: match.result,
      finishedAt: toEpochMs(match.finishedAt),
    } as const;
    const previous = canonicalByMatchId.get(match.id);
    if (
      previous
      && (previous.result !== canonical.result || previous.finishedAt !== canonical.finishedAt)
    ) {
      return {
        status: "unknown",
        reason: "conflicting-duplicates",
      };
    }
    canonicalByMatchId.set(match.id, canonical);
  }

  const seenMatchIds = new Set<string>();
  const selected = eligible.filter((match) => {
    if (seenMatchIds.has(match.id)) return false;
    seenMatchIds.add(match.id);
    return true;
  });
  const newest = selected[0];

  if (!newest) {
    return {
      status: "unknown",
      reason: "no-eligible-matches",
    };
  }

  let count = 0;
  for (const match of selected) {
    if (match.result !== newest.result) break;
    count += 1;
  }

  return {
    status: "known",
    result: newest.result,
    count,
    ...(options.sampleLimit !== undefined
      && matches.length >= options.sampleLimit
      && count === selected.length
      ? { isLowerBound: true as const }
      : {}),
  };
};
