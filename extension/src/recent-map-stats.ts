import {
  canonicalMapId,
  eligibleMatches,
  type PlayerMapStats,
  type PlayerMatch,
  type StatsWindow,
} from "@eloscope/core";

export type RecentPlayerMatchLookup = ReadonlyMap<string, readonly PlayerMatch[]>;
export type RecentPlayerMapStatsLookup = ReadonlyMap<string, readonly PlayerMapStats[]>;

interface MapTotals {
  matches: number;
  wins: number;
  kills: number;
  assists: number;
  deaths: number;
  roundsPlayed: number;
  damage: number;
  headshots: number;
  firstKills: number;
  hasCompleteHeadshots: boolean;
  hasCompleteFirstKills: boolean;
}

const emptyTotals = (): MapTotals => ({
  matches: 0,
  wins: 0,
  kills: 0,
  assists: 0,
  deaths: 0,
  roundsPlayed: 0,
  damage: 0,
  headshots: 0,
  firstKills: 0,
  hasCompleteHeadshots: true,
  hasCompleteFirstKills: true,
});

/**
 * Select the newest unique matches before grouping by map. A map-less match
 * still consumes a window slot: the configured window describes a player's
 * latest matches overall, not their latest matches for every individual map.
 */
const newestUniqueMatches = (
  matches: readonly PlayerMatch[],
  window: StatsWindow,
): PlayerMatch[] => {
  const selected: PlayerMatch[] = [];
  const seen = new Set<string>();

  for (const match of eligibleMatches(matches)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    selected.push(match);
    if (selected.length === window) break;
  }

  return selected;
};

const addMatch = (totals: MapTotals, match: PlayerMatch): void => {
  totals.matches += 1;
  totals.wins += match.result === "win" ? 1 : 0;
  totals.kills += match.kills;
  totals.assists += match.assists;
  totals.deaths += match.deaths;
  totals.roundsPlayed += match.roundsPlayed;
  totals.damage += match.damage;

  if (match.headshots === undefined) {
    totals.hasCompleteHeadshots = false;
  } else {
    totals.headshots += match.headshots;
  }

  if (match.firstKills === undefined) {
    totals.hasCompleteFirstKills = false;
  } else {
    totals.firstKills += match.firstKills;
  }
};

const toPlayerMapStats = (map: string, totals: MapTotals): PlayerMapStats => {
  const row: PlayerMapStats = {
    map,
    matches: totals.matches,
    wins: totals.wins,
    kills: totals.kills,
    assists: totals.assists,
    deaths: totals.deaths,
    roundsPlayed: totals.roundsPlayed,
    damage: totals.damage,
  };

  // A partial sum would look like a real zero-based aggregate. Preserve the
  // optional field only when every source row for this map exposes it.
  if (totals.hasCompleteHeadshots) row.headshots = totals.headshots;
  if (totals.hasCompleteFirstKills) row.firstKills = totals.firstKills;
  return row;
};

/**
 * Builds truthful, windowed per-map samples for the match-room win-rate chart.
 *
 * Players without a usable map row are omitted from the returned lookup, so
 * downstream coverage calculations continue to report missing data instead of
 * treating it as a zero-match player.
 */
export const buildRecentPlayerMapStats = (
  playerMatches: RecentPlayerMatchLookup,
  window: StatsWindow,
): RecentPlayerMapStatsLookup => {
  const result = new Map<string, readonly PlayerMapStats[]>();

  for (const [playerId, matches] of playerMatches) {
    const groups = new Map<string, MapTotals>();

    for (const match of newestUniqueMatches(matches, window)) {
      if (typeof match.map !== "string") continue;
      const map = canonicalMapId(match.map);
      if (!map) continue;

      const totals = groups.get(map) ?? emptyTotals();
      addMatch(totals, match);
      groups.set(map, totals);
    }

    const rows = [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([map, totals]) => toPlayerMapStats(map, totals));
    if (rows.length > 0) result.set(playerId, rows);
  }

  return result;
};
