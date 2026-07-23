import { describe, expect, it } from "vitest";

import type { PlayerMatch } from "@eloscope/core";

import {
  buildProfileStatsModel,
  PROFILE_STATS_MATCH_WINDOW,
} from "../src/profile-stats-model.js";

const BASE_TIME = Date.parse("2026-07-23T12:00:00.000Z");

const makeMatch = (
  index: number,
  overrides: Partial<PlayerMatch> = {},
): PlayerMatch => ({
  id: overrides.id ?? `match-${index}`,
  playerId: overrides.playerId ?? "player-1",
  game: overrides.game ?? "cs2",
  mode: overrides.mode ?? "5v5",
  status: overrides.status ?? "finished",
  finishedAt: overrides.finishedAt ?? BASE_TIME - index * 60_000,
  result: overrides.result ?? (index % 3 === 0 ? "loss" : "win"),
  map: overrides.map ?? (index % 2 === 0 ? "dust2" : "mirage"),
  roundsPlayed: overrides.roundsPlayed ?? 20,
  kills: overrides.kills ?? 16,
  assists: overrides.assists ?? 4,
  deaths: overrides.deaths ?? 10,
  damage: overrides.damage ?? 1_800,
  headshots: overrides.headshots ?? 8,
  firstKills: overrides.firstKills ?? 2,
  survivedRounds: overrides.survivedRounds ?? 10,
});

describe("buildProfileStatsModel", () => {
  it("uses exactly the newest 20 unique completed CS2 5v5 matches", () => {
    const recent = Array.from({ length: 24 }, (_, index) => makeMatch(index));
    const duplicateNewest = makeMatch(99, {
      id: "match-0",
      finishedAt: BASE_TIME - 100_000,
      kills: 999,
    });
    const ignored = [
      makeMatch(100, { id: "wrong-game", game: "csgo", finishedAt: BASE_TIME + 3_000 }),
      makeMatch(101, { id: "ongoing", status: "ongoing", finishedAt: BASE_TIME + 2_000 }),
      makeMatch(102, { id: "wrong-mode", mode: "2v2", finishedAt: BASE_TIME + 1_000 }),
    ];
    const originalOrder = [...recent, duplicateNewest, ...ignored].reverse();
    const originalIds = originalOrder.map(({ id }) => id);

    const model = buildProfileStatsModel(originalOrder);

    expect(PROFILE_STATS_MATCH_WINDOW).toBe(20);
    expect(model.window).toBe(20);
    expect(model.sampleSize).toBe(20);
    expect(model.average.kills).toBe(16);
    expect(model.maps.reduce((sum, row) => sum + row.matches, 0)).toBe(20);
    expect(model.roleAnalysis).toMatchObject({ status: "known", sampleSize: 20 });
    expect(originalOrder.map(({ id }) => id)).toEqual(originalIds);
  });

  it("calculates overview, per-round and map metrics from the selected sample", () => {
    const model = buildProfileStatsModel([
      makeMatch(0, {
        map: "dust2",
        result: "win",
        roundsPlayed: 20,
        kills: 20,
        assists: 6,
        deaths: 10,
        damage: 2_000,
        headshots: 10,
        firstKills: 3,
        survivedRounds: 10,
      }),
      makeMatch(1, {
        map: "mirage",
        result: "loss",
        roundsPlayed: 20,
        kills: 10,
        assists: 4,
        deaths: 15,
        damage: 1_000,
        headshots: 5,
        firstKills: 1,
        survivedRounds: 5,
      }),
    ]);

    expect(model).toMatchObject({
      sampleSize: 2,
      wins: 1,
      losses: 1,
      winRate: 50,
      average: { kills: 15, deaths: 12.5, assists: 5 },
      kd: 1.2,
      kr: 0.75,
      adr: 75,
      survivalRate: 37.5,
      assistsPerRound: 0.25,
      headshots: { coverage: 1, coveredMatches: 2, value: 50 },
      firstKills: { coverage: 1, coveredMatches: 2, total: 4, rate: 0.1 },
    });
    expect(model.maps).toEqual([
      {
        map: "dust2",
        matches: 1,
        wins: 1,
        losses: 0,
        winRate: 100,
        averageKills: 20,
        kd: 2,
        kr: 1,
        adr: 100,
      },
      {
        map: "mirage",
        matches: 1,
        wins: 0,
        losses: 1,
        winRate: 0,
        averageKills: 10,
        kd: 10 / 15,
        kr: 0.5,
        adr: 50,
      },
    ]);
  });

  it("reports optional-stat coverage and never turns unavailable values into zero", () => {
    const known = makeMatch(0, {
      roundsPlayed: 10,
      kills: 4,
      headshots: 99,
      firstKills: 99,
    });
    const unknown = makeMatch(1, {
      roundsPlayed: 30,
      kills: 12,
    });
    delete unknown.headshots;
    delete unknown.firstKills;

    const model = buildProfileStatsModel([known, unknown]);

    expect(model.headshots).toEqual({
      coverage: 0.25,
      coveredMatches: 1,
      value: 100,
    });
    expect(model.firstKills).toEqual({
      coverage: 0.25,
      coveredMatches: 1,
      total: 4,
      rate: 0.4,
    });

    const withoutOptional = [makeMatch(2), makeMatch(3)];
    for (const row of withoutOptional) {
      delete row.headshots;
      delete row.firstKills;
    }
    const unavailable = buildProfileStatsModel(withoutOptional);
    expect(unavailable.headshots).toEqual({
      coverage: 0,
      coveredMatches: 0,
      value: null,
    });
    expect(unavailable.firstKills).toEqual({
      coverage: 0,
      coveredMatches: 0,
      total: null,
      rate: null,
    });
  });

  it("derives survival from deaths when survived rounds are absent", () => {
    const row = makeMatch(0, {
      roundsPlayed: 20,
      deaths: 7,
    });
    delete row.survivedRounds;

    expect(buildProfileStatsModel([row]).survivalRate).toBe(65);
  });

  it("uses null derived values for an empty sample and omits unsupported screenshot metrics", () => {
    const model = buildProfileStatsModel([
      makeMatch(0, { game: "csgo" }),
    ]);

    expect(model).toMatchObject({
      sampleSize: 0,
      wins: 0,
      losses: 0,
      winRate: null,
      average: { kills: null, deaths: null, assists: null },
      kd: null,
      kr: null,
      adr: null,
      survivalRate: null,
      assistsPerRound: null,
      maps: [],
      roleAnalysis: {
        status: "unknown",
        reason: "insufficient-matches",
        sampleSize: 0,
        requiredMatches: 20,
      },
    });
    expect(model).not.toHaveProperty("mvps");
    expect(model).not.toHaveProperty("clutches");
    expect(model).not.toHaveProperty("utilityDamage");
    expect(model).not.toHaveProperty("multiKills");
  });

  it("keeps zero-death K/D unavailable instead of inventing a finite ratio", () => {
    const model = buildProfileStatsModel([
      makeMatch(0, { kills: 25, deaths: 0 }),
    ]);

    expect(model.kd).toBeNull();
    expect(model.maps[0]?.kd).toBeNull();
  });
});
