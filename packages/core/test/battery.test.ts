import { describe, expect, it } from "vitest";

import { batteryLevelForScore, calculateFormBattery, RECENT_WEIGHTS } from "../src/index.js";
import { makeMatch } from "./fixtures.js";

const NOW = Date.parse("2026-07-22T12:00:00.000Z");
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1_000).toISOString();

describe("calculateFormBattery", () => {
  it("normalizes both Unix seconds and JavaScript milliseconds", () => {
    const now = Date.UTC(2026, 6, 22);
    const recent = [
      makeMatch({ id: "seconds", finishedAt: Math.floor((now - 1_000) / 1_000) }),
      makeMatch({ id: "milliseconds", finishedAt: now - 2_000 }),
    ];
    const result = calculateFormBattery(recent, { now });
    expect(result.status).toBe("known");
    expect(result.recentCount).toBe(2);
  });
  it("uses newest-first recent weights and the accepted delta/confidence formula", () => {
    expect(RECENT_WEIGHTS).toEqual([1, 0.8, 0.64, 0.512, 0.4096]);
    const recent = Array.from({ length: 5 }, (_, index) =>
      makeMatch({
        id: `recent-${index}`,
        finishedAt: daysAgo(index + 1),
        roundsPlayed: 20,
        damage: 1_900,
        kills: 17,
        deaths: 10,
        result: "win",
      }),
    );
    const baseline = Array.from({ length: 20 }, (_, index) =>
      makeMatch({
        id: `baseline-${index}`,
        finishedAt: daysAgo(10 + index),
        roundsPlayed: 20,
        damage: 1_500,
        kills: 14,
        deaths: 14,
        result: index % 2 === 0 ? "win" : "loss",
      }),
    );

    const battery = calculateFormBattery([...baseline, ...recent], { now: NOW });
    const delta = 0.35 * (20 / 20) + 0.3 * (0.15 / 0.15) + 0.2 * (0.7 / 0.3) + 0.15 * (0.5 / 0.3);
    const rawScore = 50 + 45 * Math.tanh(delta);
    const confidence = (5 / 5) * (20 / 25);
    const expected = Math.round(50 + confidence * (rawScore - 50));

    expect(battery.status).toBe("known");
    expect(battery.recentCount).toBe(5);
    expect(battery.baselineCount).toBe(20);
    expect(battery.confidence).toBeCloseTo(confidence);
    expect(battery.score).toBe(expected);
    expect(battery.delta?.adr).toBeCloseTo(20);
    expect(battery.delta?.kr).toBeCloseTo(0.15);
    expect(battery.delta?.kd).toBeCloseTo(0.7);
    expect(battery.delta?.winRate).toBeCloseTo(0.5);
    expect(battery.level).toBe("cyan");
  });

  it("reports the actual baseline without blending it with an undocumented prior", () => {
    const recent = [
      makeMatch({ id: "r1", finishedAt: daysAgo(1), damage: 1_600, kills: 16, deaths: 12 }),
      makeMatch({ id: "r2", finishedAt: daysAgo(2), damage: 1_600, kills: 16, deaths: 12 }),
    ];
    const oneBaseline = makeMatch({
      id: "base",
      finishedAt: daysAgo(20),
      damage: 2_000,
      kills: 20,
      deaths: 10,
      result: "win",
    });
    const battery = calculateFormBattery([oneBaseline, ...recent], { now: NOW });

    expect(battery.baseline).toEqual({
      adr: 100,
      kr: 1,
      kd: 2,
      winRate: 1,
    });
    expect(battery.delta?.adr).toBe(-20);
    expect(battery.delta?.kr).toBeCloseTo(-0.2);
    expect(battery.delta?.kd).toBeCloseTo(16 / 12 - 2);
    expect(battery.delta?.winRate).toBe(0);
    expect(battery.confidence).toBeCloseTo((2 / 5) * (1 / 25));
  });

  it("uses the neutral reference only for scoring when the factual baseline is empty", () => {
    const recent = [
      makeMatch({ id: "r1", finishedAt: daysAgo(1), damage: 1_900, kills: 17, deaths: 10 }),
      makeMatch({ id: "r2", finishedAt: daysAgo(2), damage: 1_900, kills: 17, deaths: 10 }),
    ];
    const battery = calculateFormBattery(recent, { now: NOW });

    expect(battery).toMatchObject({
      status: "known",
      score: 50,
      recentCount: 2,
      baselineCount: 0,
      confidence: 0,
    });
    expect(battery.recent).toEqual({
      adr: 95,
      kr: 0.85,
      kd: 1.7,
      winRate: 1,
    });
    expect(battery).not.toHaveProperty("baseline");
    expect(battery).not.toHaveProperty("delta");
  });

  it("deduplicates match ids before selecting recent and baseline samples", () => {
    const matches = [
      makeMatch({
        id: "recent-duplicate",
        finishedAt: daysAgo(2),
        damage: 1_000,
        kills: 10,
        deaths: 10,
      }),
      makeMatch({
        id: "baseline-duplicate",
        finishedAt: daysAgo(11),
        damage: 1_000,
        kills: 10,
        deaths: 10,
      }),
      makeMatch({
        id: "recent-duplicate",
        finishedAt: daysAgo(1),
        damage: 2_000,
        kills: 20,
        deaths: 10,
      }),
      makeMatch({
        id: "baseline-duplicate",
        finishedAt: daysAgo(10),
        damage: 2_000,
        kills: 20,
        deaths: 10,
      }),
      makeMatch({ id: "recent-unique", finishedAt: daysAgo(3) }),
    ];

    const battery = calculateFormBattery(matches, { now: NOW });

    expect(battery.recentCount).toBe(2);
    expect(battery.baselineCount).toBe(1);
    expect(battery.recent?.adr).toBeCloseTo((100 + 0.8 * 75) / 1.8);
    expect(battery.baseline?.adr).toBe(100);
  });

  it("keeps metric units and all public numeric ranges bounded", () => {
    const recent = Array.from({ length: 5 }, (_, index) =>
      makeMatch({
        id: `recent-unit-${index}`,
        finishedAt: daysAgo(index + 1),
        result: index % 2 === 0 ? "win" : "loss",
      }),
    );
    const baseline = Array.from({ length: 25 }, (_, index) =>
      makeMatch({
        id: `baseline-unit-${index}`,
        finishedAt: daysAgo(index + 10),
        result: index < 10 ? "win" : "loss",
      }),
    );

    const battery = calculateFormBattery([...recent, ...baseline], { now: NOW });

    expect(battery.recent?.winRate).toBeGreaterThanOrEqual(0);
    expect(battery.recent?.winRate).toBeLessThanOrEqual(1);
    expect(battery.baseline?.winRate).toBe(10 / 25);
    expect(battery.delta?.winRate).toBeGreaterThanOrEqual(-1);
    expect(battery.delta?.winRate).toBeLessThanOrEqual(1);
    expect(battery.confidence).toBeGreaterThanOrEqual(0);
    expect(battery.confidence).toBeLessThanOrEqual(1);
    expect(battery.score).toBeGreaterThanOrEqual(0);
    expect(battery.score).toBeLessThanOrEqual(100);
    expect([
      battery.rawScore,
      battery.recent?.adr,
      battery.recent?.kr,
      battery.recent?.kd,
      battery.recent?.winRate,
      battery.baseline?.adr,
      battery.baseline?.kr,
      battery.baseline?.kd,
      battery.baseline?.winRate,
      battery.delta?.adr,
      battery.delta?.kr,
      battery.delta?.kd,
      battery.delta?.winRate,
    ].every((value) => value !== undefined && Number.isFinite(value))).toBe(true);
  });

  it("returns an unknown grey battery with fewer than two recent matches", () => {
    const battery = calculateFormBattery(
      [makeMatch({ finishedAt: daysAgo(1) }), makeMatch({ id: "old", finishedAt: daysAgo(8) })],
      { now: NOW },
    );
    expect(battery).toMatchObject({
      status: "unknown",
      score: null,
      level: "unknown",
      color: "#6b7280",
      recentCount: 1,
    });
  });

  it("maps the five documented color bands", () => {
    expect([0, 19].map(batteryLevelForScore)).toEqual(["red", "red"]);
    expect([20, 39].map(batteryLevelForScore)).toEqual(["orange", "orange"]);
    expect([40, 59].map(batteryLevelForScore)).toEqual(["yellow", "yellow"]);
    expect([60, 79].map(batteryLevelForScore)).toEqual(["green", "green"]);
    expect([80, 100].map(batteryLevelForScore)).toEqual(["cyan", "cyan"]);
  });
});
