import { describe, expect, it } from "vitest";

import { aggregatePlayerMatches, eligibleMatches, isCompletedCs2FiveVFive } from "../src/index.js";
import { makeMatch } from "./fixtures.js";

describe("completed CS2 5v5 eligibility", () => {
  it("accepts completed CS2 5v5 rows and rejects every other queue/state", () => {
    expect(isCompletedCs2FiveVFive(makeMatch())).toBe(true);
    expect(isCompletedCs2FiveVFive(makeMatch({ status: "COMPLETED" }))).toBe(true);
    expect(isCompletedCs2FiveVFive(makeMatch({ game: "csgo" }))).toBe(false);
    expect(isCompletedCs2FiveVFive(makeMatch({ mode: "2v2" }))).toBe(false);
    expect(isCompletedCs2FiveVFive(makeMatch({ status: "ongoing" }))).toBe(false);
    expect(isCompletedCs2FiveVFive(makeMatch({ finishedAt: "not-a-date" }))).toBe(false);
  });

  it("accepts epoch seconds and rejects incomplete or corrupt stat rows", () => {
    const validSeconds = makeMatch({ finishedAt: 1_750_000_000 });
    expect(isCompletedCs2FiveVFive(validSeconds)).toBe(true);
    expect(isCompletedCs2FiveVFive(makeMatch({ roundsPlayed: 0 }))).toBe(false);
    expect(isCompletedCs2FiveVFive(makeMatch({ damage: Number.NaN }))).toBe(false);
    expect(isCompletedCs2FiveVFive(makeMatch({ kills: -1 }))).toBe(false);
  });

  it("sorts newest first before applying a stats window", () => {
    const rows = [
      makeMatch({ id: "old", finishedAt: "2026-07-01T00:00:00Z" }),
      makeMatch({ id: "new", finishedAt: "2026-07-20T00:00:00Z" }),
    ];
    expect(eligibleMatches(rows).map(({ id }) => id)).toEqual(["new", "old"]);
  });
});

describe("aggregatePlayerMatches", () => {
  it("aggregates only eligible rows and derives map rankings", () => {
    const result = aggregatePlayerMatches(
      [
        makeMatch({
          id: "1",
          map: "de_mirage",
          result: "win",
          kills: 20,
          deaths: 10,
          assists: 6,
          damage: 2_000,
          roundsPlayed: 20,
          headshots: 10,
          fcr: 24.5,
        }),
        makeMatch({
          id: "2",
          map: "de_ancient",
          result: "loss",
          kills: 10,
          deaths: 20,
          assists: 4,
          damage: 1_000,
          roundsPlayed: 20,
          headshots: 5,
          fcr: 15.5,
        }),
        makeMatch({ id: "ignored", game: "csgo", kills: 999, damage: 999_999 }),
      ],
      30,
    );

    expect(result).toMatchObject({
      matches: 2,
      wins: 1,
      losses: 1,
      kills: 30,
      assists: 10,
      deaths: 30,
      roundsPlayed: 40,
      winRate: 50,
      kd: 1,
      kr: 0.75,
      adr: 75,
      headshotPercent: 50,
      contribution: 20,
    });
    expect(result.bestMap?.map).toBe("de_mirage");
    expect(result.worstMap?.map).toBe("de_ancient");
  });

  it("returns honest zero aggregates for an empty/restricted dataset", () => {
    const result = aggregatePlayerMatches([], 5);
    expect(result.matches).toBe(0);
    expect(result.maps).toEqual([]);
    expect(result).not.toHaveProperty("bestMap");
    expect(result).not.toHaveProperty("contribution");
  });
});
