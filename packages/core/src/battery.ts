import { eligibleMatches, toEpochMs } from "./matches.js";
import type { PlayerMatch } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1_000;
export const RECENT_WEIGHTS = [1, 0.8, 0.64, 0.512, 0.4096] as const;

export interface FormMetrics {
  adr: number;
  kr: number;
  kd: number;
  winRate: number;
}

export type BatteryLevel = "unknown" | "red" | "orange" | "yellow" | "green" | "cyan";

export interface FormBattery {
  status: "unknown" | "known";
  score: number | null;
  level: BatteryLevel;
  color: string;
  recentCount: number;
  baselineCount: number;
  confidence: number;
  rawScore?: number;
  recent?: FormMetrics;
  /** Actual metrics from the sampled baseline matches. Absent when no baseline match exists. */
  baseline?: FormMetrics;
  /** Actual recent minus actual baseline metrics. Absent when no baseline match exists. */
  delta?: FormMetrics;
}

export interface FormBatteryOptions {
  now?: string | number | Date;
}

const COLORS: Record<BatteryLevel, string> = {
  unknown: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  yellow: "#eab308",
  green: "#22c55e",
  cyan: "#22d3ee",
};

const REFERENCE_BASELINE: FormMetrics = {
  adr: 75,
  kr: 0.7,
  kd: 1,
  winRate: 0.5,
};

const nonNegative = (candidate: number): number =>
  Number.isFinite(candidate) && candidate > 0 ? candidate : 0;

const matchMetrics = (match: PlayerMatch): FormMetrics => {
  const rounds = nonNegative(match.roundsPlayed);
  const kills = nonNegative(match.kills);
  const deaths = nonNegative(match.deaths);
  return {
    adr: rounds > 0 ? nonNegative(match.damage) / rounds : 0,
    kr: rounds > 0 ? kills / rounds : 0,
    kd: deaths > 0 ? kills / deaths : kills,
    winRate: match.result === "win" ? 1 : 0,
  };
};

const averageMetrics = (matches: readonly PlayerMatch[], weights?: readonly number[]): FormMetrics => {
  if (!matches.length) return { ...REFERENCE_BASELINE };
  const totals = matches.reduce(
    (sum, match, index) => {
      const metric = matchMetrics(match);
      const weight = weights?.[index] ?? 1;
      return {
        weight: sum.weight + weight,
        adr: sum.adr + metric.adr * weight,
        kr: sum.kr + metric.kr * weight,
        kd: sum.kd + metric.kd * weight,
        winRate: sum.winRate + metric.winRate * weight,
      };
    },
    { weight: 0, adr: 0, kr: 0, kd: 0, winRate: 0 },
  );

  if (totals.weight <= 0) return { ...REFERENCE_BASELINE };
  return {
    adr: totals.adr / totals.weight,
    kr: totals.kr / totals.weight,
    kd: totals.kd / totals.weight,
    winRate: totals.winRate / totals.weight,
  };
};

const clamp = (candidate: number, min: number, max: number): number => Math.max(min, Math.min(max, candidate));

export const batteryLevelForScore = (score: number): Exclude<BatteryLevel, "unknown"> => {
  if (score < 20) return "red";
  if (score < 40) return "orange";
  if (score < 60) return "yellow";
  if (score < 80) return "green";
  return "cyan";
};

/**
 * Form score is centered at 50. Recent-vs-baseline deltas use fixed CS2 scales,
 * pass through tanh, and are pulled toward neutral by sample confidence.
 */
export const calculateFormBattery = (
  matches: readonly PlayerMatch[],
  options: FormBatteryOptions = {},
): FormBattery => {
  const now = options.now === undefined ? Date.now() : toEpochMs(options.now);
  const safeNow = Number.isFinite(now) ? now : Date.now();
  const ninetyDaysAgo = safeNow - 90 * DAY_MS;
  const sevenDaysAgo = safeNow - 7 * DAY_MS;
  const seenMatchIds = new Set<string>();
  const candidates = eligibleMatches(matches).filter((match) => {
    const finishedAt = toEpochMs(match.finishedAt);
    if (finishedAt < ninetyDaysAgo || finishedAt > safeNow || seenMatchIds.has(match.id)) return false;
    seenMatchIds.add(match.id);
    return true;
  });

  const recentIndexes = candidates
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => toEpochMs(match.finishedAt) >= sevenDaysAgo)
    .slice(0, 5);
  const recentIndexSet = new Set(recentIndexes.map(({ index }) => index));
  const recent = recentIndexes.map(({ match }) => match);
  const baseline = candidates.filter((_match, index) => !recentIndexSet.has(index)).slice(0, 25);

  if (recent.length < 2) {
    return {
      status: "unknown",
      score: null,
      level: "unknown",
      color: COLORS.unknown,
      recentCount: recent.length,
      baselineCount: baseline.length,
      confidence: 0,
    };
  }

  const recentMetrics = averageMetrics(recent, RECENT_WEIGHTS);
  const baselineMetrics = baseline.length ? averageMetrics(baseline) : undefined;
  const scoringBaseline = baselineMetrics ?? REFERENCE_BASELINE;
  const scoringDelta: FormMetrics = {
    adr: recentMetrics.adr - scoringBaseline.adr,
    kr: recentMetrics.kr - scoringBaseline.kr,
    kd: recentMetrics.kd - scoringBaseline.kd,
    winRate: recentMetrics.winRate - scoringBaseline.winRate,
  };
  const composite =
    0.35 * (scoringDelta.adr / 20) +
    0.3 * (scoringDelta.kr / 0.15) +
    0.2 * (scoringDelta.kd / 0.3) +
    0.15 * (scoringDelta.winRate / 0.3);
  const rawScore = 50 + 45 * Math.tanh(composite);
  const confidence = Math.min(1, recent.length / 5) * Math.min(1, baseline.length / 25);
  const score = Math.round(clamp(50 + confidence * (rawScore - 50), 0, 100));
  const level = batteryLevelForScore(score);

  const result: FormBattery = {
    status: "known",
    score,
    level,
    color: COLORS[level],
    recentCount: recent.length,
    baselineCount: baseline.length,
    confidence,
    rawScore,
    recent: recentMetrics,
  };
  if (baselineMetrics) {
    result.baseline = baselineMetrics;
    result.delta = scoringDelta;
  }
  return result;
};
