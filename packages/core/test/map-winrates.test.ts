import { describe, expect, it } from "vitest";

import {
  aggregateTeamMapWinRate,
  compareTeamMapWinRates,
  type MatchContext,
  type MatchTeam,
  type PlayerMapStats,
} from "../src/index.js";

const player = (id: string) => ({ id, nickname: id, game: "cs2" });

const team = (id: string, playerIds: readonly string[]): MatchTeam => ({
  id,
  name: `team_${id}`,
  players: playerIds.map(player),
});

const mapRow = (overrides: Partial<PlayerMapStats> = {}): PlayerMapStats => ({
  map: "dust2",
  matches: 10,
  wins: 5,
  kills: 100,
  assists: 30,
  deaths: 90,
  roundsPlayed: 200,
  damage: 16_000,
  ...overrides,
});

const match = (overrides: Partial<MatchContext> = {}): MatchContext => ({
  id: "match-1",
  game: "cs2",
  status: "voting",
  teams: [team("left", ["a", "b", "missing"]), team("right", ["c"])],
  mapPool: ["mirage", "de_Dust2", "ancient", "dust2"],
  selectedMap: "DE_DUST2",
  ...overrides,
});

describe("aggregateTeamMapWinRate", () => {
  it("weights player win rates by matches and exposes sample coverage", () => {
    const stats = new Map<string, PlayerMapStats[]>([
      ["a", [mapRow({ map: "de_dust2", matches: 10, wins: 9 })]],
      ["b", [mapRow({ map: "DUST2", matches: 90, wins: 1 })]],
    ]);

    expect(aggregateTeamMapWinRate(team("left", ["a", "b", "missing"]), "dust2", stats)).toEqual({
      status: "ready",
      teamId: "left",
      teamName: "team_left",
      map: "dust2",
      knownPlayers: 2,
      totalPlayers: 3,
      coverage: 2 / 3,
      sampleMatches: 100,
      wins: 10,
      winRate: 10,
    });
  });

  it("does not double-count duplicate alias rows for one player", () => {
    const stats = new Map<string, PlayerMapStats[]>([
      [
        "a",
        [
          mapRow({ map: "dust2", matches: 10, wins: 10 }),
          mapRow({ map: "de_dust2", matches: 40, wins: 20 }),
        ],
      ],
    ]);

    const aggregate = aggregateTeamMapWinRate(team("left", ["a"]), "de_Dust2", stats);
    expect(aggregate).toMatchObject({ status: "ready", sampleMatches: 40, wins: 20, winRate: 50 });
  });

  it("keeps an absent sample unavailable instead of fabricating a zero win rate", () => {
    const aggregate = aggregateTeamMapWinRate(
      team("left", ["a", "b"]),
      "dust2",
      new Map([
        ["a", [mapRow({ matches: 0, wins: 0 })]],
        ["b", [mapRow({ matches: 3, wins: 4 })]],
      ]),
    );

    expect(aggregate).toEqual({
      status: "unavailable",
      reason: "no-map-data",
      teamId: "left",
      teamName: "team_left",
      map: "dust2",
      knownPlayers: 0,
      totalPlayers: 2,
      coverage: 0,
      sampleMatches: 0,
    });
    expect(aggregate).not.toHaveProperty("winRate");
    expect(aggregate).not.toHaveProperty("wins");
  });

  it("uses null coverage for an empty roster", () => {
    expect(aggregateTeamMapWinRate(team("left", []), "dust2", new Map())).toMatchObject({
      status: "unavailable",
      reason: "no-players",
      coverage: null,
      sampleMatches: 0,
    });
  });
});

describe("compareTeamMapWinRates", () => {
  it("puts the selected map first, deduplicates aliases and reports the leader", () => {
    const stats = new Map<string, PlayerMapStats[]>([
      ["a", [mapRow({ matches: 10, wins: 9 })]],
      ["b", [mapRow({ matches: 90, wins: 1 })]],
      ["c", [mapRow({ matches: 20, wins: 8 })]],
    ]);

    const comparisons = compareTeamMapWinRates(match(), stats);

    expect(comparisons.map(({ map }) => map)).toEqual(["dust2", "mirage", "ancient"]);
    expect(comparisons[0]?.teams).toHaveLength(2);
    expect(comparisons[0]?.advantage).toEqual({
      status: "ready",
      leaderTeamId: "right",
      percentagePoints: 30,
    });
  });

  it("withholds advantage when either team lacks trustworthy map data", () => {
    const stats = new Map<string, PlayerMapStats[]>([["a", [mapRow({ matches: 10, wins: 5 })]]]);
    const comparison = compareTeamMapWinRates(match({ mapPool: ["dust2"], selectedMap: undefined }), stats)[0];

    expect(comparison?.teams[0]).toMatchObject({ status: "ready", winRate: 50 });
    expect(comparison?.teams[1]).toMatchObject({ status: "unavailable", reason: "no-map-data" });
    expect(comparison?.advantage).toEqual({ status: "unavailable", reason: "missing-team-data" });
  });

  it("represents an exact tie without inventing a winning team", () => {
    const stats = new Map<string, PlayerMapStats[]>([
      ["a", [mapRow({ matches: 4, wins: 2 })]],
      ["c", [mapRow({ matches: 10, wins: 5 })]],
    ]);
    const tied = compareTeamMapWinRates(
      match({ teams: [team("left", ["a"]), team("right", ["c"])], mapPool: ["dust2"] }),
      stats,
    )[0];

    expect(tied?.advantage).toEqual({ status: "ready", leaderTeamId: null, percentagePoints: 0 });
  });

  it("requires exactly two teams before exposing an advantage", () => {
    const onlyTeam = match({ teams: [team("left", ["a"])], mapPool: ["dust2"] });
    const comparison = compareTeamMapWinRates(
      onlyTeam,
      new Map([["a", [mapRow({ matches: 10, wins: 7 })]]]),
    )[0];

    expect(comparison?.advantage).toEqual({ status: "unavailable", reason: "requires-two-teams" });
  });
});
