import { eligibleMatches } from "./matches.js";
import type { PlayerMatch } from "./types.js";

/** Roles always use their own fixed history window, independent of the UI stats window. */
export const ROLE_MATCH_WINDOW = 20 as const;

export type PlayerRole = "sniper" | "entry" | "support" | "anchor" | "rifler";

export interface PlayerRoleMetrics {
  /** Kills per round. */
  kr: number;
  /** Average damage per round. */
  adr: number;
  /** Assists per round. */
  assistRate: number;
  /** Aggregate kill/death ratio. */
  kd: number;
  /** Headshots divided by kills in rows that expose headshots. */
  headshotRate?: number;
  /** First kills per round in rows that expose first kills. */
  firstKillRate?: number;
  /** Survived rounds divided by all rounds. */
  survivalRate: number;
  /** Stability of per-match K/R, from 0 (volatile) to 1 (stable). */
  consistency: number;
  /** Share of rounds whose rows expose headshots. */
  headshotCoverage: number;
  /** Share of rounds whose rows expose first kills. */
  firstKillCoverage: number;
}

export type PlayerRoleScores = Record<PlayerRole, number | null>;

export type PlayerRoleAnalysis =
  | Readonly<{
      status: "unknown";
      reason: "insufficient-matches";
      sampleSize: number;
      requiredMatches: typeof ROLE_MATCH_WINDOW;
    }>
  | Readonly<{
      status: "known";
      role: PlayerRole;
      /** Heuristic confidence from 0 to 1. */
      confidence: number;
      sampleSize: typeof ROLE_MATCH_WINDOW;
      requiredMatches: typeof ROLE_MATCH_WINDOW;
      metrics: Readonly<PlayerRoleMetrics>;
      /** A null score means the verified payload lacks metrics required for that role. */
      scores: Readonly<PlayerRoleScores>;
    }>;

const OPTIONAL_COVERAGE_THRESHOLD = 0.8;
const ROLE_TIE_ORDER: readonly PlayerRole[] = ["rifler", "entry", "support", "anchor", "sniper"];

const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.max(minimum, Math.min(maximum, value));

const high = (value: number, low: number, highValue: number): number =>
  clamp((value - low) / (highValue - low));

const low = (value: number, lowValue: number, highValue: number): number =>
  1 - high(value, lowValue, highValue);

type ScorePart = Readonly<{ weight: number; value?: number }>;

const weightedScore = (parts: readonly ScorePart[]): number => {
  let weightedTotal = 0;
  let availableWeight = 0;
  for (const part of parts) {
    if (part.value === undefined) continue;
    weightedTotal += part.weight * clamp(part.value);
    availableWeight += part.weight;
  }
  return availableWeight > 0 ? clamp(weightedTotal / availableWeight) : 0;
};

const uniqueRecentMatches = (matches: readonly PlayerMatch[]): PlayerMatch[] => {
  const seen = new Set<string>();
  const selected: PlayerMatch[] = [];
  for (const match of eligibleMatches(matches)) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    selected.push(match);
    if (selected.length === ROLE_MATCH_WINDOW) break;
  }
  return selected;
};

const safeRatio = (numerator: number, denominator: number): number =>
  denominator > 0 ? numerator / denominator : 0;

const killDeathRatio = (kills: number, deaths: number): number =>
  deaths > 0 ? kills / deaths : kills > 0 ? kills : 0;

const calculateConsistency = (matches: readonly PlayerMatch[]): number => {
  const values = matches.map((match) => safeRatio(match.kills, match.roundsPlayed));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return 1 - clamp(coefficientOfVariation / 0.35);
};

const calculateMetrics = (matches: readonly PlayerMatch[]): PlayerRoleMetrics => {
  let rounds = 0;
  let kills = 0;
  let assists = 0;
  let deaths = 0;
  let damage = 0;
  let survivedRounds = 0;
  let headshotRounds = 0;
  let headshotKills = 0;
  let headshots = 0;
  let firstKillRounds = 0;
  let firstKills = 0;

  for (const match of matches) {
    rounds += match.roundsPlayed;
    kills += match.kills;
    assists += match.assists;
    deaths += match.deaths;
    damage += match.damage;
    survivedRounds += match.survivedRounds === undefined
      ? Math.max(0, match.roundsPlayed - Math.min(match.deaths, match.roundsPlayed))
      : Math.min(match.survivedRounds, match.roundsPlayed);

    if (match.headshots !== undefined) {
      headshotRounds += match.roundsPlayed;
      headshotKills += match.kills;
      headshots += Math.min(match.headshots, match.kills);
    }
    if (match.firstKills !== undefined) {
      firstKillRounds += match.roundsPlayed;
      firstKills += Math.min(match.firstKills, match.roundsPlayed);
    }
  }

  const headshotCoverage = safeRatio(headshotRounds, rounds);
  const firstKillCoverage = safeRatio(firstKillRounds, rounds);
  const metrics: PlayerRoleMetrics = {
    kr: safeRatio(kills, rounds),
    adr: safeRatio(damage, rounds),
    assistRate: safeRatio(assists, rounds),
    kd: killDeathRatio(kills, deaths),
    survivalRate: safeRatio(survivedRounds, rounds),
    consistency: calculateConsistency(matches),
    headshotCoverage,
    firstKillCoverage,
  };

  if (headshotCoverage >= OPTIONAL_COVERAGE_THRESHOLD) {
    metrics.headshotRate = safeRatio(headshots, headshotKills);
  }
  if (firstKillCoverage >= OPTIONAL_COVERAGE_THRESHOLD) {
    metrics.firstKillRate = safeRatio(firstKills, firstKillRounds);
  }
  return metrics;
};

