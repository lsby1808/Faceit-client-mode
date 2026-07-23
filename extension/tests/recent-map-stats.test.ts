import type { PlayerMatch } from "@eloscope/core";
import { describe, expect, it } from "vitest";

import { buildRecentPlayerMapStats } from "../src/recent-map-stats.js";

const BASE_TIME = Date.parse("2026-07-23T12:00:00.000Z");

const match = (
  index: number,
  overrides: Partial<PlayerMatch> = {},
): PlayerMatch => ({
  id: overrides.id ?? `match-${index}`,
  playerId: overrides.playerId ?? "player-1",
  game: overrides.game ?? "cs2",
  mode: overrides.mode ?? "5v5",
  status: overrides.status ?? "finished",
  finishedAt: overrides.finishedAt ?? BASE_TIME - index * 60_000,
  result: overrides.result ?? "win",
  map: overrides.map ?? "dust2",
  roundsPlayed: overrides.roundsPlayed ?? 20,
  kills: overrides.kills ?? 16,
  assists: overrides.assists ?? 4,
  deaths: overrides.deaths ?? 10,
  damage: overrides.damage ?? 1_800,
  headshots: overrides.headshots ?? 8,
  firstKills: overrides.firstKills ?? 2,
});

describe("buildRecentPlayerMapStats", () => {
  it("selects the newest unique eligible matches overall before grouping canonical map aliases", () => {
    const mapless = match(2);
    delete mapless.map;
    const input = [
      match(7, { map: "ancient", kills: 777 }),
      match(3, { map: "DE_DUST2", result: "loss", kills: 13 }),
      match(1, { id: "duplicate", map: "de_Dust2", kills: 20 }),
      match(6, { map: "inferno", kills: 666 }),
      match(0, { game: "csgo", map: "mirage", kills: 999 }),
      match(4, { map: "MIRAGE", kills: 14 }),
      match(99, {
        id: "duplicate",
        // This duplicate is inside the first five sorted candidates. The next
        // unique match must fill the freed slot after it is discarded.
        finishedAt: BASE_TIME - 90_000,
        map: "nuke",
        kills: 999,
      }),
      mapless,
      match(5, { map: "anubis", kills: 15 }),
    ];
    const originalOrder = input.map(({ id }) => id);

    const result = buildRecentPlayerMapStats(new Map([["player-1", input]]), 5);

    expect(input.map(({ id }) => id)).toEqual(originalOrder);
    expect(result.get("player-1")).toEqual([
      {
        map: "anubis",
        matches: 1,
        wins: 1,
        kills: 15,
        assists: 4,
        deaths: 10,
        roundsPlayed: 20,
        damage: 1_800,
        headshots: 8,
        firstKills: 2,
      },
      {
        map: "dust2",
        matches: 2,
        wins: 1,
        kills: 33,
        assists: 8,
        deaths: 20,
        roundsPlayed: 40,
        damage: 3_600,
        headshots: 16,
        firstKills: 4,
      },
      {
        map: "mirage",
        matches: 1,
        wins: 1,
        kills: 14,
        assists: 4,
        deaths: 10,
        roundsPlayed: 20,
        damage: 1_800,
        headshots: 8,
        firstKills: 2,
      },
    ]);
  });

  it("keeps optional aggregates only for maps with complete source coverage", () => {
    const dustMissingHeadshots = match(1, {
      playerId: "player-a",
      map: "dust2",
      result: "loss",
      headshots: undefined,
      firstKills: 1,
    });
    delete dustMissingHeadshots.headshots;
    const mirageMissingFirstKills = match(2, {
      playerId: "player-a",
      map: "mirage",
      headshots: 3,
      firstKills: undefined,
    });
    delete mirageMissingFirstKills.firstKills;

    const result = buildRecentPlayerMapStats(new Map([
      ["player-a", [
        match(0, {
          playerId: "player-a",
          map: "de_dust2",
          headshots: 5,
          firstKills: 2,
        }),
        dustMissingHeadshots,
        mirageMissingFirstKills,
      ]],
      ["player-b", [
        match(0, { playerId: "player-b", status: "ongoing" }),
      ]],
      ["player-c", [
        (() => {
          const row = match(0, { playerId: "player-c" });
          delete row.map;
          return row;
        })(),
      ]],
    ]), 30);

    const dust2 = result.get("player-a")?.find(({ map }) => map === "dust2");
    const mirage = result.get("player-a")?.find(({ map }) => map === "mirage");
    expect(dust2).toMatchObject({ matches: 2, wins: 1, firstKills: 3 });
    expect(dust2).not.toHaveProperty("headshots");
    expect(mirage).toMatchObject({ matches: 1, wins: 1, headshots: 3 });
    expect(mirage).not.toHaveProperty("firstKills");
    expect(result.has("player-b")).toBe(false);
    expect(result.has("player-c")).toBe(false);
  });

  it("keeps player histories isolated and returns no fake rows for an empty lookup", () => {
    const input = new Map<string, readonly PlayerMatch[]>([
      ["left", [match(0, { playerId: "left", map: "dust2", result: "win" })]],
      ["right", [match(0, { playerId: "right", map: "dust2", result: "loss" })]],
    ]);

    const result = buildRecentPlayerMapStats(input, 20);

    expect(result.get("left")?.[0]).toMatchObject({ map: "dust2", matches: 1, wins: 1 });
    expect(result.get("right")?.[0]).toMatchObject({ map: "dust2", matches: 1, wins: 0 });
    expect(buildRecentPlayerMapStats(new Map(), 20).size).toBe(0);
  });
});
