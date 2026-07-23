import { aggregatePlayerMatches } from "./aggregate.js";
import { calculateFormBattery } from "./battery.js";
import { eligibleMatches, toEpochMs } from "./matches.js";
import type { MatchTeam, PlayerMatch, StatsWindow } from "./types.js";

export const MIN_TEAM_SUMMARY_PLAYERS = 3;
export const MIN_TEAM_SUMMARY_MATCHES_PER_PLAYER = 5;

export type TeamPerformanceSummary = Readonly<{
  teamId: string;
  window: StatsWindow;
  playersTotal: number;
  statsPlayers: number;
  formPlayers: number;
  eloPlayers: number;
  sampledMatches: number;
  historyConfidence: number;
  formReliability: number;
  averageElo?: number;
  form?: number;
  firepower?: number;
  averageKills?: number;
  kd?: number;
  winRate?: number;
}>;

export type TeamWinChanceResult =
  | Readonly<{
      status: "known";
      first: Readonly<{ teamId: string; chance: number }>;
      second: Readonly<{ teamId: string; chance: number }>;
      confidence: number;
      signals: readonly ("elo" | "history" | "form")[];
    }>
  | Readonly<{
      status: "unknown";
      reason: "same-team" | "insufficient-coverage";
    }>;

export type TeamPerformanceOptions = Readonly<{
  now?: string | number | Date;
  currentMatchId?: string;
}>;

type PlayerPerformance = Readonly<{
  matches: number;
  averageKills: number;
  averageDeaths: number;
  kr: number;
  adr: number;
  winRate: number;
  confidence: number;
}>;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const positiveFinite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

const requiredCoverage = (playersTotal: number): number =>
  Math.max(MIN_TEAM_SUMMARY_PLAYERS, Math.ceil(playersTotal * 0.6));

const canonicalMatch = (match: PlayerMatch): string => JSON.stringify([
  toEpochMs(match.finishedAt),
  match.result,
  match.roundsPlayed,
  match.kills,
  match.assists,
  match.deaths,
  match.damage,
  match.headshots ?? null,
  match.firstKills ?? null,
  match.survivedRounds ?? null,
]);

/**
 * Returns newest-first unique eligible rows. A player history containing two
 * incompatible representations of one match id is rejected instead of letting
 * an arbitrary duplicate influence the team estimate.
 */
const trustworthyMatches = (
  matches: readonly PlayerMatch[],
  currentMatchId?: string,
): PlayerMatch[] | undefined => {
  const canonicalById = new Map<string, string>();
  const result: PlayerMatch[] = [];
  const sorted = eligibleMatches(matches)
    .filter((match) => match.id !== currentMatchId)
    .sort((left, right) =>
      toEpochMs(right.finishedAt) - toEpochMs(left.finishedAt) || left.id.localeCompare(right.id));
  for (const match of sorted) {
    const canonical = canonicalMatch(match);
    const previous = canonicalById.get(match.id);
    if (previous !== undefined) {
      if (previous !== canonical) return undefined;
      continue;
    }
    canonicalById.set(match.id, canonical);
    result.push(match);
  }
  return result;
};

const playerPerformance = (
  trustworthy: readonly PlayerMatch[],
  window: StatsWindow,
): PlayerPerformance | undefined => {
  const selected = trustworthy.slice(0, window);
  if (selected.length < MIN_TEAM_SUMMARY_MATCHES_PER_PLAYER) return undefined;
  const aggregate = aggregatePlayerMatches(selected, window);
  return {
    matches: aggregate.matches,
    averageKills: aggregate.kills / aggregate.matches,
    averageDeaths: aggregate.deaths / aggregate.matches,
    kr: aggregate.kr,
    adr: aggregate.adr,
    winRate: aggregate.winRate,
    confidence: Math.min(1, aggregate.matches / window),
  };
};

/**
 * Bounded absolute 0–100 recent-performance scale. A score near 50 represents
 * 15 AVG kills, 1.00 K/D, 0.70 K/R and 75 ADR. tanh prevents one outlier from
 * dominating the whole team.
 */
const firepowerScore = (players: readonly PlayerPerformance[]): number => {
  const averageKills = average(players.map((player) => player.averageKills));
  const averageDeaths = average(players.map((player) => player.averageDeaths));
  const kd = averageDeaths > 0 ? averageKills / averageDeaths : averageKills;
  const kr = average(players.map((player) => player.kr));
  const adr = average(players.map((player) => player.adr));
  const normalized =
    0.25 * ((averageKills - 15) / 5)
    + 0.3 * ((kr - 0.7) / 0.15)
    + 0.25 * ((adr - 75) / 20)
    + 0.2 * ((kd - 1) / 0.3);
  return Math.round(clamp(50 + 45 * Math.tanh(normalized), 0, 100));
};