const scoreRoles = (metrics: PlayerRoleMetrics): PlayerRoleScores => {
  const firstKillHigh = metrics.firstKillRate === undefined
    ? undefined
    : high(metrics.firstKillRate, 0.05, 0.14);
  const firstKillSniper = metrics.firstKillRate === undefined
    ? undefined
    : high(metrics.firstKillRate, 0.05, 0.12);
  const firstKillLow = metrics.firstKillRate === undefined
    ? undefined
    : low(metrics.firstKillRate, 0.03, 0.12);
  const headshotHigh = metrics.headshotRate === undefined
    ? undefined
    : high(metrics.headshotRate, 0.35, 0.65);
  const headshotLow = metrics.headshotRate === undefined
    ? undefined
    : low(metrics.headshotRate, 0.25, 0.55);

  const support = weightedScore([
    { weight: 0.45, value: high(metrics.assistRate, 0.12, 0.26) },
    { weight: 0.2, value: high(metrics.survivalRate, 0.28, 0.52) },
    { weight: 0.2, value: high(metrics.adr, 60, 90) },
    { weight: 0.15, ...(firstKillLow === undefined ? {} : { value: firstKillLow }) },
  ]);
  const anchor = weightedScore([
    { weight: 0.35, value: high(metrics.survivalRate, 0.3, 0.58) },
    { weight: 0.25, value: high(metrics.kd, 0.85, 1.3) },
    { weight: 0.2, ...(firstKillLow === undefined ? {} : { value: firstKillLow }) },
    { weight: 0.2, value: metrics.consistency },
  ]);
  const rifler = clamp(weightedScore([
    { weight: 0.35, ...(headshotHigh === undefined ? {} : { value: headshotHigh }) },
    { weight: 0.25, value: high(metrics.kr, 0.55, 0.85) },
    { weight: 0.2, value: high(metrics.adr, 65, 100) },
    { weight: 0.2, value: metrics.consistency },
  ]) + 0.05);

  return {
    entry: firstKillHigh === undefined ? null : weightedScore([
      { weight: 0.45, value: firstKillHigh },
      { weight: 0.25, value: high(metrics.kr, 0.55, 0.85) },
      { weight: 0.15, value: high(metrics.adr, 65, 100) },
      { weight: 0.15, value: low(metrics.survivalRate, 0.28, 0.5) },
    ]),
    sniper: firstKillSniper === undefined || headshotLow === undefined ? null : weightedScore([
      { weight: 0.3, value: firstKillSniper },
      { weight: 0.25, value: high(metrics.kd, 0.95, 1.5) },
      { weight: 0.2, value: high(metrics.survivalRate, 0.3, 0.55) },
      { weight: 0.25, value: headshotLow },
    ]),
    support,
    anchor,
    rifler,
  };
};

const coverageForRole = (role: PlayerRole, metrics: PlayerRoleMetrics): number => {
  switch (role) {
    case "entry":
      return metrics.firstKillCoverage;
    case "sniper":
      return Math.min(metrics.firstKillCoverage, metrics.headshotCoverage);
    case "support":
      return 0.85 + 0.15 * metrics.firstKillCoverage;
    case "anchor":
      return 0.8 + 0.2 * metrics.firstKillCoverage;
    case "rifler":
      return 0.65 + 0.35 * metrics.headshotCoverage;
  }
};

const roleConfidence = (
  role: PlayerRole,
  bestScore: number,
  secondScore: number,
  metrics: PlayerRoleMetrics,
): number => {
  const separation = high(bestScore - secondScore, 0.02, 0.25);
  const strength = high(bestScore, 0.45, 0.85);
  const coverage = coverageForRole(role, metrics);
  const confidence = clamp(0.35 + 0.35 * separation + 0.2 * strength + 0.1 * coverage, 0, 0.95);
  // Without a verified weapon-kill field, "sniper" remains an inferred play-style signal.
  return role === "sniper" ? Math.min(confidence, 0.75) : confidence;
};

/**
 * Infers a player's recent play style from exactly the 20 newest unique,
 * completed CS2 5v5 matches. It intentionally does not accept a UI stats
 * window, so changing the visible 5/10/30-match aggregate cannot change role.
 */
export const classifyPlayerRole = (matches: readonly PlayerMatch[]): PlayerRoleAnalysis => {
  const selected = uniqueRecentMatches(matches);
  if (selected.length < ROLE_MATCH_WINDOW) {
    return {
      status: "unknown",
      reason: "insufficient-matches",
      sampleSize: selected.length,
      requiredMatches: ROLE_MATCH_WINDOW,
    };
  }

  const metrics = calculateMetrics(selected);
  const scores = scoreRoles(metrics);
  const ranked = ROLE_TIE_ORDER
    .map((role) => ({ role, score: scores[role] }))
    .filter((entry): entry is { role: PlayerRole; score: number } => entry.score !== null)
    .sort((left, right) => right.score - left.score || ROLE_TIE_ORDER.indexOf(left.role) - ROLE_TIE_ORDER.indexOf(right.role));
  const winner = ranked[0] as { role: PlayerRole; score: number };
  const runnerUp = ranked[1] ?? winner;

  return {
    status: "known",
    role: winner.role,
    confidence: roleConfidence(winner.role, winner.score, runnerUp.score, metrics),
    sampleSize: ROLE_MATCH_WINDOW,
    requiredMatches: ROLE_MATCH_WINDOW,
    metrics,
    scores,
  };
};
