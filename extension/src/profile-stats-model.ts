import {
  classifyPlayerRole,
  eligibleMatches,
  type PlayerMatch,
  type PlayerRoleAnalysis,
} from "@eloscope/core";

export const PROFILE_STATS_MATCH_WINDOW = 20 as const;

export interface ProfileStatsAverage {
  readonly kills: number | null;
  readonly deaths: number | null;
  readonly assists: number | null;
}

export interface ProfileStatsCoveredPercent {
  /** Share of the selected rounds whose source rows expose this metric, from 0 to 1. */
  readonly coverage: number;
  readonly coveredMatches: number;
  /** Percentage from 0 to 100, or null when the source does not expose enough data. */
  readonly value: number | null;
}

export interface ProfileStatsFirstKills {
  /** Share of the selected rounds whose source rows expose first-kill data, from 0 to 1. */
  readonly coverage: number;
  readonly coveredMatches: number;
  /** Sum over covered rows only, or null when no row exposes first kills. */
  readonly total: number | null;
  /** First kills per covered round, or null when no covered round exists. */
  readonly rate: number | null;
}

export interface ProfileStatsMapRow {
  readonly map: string;
  readonly matches: number;
  readonly wins: number;
  readonly losses: number;
  readonly winRate: number;
  readonly averageKills: number;
  readonly kd: number | null;
  readonly kr: number;
  readonly adr: number;
}

/**
 * Truthful view-model for the embedded profile banner.
 *
 * It deliberately contains only metrics derivable from PlayerMatch. Screenshot
 * fields such as MVPs, utility damage, flash success, clutch and multi-kills
 * are omitted because the current FACEIT read adapter does not expose them.
 */
export interface ProfileStatsModel {
  readonly window: typeof PROFILE_STATS_MATCH_WINDOW;
  readonly sampleSize: number;
  readonly wins: number;
  readonly losses: number;
  /** Percentage from 0 to 100, or null for an empty sample. */
  readonly winRate: number | null;
  readonly average: Readonly<ProfileStatsAverage>;
  readonly kd: number | null;
  readonly kr: number | null;
  readonly adr: number | null;
  readonly headshots: Readonly<ProfileStatsCoveredPercent>;
  readonly firstKills: Readonly<ProfileStatsFirstKills>;
  /** Survived rounds as a percentage from 0 to 100, or null for an empty sample. */
  readonly survivalRate: number | null;
  readonly assistsPerRound: number | null;
  readonly maps: readonly Readonly<ProfileStatsMapRow>[];
  readonly roleAnalysis: PlayerRoleAnalysis;
}

interface Totals {
  matches: number;
  wins: number;
  rounds: number;
  kills: number;
  assists: number;
  deaths: number;
  damage: number;
  survivedRounds: number;
}

const safeRatio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null;

const percent = (numerator: number, denominator: number): number | null => {
  const ratio = safeRatio(numerator, denominator);
  return ratio === null ? null : ratio * 100;
};

const uniqueRecentMatches = (matches: readonly PlayerMatch[]): PlayerMatch[] => {
  const selected: PlayerMatch[] = [];
  const seen = new Set<string>();

  for (const match of eligibleMatches(matches)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    selected.push(match);
    if (selected.length === PROFILE_STATS_MATCH_WINDOW) break;
  }

  return selected;
};

const survivedRounds = (match: PlayerMatch): number => {
  if (match.survivedRounds !== undefined) {
    return Math.min(match.roundsPlayed, match.survivedRounds);
  }
  return Math.max(0, match.roundsPlayed - Math.min(match.roundsPlayed, match.deaths));
};

const addTotals = (totals: Totals, match: PlayerMatch): void => {
  totals.matches += 1;
  totals.wins += match.result === "win" ? 1 : 0;
  totals.rounds += match.roundsPlayed;
  totals.kills += match.kills;
  totals.assists += match.assists;
  totals.deaths += match.deaths;
  totals.damage += match.damage;
  totals.survivedRounds += survivedRounds(match);
};

const emptyTotals = (): Totals => ({
  matches: 0,
  wins: 0,
  rounds: 0,
  kills: 0,
  assists: 0,
  deaths: 0,
  damage: 0,
  survivedRounds: 0,
});

const buildMapRows = (matches: readonly PlayerMatch[]): ProfileStatsMapRow[] => {
  const groups = new Map<string, Totals>();

  for (const match of matches) {
    const map = typeof match.map === "string" ? match.map.trim() : "";
    if (!map) continue;
    const totals = groups.get(map) ?? emptyTotals();
    addTotals(totals, match);
    groups.set(map, totals);
  }

  return [...groups.entries()]
    .map(([map, totals]): ProfileStatsMapRow => ({
      map,
      matches: totals.matches,
      wins: totals.wins,
      losses: totals.matches - totals.wins,
      winRate: percent(totals.wins, totals.matches) ?? 0,
      averageKills: safeRatio(totals.kills, totals.matches) ?? 0,
      kd: safeRatio(totals.kills, totals.deaths),
      kr: safeRatio(totals.kills, totals.rounds) ?? 0,
      adr: safeRatio(totals.damage, totals.rounds) ?? 0,
    }))
    .sort((left, right) =>
      right.matches - left.matches
      || right.winRate - left.winRate
      || left.map.localeCompare(right.map));
};

export const buildProfileStatsModel = (
  matches: readonly PlayerMatch[],
): ProfileStatsModel => {
  const selected = uniqueRecentMatches(matches);
  const totals = emptyTotals();
  let headshotRounds = 0;
  let headshotMatches = 0;
  let headshotKills = 0;
  let headshots = 0;
  let firstKillRounds = 0;
  let firstKillMatches = 0;
  let firstKills = 0;

  for (const match of selected) {
    addTotals(totals, match);

    if (match.headshots !== undefined) {
      headshotRounds += match.roundsPlayed;
      headshotMatches += 1;
      headshotKills += match.kills;
      headshots += Math.min(match.headshots, match.kills);
    }
    if (match.firstKills !== undefined) {
      firstKillRounds += match.roundsPlayed;
      firstKillMatches += 1;
      firstKills += Math.min(match.firstKills, match.kills, match.roundsPlayed);
    }
  }

  return {
    window: PROFILE_STATS_MATCH_WINDOW,
    sampleSize: totals.matches,
    wins: totals.wins,
    losses: totals.matches - totals.wins,
    winRate: percent(totals.wins, totals.matches),
    average: {
      kills: safeRatio(totals.kills, totals.matches),
      deaths: safeRatio(totals.deaths, totals.matches),
      assists: safeRatio(totals.assists, totals.matches),
    },
    kd: safeRatio(totals.kills, totals.deaths),
    kr: safeRatio(totals.kills, totals.rounds),
    adr: safeRatio(totals.damage, totals.rounds),
    headshots: {
      coverage: safeRatio(headshotRounds, totals.rounds) ?? 0,
      coveredMatches: headshotMatches,
      value: percent(headshots, headshotKills),
    },
    firstKills: {
      coverage: safeRatio(firstKillRounds, totals.rounds) ?? 0,
      coveredMatches: firstKillMatches,
      total: firstKillMatches > 0 ? firstKills : null,
      rate: safeRatio(firstKills, firstKillRounds),
    },
    survivalRate: percent(totals.survivedRounds, totals.rounds),
    assistsPerRound: safeRatio(totals.assists, totals.rounds),
    maps: buildMapRows(selected),
    roleAnalysis: classifyPlayerRole(selected),
  };
};