export const calculateTeamPerformanceSummary = (
  team: MatchTeam,
  histories: ReadonlyMap<string, readonly PlayerMatch[]>,
  window: StatsWindow,
  options: TeamPerformanceOptions = {},
): TeamPerformanceSummary => {
  const performances: PlayerPerformance[] = [];
  const formScores: number[] = [];
  const formConfidences: number[] = [];
  let sampledMatches = 0;

  const rosterIdCounts = new Map<string, number>();
  for (const player of team.players) {
    rosterIdCounts.set(player.id, (rosterIdCounts.get(player.id) ?? 0) + 1);
  }
  const trustworthyPlayers = team.players.filter((player) => rosterIdCounts.get(player.id) === 1);

  for (const player of trustworthyPlayers) {
    const rows = histories.get(player.id);
    if (!rows) continue;
    const trustworthy = trustworthyMatches(rows, options.currentMatchId);
    if (!trustworthy) continue;
    const performance = playerPerformance(trustworthy, window);
    if (performance) {
      performances.push(performance);
      sampledMatches += performance.matches;
    }
    const battery = calculateFormBattery(
      trustworthy,
      options.now === undefined ? {} : { now: options.now },
    );
    if (battery.status === "known" && battery.score !== null) {
      formScores.push(battery.score);
      formConfidences.push(battery.confidence);
    }
  }

  const elos = trustworthyPlayers.map((player) => player.elo).filter(positiveFinite);
  const declaredEloKnown =
    Number.isInteger(team.eloKnown)
    && (team.eloKnown as number) > 0
    && (team.eloKnown as number) <= team.players.length
    && positiveFinite(team.averageElo)
      ? team.eloKnown as number
      : 0;
  const eloPlayers = Math.max(elos.length, declaredEloKnown);
  const averageElo = declaredEloKnown > elos.length
    ? team.averageElo
    : elos.length
      ? average(elos)
      : undefined;
  const coverageNeeded = requiredCoverage(team.players.length);
  const hasStatsCoverage = performances.length >= coverageNeeded;
  const hasFormCoverage = formScores.length >= coverageNeeded;
  const hasEloCoverage = eloPlayers >= coverageNeeded && averageElo !== undefined;
  const common = {
    teamId: team.id,
    window,
    playersTotal: team.players.length,
    statsPlayers: performances.length,
    formPlayers: formScores.length,
    eloPlayers,
    sampledMatches,
    historyConfidence: team.players.length
      ? performances.reduce((sum, performance) => sum + performance.confidence, 0) / team.players.length
      : 0,
    formReliability: team.players.length
      ? formConfidences.reduce((sum, confidence) => sum + confidence, 0) / team.players.length
      : 0,
  };
  return {
    ...common,
    ...(hasStatsCoverage
      ? {
          averageKills: average(performances.map((player) => player.averageKills)),
          kd: (() => {
            const deaths = average(performances.map((player) => player.averageDeaths));
            const kills = average(performances.map((player) => player.averageKills));
            return deaths > 0 ? kills / deaths : kills;
          })(),
          winRate: average(performances.map((player) => player.winRate)),
          firepower: firepowerScore(performances),
        }
      : {}),
    ...(hasFormCoverage ? { form: Math.round(average(formScores)) } : {}),
    ...(hasEloCoverage ? { averageElo: Math.round(averageElo) } : {}),
  };
};

/**
 * Confidence-weighted heuristic. Elo uses its standard log-odds conversion;
 * recent win rate, firepower and form contribute only in proportion to the
 * data available for both teams. Missing components add no signal.
 */
export const calculateTeamWinChances = (
  first: TeamPerformanceSummary,
  second: TeamPerformanceSummary,
): TeamWinChanceResult => {
  if (first.teamId === second.teamId) return { status: "unknown", reason: "same-team" };
  const hasEloSignal =
    first.eloPlayers >= requiredCoverage(first.playersTotal)
    && second.eloPlayers >= requiredCoverage(second.playersTotal)
    && first.averageElo !== undefined
    && second.averageElo !== undefined;
  const hasHistorySignal =
    first.statsPlayers >= requiredCoverage(first.playersTotal)
    && second.statsPlayers >= requiredCoverage(second.playersTotal)
    && first.firepower !== undefined
    && second.firepower !== undefined
    && first.winRate !== undefined
    && second.winRate !== undefined;
  if (!hasEloSignal && !hasHistorySignal) {
    return { status: "unknown", reason: "insufficient-coverage" };
  }

  const eloConfidence = hasEloSignal
    ? Math.min(
        first.eloPlayers / Math.max(1, first.playersTotal),
        second.eloPlayers / Math.max(1, second.playersTotal),
      )
    : 0;
  const historyConfidence = hasHistorySignal
    ? Math.min(first.historyConfidence, second.historyConfidence)
    : 0;
  const hasFormSignal =
    first.formPlayers >= requiredCoverage(first.playersTotal)
    && second.formPlayers >= requiredCoverage(second.playersTotal)
    && first.form !== undefined
    && second.form !== undefined;
  const formConfidence = hasFormSignal
    ? Math.min(first.formReliability, second.formReliability)
    : 0;

  let logOdds = 0;
  if (hasEloSignal) {
    logOdds += eloConfidence
      * Math.log(10)
      * ((first.averageElo as number) - (second.averageElo as number))
      / 400;
  }
  if (hasHistorySignal) {
    logOdds += historyConfidence * (
      1.25 * (((first.winRate as number) - (second.winRate as number)) / 100)
      + 0.9 * (((first.firepower as number) - (second.firepower as number)) / 100)
    );
  }
  if (hasFormSignal) {
    logOdds += formConfidence
      * 0.75
      * (((first.form as number) - (second.form as number)) / 100);
  }
  const firstChance = Math.round(100 / (1 + Math.exp(-clamp(logOdds, -3, 3))));
  const confidence = clamp(
    (eloConfidence + 2 * historyConfidence + formConfidence) / 4,
    0,
    1,
  );

  return {
    status: "known",
    first: { teamId: first.teamId, chance: firstChance },
    second: { teamId: second.teamId, chance: 100 - firstChance },
    confidence,
    signals: [
      ...(hasEloSignal ? ["elo" as const] : []),
      ...(hasHistorySignal ? ["history" as const] : []),
      ...(hasFormSignal && formConfidence > 0 ? ["form" as const] : []),
    ],
  };
};
