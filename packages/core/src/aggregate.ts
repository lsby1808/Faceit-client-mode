import { eligibleMatches } from "./matches.js";
import type { MapId, PlayerMatch, StatsWindow } from "./types.js";

export interface MapAggregate {
  map: MapId;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  kd: number;
  kr: number;
  adr: number;
}

export interface PlayerAggregate {
  window: StatsWindow;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  assists: number;
  deaths: number;
  roundsPlayed: number;
  damage: number;
  winRate: number;
  kd: number;
  kr: number;
  adr: number;
  headshotPercent: number;
  contribution?: number;
  maps: MapAggregate[];
  bestMap?: MapAggregate;
  worstMap?: MapAggregate;
}

const finiteNonNegative = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;

const safeDivide = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

const safeKillDeathRatio = (kills: number, deaths: number): number =>
  deaths > 0 ? kills / deaths : kills > 0 ? kills : 0;

interface Totals {
  matches: number;
  wins: number;
  kills: number;
  assists: number;
  deaths: number;
  rounds: number;
  damage: number;
}

const accumulate = (matches: readonly PlayerMatch[]): Totals =>
  matches.reduce<Totals>(
    (total, match) => ({
      matches: total.matches + 1,
      wins: total.wins + (match.result === "win" ? 1 : 0),
      kills: total.kills + finiteNonNegative(match.kills),
      assists: total.assists + finiteNonNegative(match.assists),
      deaths: total.deaths + finiteNonNegative(match.deaths),
      rounds: total.rounds + finiteNonNegative(match.roundsPlayed),
      damage: total.damage + finiteNonNegative(match.damage),
    }),
    { matches: 0, wins: 0, kills: 0, assists: 0, deaths: 0, rounds: 0, damage: 0 },
  );

const toMapAggregate = (map: MapId, matches: readonly PlayerMatch[]): MapAggregate => {
  const totals = accumulate(matches);
  return {
    map,
    matches: totals.matches,
    wins: totals.wins,
    losses: totals.matches - totals.wins,
    winRate: safeDivide(totals.wins * 100, totals.matches),
    kd: safeKillDeathRatio(totals.kills, totals.deaths),
    kr: safeDivide(totals.kills, totals.rounds),
    adr: safeDivide(totals.damage, totals.rounds),
  };
};

const mapRank = (left: MapAggregate, right: MapAggregate): number =>
  right.winRate - left.winRate || right.matches - left.matches || right.kd - left.kd || left.map.localeCompare(right.map);

export const aggregatePlayerMatches = (
  matches: readonly PlayerMatch[],
  window: StatsWindow = 30,
): PlayerAggregate => {
  const selected = eligibleMatches(matches, window);
  const totals = accumulate(selected);
  const mapGroups = new Map<MapId, PlayerMatch[]>();

  for (const match of selected) {
    if (!match.map) continue;
    const group = mapGroups.get(match.map) ?? [];
    group.push(match);
    mapGroups.set(match.map, group);
  }

  const maps = [...mapGroups.entries()].map(([map, rows]) => toMapAggregate(map, rows)).sort(mapRank);
  const knownContributions = selected
    .map((match) => match.fcr)
    .filter((value): value is number => value !== undefined && Number.isFinite(value));
  const contribution = knownContributions.length
    ? knownContributions.reduce((sum, value) => sum + value, 0) / knownContributions.length
    : undefined;

  const result: PlayerAggregate = {
    window,
    matches: totals.matches,
    wins: totals.wins,
    losses: totals.matches - totals.wins,
    kills: totals.kills,
    assists: totals.assists,
    deaths: totals.deaths,
    roundsPlayed: totals.rounds,
    damage: totals.damage,
    winRate: safeDivide(totals.wins * 100, totals.matches),
    kd: safeKillDeathRatio(totals.kills, totals.deaths),
    kr: safeDivide(totals.kills, totals.rounds),
    adr: safeDivide(totals.damage, totals.rounds),
    headshotPercent: safeDivide(
      selected.reduce((sum, match) => sum + finiteNonNegative(match.headshots), 0) * 100,
      totals.kills,
    ),
    maps,
  };

  if (contribution !== undefined) result.contribution = contribution;
  const bestMap = maps[0];
  const worstMap = [...maps].sort((left, right) => -mapRank(left, right))[0];
  if (bestMap) result.bestMap = bestMap;
  if (worstMap) result.worstMap = worstMap;
  return result;
};
