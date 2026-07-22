import type { MapId, MatchContext, MatchTeam, PlayerMapStats } from "./types.js";

export type PlayerMapStatsLookup = ReadonlyMap<string, readonly PlayerMapStats[]>;

export type TeamMapWinRateUnavailableReason = "no-players" | "no-map-data";

interface TeamMapWinRateBase {
  teamId: string;
  teamName?: string;
  map: MapId;
  /** Number of unique roster players with a valid, non-empty sample for this map. */
  knownPlayers: number;
  /** Number of unique players in the match-room roster. */
  totalPlayers: number;
  /** Known-player share in the 0..1 range, or null for an empty roster. */
  coverage: number | null;
  /** Sum of the per-player map samples used by the weighted aggregate. */
  sampleMatches: number;
}

export interface TeamMapWinRateReady extends TeamMapWinRateBase {
  status: "ready";
  wins: number;
  /** Match-weighted team win rate in percentage points (0..100). */
  winRate: number;
}

export interface TeamMapWinRateUnavailable extends TeamMapWinRateBase {
  status: "unavailable";
  sampleMatches: 0;
  reason: TeamMapWinRateUnavailableReason;
}

export type TeamMapWinRateAggregate = TeamMapWinRateReady | TeamMapWinRateUnavailable;

export type MapWinRateAdvantage =
  | Readonly<{
      status: "ready";
      /** null means that both weighted win rates are exactly equal. */
      leaderTeamId: string | null;
      percentagePoints: number;
    }>
  | Readonly<{
      status: "unavailable";
      reason: "requires-two-teams" | "missing-team-data";
    }>;

export interface MapWinRateComparison {
  map: MapId;
  teams: TeamMapWinRateAggregate[];
  advantage: MapWinRateAdvantage;
}

/** FACEIT payloads may use either `dust2` or `de_dust2`. */
export const canonicalMapId = (value: MapId): MapId =>
  value.trim().replace(/^de_/iu, "").toLocaleLowerCase("en-US");

const isValidCount = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

const validMapRow = (row: PlayerMapStats, map: MapId): boolean =>
  canonicalMapId(row.map) === map &&
  isValidCount(row.matches) &&
  row.matches > 0 &&
  isValidCount(row.wins) &&
  row.wins <= row.matches;

/**
 * A player should normally have one row per map. If an upstream payload repeats
 * lifetime and alias rows, use the largest valid sample rather than counting the
 * same matches twice. The remaining tie-breakers make selection deterministic.
 */
const selectPlayerMapRow = (
  rows: readonly PlayerMapStats[] | undefined,
  map: MapId,
): PlayerMapStats | undefined =>
  rows
    ?.filter((row) => validMapRow(row, map))
    .sort(
      (left, right) =>
        right.matches - left.matches ||
        right.wins - left.wins ||
        canonicalMapId(left.map).localeCompare(canonicalMapId(right.map)),
    )[0];

const uniqueRoster = (team: MatchTeam): MatchTeam["players"] => {
  const ids = new Set<string>();
  return team.players.filter((player) => {
    if (ids.has(player.id)) return false;
    ids.add(player.id);
    return true;
  });
};

/** Aggregate one roster on one map, weighting every player's rate by their sample size. */
export const aggregateTeamMapWinRate = (
  team: MatchTeam,
  rawMap: MapId,
  playerMapStats: PlayerMapStatsLookup,
): TeamMapWinRateAggregate => {
  const map = canonicalMapId(rawMap);
  const players = uniqueRoster(team);
  let knownPlayers = 0;
  let sampleMatches = 0;
  let wins = 0;

  for (const player of players) {
    const row = selectPlayerMapRow(playerMapStats.get(player.id), map);
    if (!row) continue;
    const nextMatches = sampleMatches + row.matches;
    const nextWins = wins + row.wins;
    // Avoid silently returning an imprecise percentage for corrupt/unbounded payloads.
    if (!Number.isSafeInteger(nextMatches) || !Number.isSafeInteger(nextWins)) continue;
    knownPlayers += 1;
    sampleMatches = nextMatches;
    wins = nextWins;
  }

  const totalPlayers = players.length;
  const base: TeamMapWinRateBase = {
    teamId: team.id,
    map,
    knownPlayers,
    totalPlayers,
    coverage: totalPlayers > 0 ? knownPlayers / totalPlayers : null,
    sampleMatches,
  };
  if (team.name !== undefined) base.teamName = team.name;

  if (sampleMatches === 0) {
    return {
      ...base,
      status: "unavailable",
      sampleMatches: 0,
      reason: totalPlayers === 0 ? "no-players" : "no-map-data",
    };
  }

  return {
    ...base,
    status: "ready",
    wins,
    winRate: (wins * 100) / sampleMatches,
  };
};

const compareAdvantage = (teams: readonly TeamMapWinRateAggregate[]): MapWinRateAdvantage => {
  if (teams.length !== 2) return { status: "unavailable", reason: "requires-two-teams" };
  const left = teams[0];
  const right = teams[1];
  if (left?.status !== "ready" || right?.status !== "ready") {
    return { status: "unavailable", reason: "missing-team-data" };
  }

  const comparison = left.wins * right.sampleMatches - right.wins * left.sampleMatches;
  return {
    status: "ready",
    leaderTeamId: comparison === 0 ? null : comparison > 0 ? left.teamId : right.teamId,
    percentagePoints: Math.abs(left.winRate - right.winRate),
  };
};

const comparisonMaps = (match: MatchContext): MapId[] => {
  const result: MapId[] = [];
  const seen = new Set<MapId>();
  for (const rawMap of [match.selectedMap, ...match.mapPool]) {
    if (rawMap === undefined) continue;
    const map = canonicalMapId(rawMap);
    if (!map || seen.has(map)) continue;
    seen.add(map);
    result.push(map);
  }
  return result;
};

/**
 * Compare all maps in a match room. The selected map is returned first, followed
 * by the remaining map-pool order. Missing samples stay explicitly unavailable.
 */
export const compareTeamMapWinRates = (
  match: MatchContext,
  playerMapStats: PlayerMapStatsLookup,
): MapWinRateComparison[] =>
  comparisonMaps(match).map((map) => {
    const teams = match.teams.map((team) => aggregateTeamMapWinRate(team, map, playerMapStats));
    return { map, teams, advantage: compareAdvantage(teams) };
  });
