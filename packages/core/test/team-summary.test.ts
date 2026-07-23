import { describe, expect, it } from "vitest";

import {
  calculateTeamPerformanceSummary,
  calculateTeamWinChances,
  type MatchTeam,
  type PlayerMatch,
} from "../src/index.js";
import { makeMatch } from "./fixtures.js";

const NOW = "2026-07-23T12:00:00.000Z";

const team = (id: string, elo: number): MatchTeam => ({
  id,
  name: id,
  players: Array.from({ length: 5 }, (_, index) => ({
    id: `${id}-${index}`,
    nickname: `${id}-${index}`,
    game: "cs2",
    elo: elo + index * 2,
  })),
});

const playerHistory = (
  playerId: string,
  overrides: Partial<PlayerMatch> = {},
): PlayerMatch[] => Array.from({ length: 12 }, (_, index) => makeMatch({
  id: `${playerId}-match-${index}`,
  playerId,
  finishedAt: new Date(Date.parse(NOW) - (index + 1) * 24 * 60 * 60 * 1_000),
  result: index % 3 === 0 ? "loss" : "win",
  roundsPlayed: 20,
  kills: 18,
  assists: 5,
  deaths: 14,
  damage: 1_700,
  ...overrides,
}));

const historiesFor = (
  matchTeam: MatchTeam,
  overrides: Partial<PlayerMatch> = {},
): Map<string, PlayerMatch[]> => new Map(
  matchTeam.players.map((player) => [player.id, playerHistory(player.id, overrides)]),
);

describe("team performance summary", () => {
  it("aggregates equal-weight player metrics, form and ELO with explicit coverage", () => {
    const matchTeam = team("alpha", 2_000);
    const summary = calculateTeamPerformanceSummary(
      matchTeam,
      historiesFor(matchTeam),
      10,
      { now: NOW },
    );

    expect(summary).toMatchObject({
      teamId: "alpha",
      window: 10,
      playersTotal: 5,
      statsPlayers: 5,
      formPlayers: 5,
      eloPlayers: 5,
      sampledMatches: 50,
      averageElo: 2_004,
      averageKills: 18,
      kd: 18 / 14,
      winRate: 60,
    });
    expect(summary.firepower).toBeGreaterThanOrEqual(80);
    expect(summary.form).toBeTypeOf("number");
  });

  it("does not fabricate team metrics below three-player coverage", () => {
    const matchTeam = team("partial", 2_000);
    const histories = historiesFor(matchTeam);
    for (const player of matchTeam.players.slice(2)) histories.delete(player.id);
    const summary = calculateTeamPerformanceSummary(matchTeam, histories, 10, { now: NOW });

    expect(summary).toMatchObject({
      statsPlayers: 2,
      formPlayers: 2,
      eloPlayers: 5,
    });
    expect(summary.averageKills).toBeUndefined();
    expect(summary.kd).toBeUndefined();
    expect(summary.firepower).toBeUndefined();
    expect(summary.form).toBeUndefined();
    expect(summary.averageElo).toBe(2_004);
  });

  it("requires five trustworthy matches from each included player", () => {
    const matchTeam = team("short", 2_000);
    const histories = historiesFor(matchTeam);
    for (const player of matchTeam.players) {
      histories.set(player.id, histories.get(player.id)?.slice(0, 4) ?? []);
    }
    const summary = calculateTeamPerformanceSummary(matchTeam, histories, 10, { now: NOW });

    expect(summary.statsPlayers).toBe(0);
    expect(summary.sampledMatches).toBe(0);
    expect(summary.firepower).toBeUndefined();
  });

  it("deduplicates identical rows and excludes a player with conflicting duplicate ids", () => {
    const matchTeam = team("duplicates", 2_000);
    const histories = historiesFor(matchTeam);
    const firstPlayer = matchTeam.players[0] as MatchTeam["players"][number];
    const secondPlayer = matchTeam.players[1] as MatchTeam["players"][number];
    const identical = histories.get(firstPlayer.id)?.[0] as PlayerMatch;
    histories.get(firstPlayer.id)?.push({ ...identical });
    const conflicted = histories.get(secondPlayer.id)?.[0] as PlayerMatch;
    histories.get(secondPlayer.id)?.push({
      ...conflicted,
      result: conflicted.result === "win" ? "loss" : "win",
    });

    const summary = calculateTeamPerformanceSummary(matchTeam, histories, 10, { now: NOW });

    expect(summary.statsPlayers).toBe(4);
    expect(summary.sampledMatches).toBe(40);
  });

  it("returns balanced complementary chances for equal teams", () => {
    const alpha = team("alpha", 2_000);
    const bravo = team("bravo", 2_000);
    const alphaSummary = calculateTeamPerformanceSummary(alpha, historiesFor(alpha), 10, { now: NOW });
    const bravoSummary = calculateTeamPerformanceSummary(bravo, historiesFor(bravo), 10, { now: NOW });

    expect(calculateTeamWinChances(alphaSummary, bravoSummary)).toEqual({
      status: "known",
      first: { teamId: "alpha", chance: 50 },
      second: { teamId: "bravo", chance: 50 },
      confidence: expect.any(Number),
      signals: ["elo", "history", "form"],
    });
  });

  it("favors the stronger team, keeps chances complementary and clamps extremes", () => {
    const alpha = team("alpha", 3_500);
    const bravo = team("bravo", 1_000);
    const alphaSummary = calculateTeamPerformanceSummary(
      alpha,
      historiesFor(alpha, { kills: 22, deaths: 10, damage: 2_100 }),
      10,
      { now: NOW },
    );
    const bravoSummary = calculateTeamPerformanceSummary(
      bravo,
      historiesFor(bravo, { kills: 8, deaths: 18, damage: 900 }),
      10,
      { now: NOW },
    );
    const result = calculateTeamWinChances(alphaSummary, bravoSummary);

    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.first.chance).toBeGreaterThan(result.second.chance);
    expect(result.first.chance + result.second.chance).toBe(100);
  });

  it("reports the exact signals used for ELO-only and history-only estimates", () => {
    const alpha = team("alpha", 2_100);
    const bravo = team("bravo", 2_000);
    const eloOnly = calculateTeamWinChances(
      calculateTeamPerformanceSummary(alpha, new Map(), 10, { now: NOW }),
      calculateTeamPerformanceSummary(bravo, new Map(), 10, { now: NOW }),
    );
    expect(eloOnly).toMatchObject({ status: "known", signals: ["elo"] });

    const withoutElo = (matchTeam: MatchTeam): MatchTeam => ({
      ...matchTeam,
      players: matchTeam.players.map(({ id, nickname, game }) => ({ id, nickname, game })),
    });
    const historyAlpha = withoutElo(alpha);
    const historyBravo = withoutElo(bravo);
    const historyOnly = calculateTeamWinChances(
      calculateTeamPerformanceSummary(historyAlpha, historiesFor(historyAlpha), 10, { now: NOW }),
      calculateTeamPerformanceSummary(historyBravo, historiesFor(historyBravo), 10, { now: NOW }),
    );
    expect(historyOnly).toMatchObject({ status: "known", signals: ["history", "form"] });
  });

  it("suppresses chance rather than inventing 50/50 when coverage is insufficient", () => {
    const alphaWithElo = team("alpha", 2_000);
    const alpha: MatchTeam = {
      ...alphaWithElo,
      players: alphaWithElo.players.map(({ id, nickname, game }) => ({ id, nickname, game })),
    };
    const bravo = team("bravo", 2_000);
    const alphaHistories = historiesFor(alpha);
    for (const player of alpha.players.slice(2)) alphaHistories.delete(player.id);
    const alphaSummary = calculateTeamPerformanceSummary(alpha, alphaHistories, 10, { now: NOW });
    const bravoSummary = calculateTeamPerformanceSummary(bravo, historiesFor(bravo), 10, { now: NOW });

    expect(calculateTeamWinChances(alphaSummary, bravoSummary)).toEqual({
      status: "unknown",
      reason: "insufficient-coverage",
    });
  });

  it("excludes the current room result from every summary signal", () => {
    const matchTeam = team("current", 2_000);
    const histories = historiesFor(matchTeam);
    for (const player of matchTeam.players) {
      histories.get(player.id)?.unshift(makeMatch({
        id: "current-room",
        playerId: player.id,
        finishedAt: NOW,
        result: "win",
        kills: 50,
        deaths: 1,
        damage: 5_000,
      }));
    }

    const withoutCurrent = calculateTeamPerformanceSummary(
      matchTeam,
      histories,
      10,
      { now: NOW, currentMatchId: "current-room" },
    );
    const baseline = calculateTeamPerformanceSummary(
      matchTeam,
      historiesFor(matchTeam),
      10,
      { now: NOW },
    );

    expect(withoutCurrent.averageKills).toBe(baseline.averageKills);
    expect(withoutCurrent.kd).toBe(baseline.kd);
    expect(withoutCurrent.firepower).toBe(baseline.firepower);
    expect(withoutCurrent.winRate).toBe(baseline.winRate);
    expect(withoutCurrent.form).toBe(baseline.form);
    expect(withoutCurrent.sampledMatches).toBe(baseline.sampledMatches);
  });

  it("does not count duplicate roster ids twice toward coverage", () => {
    const original = team("duplicates-roster", 2_000);
    const duplicated: MatchTeam = {
      ...original,
      players: [
        original.players[0] as MatchTeam["players"][number],
        original.players[0] as MatchTeam["players"][number],
        ...(original.players.slice(2)),
      ],
    };
    const histories = historiesFor(original);
    const summary = calculateTeamPerformanceSummary(duplicated, histories, 10, { now: NOW });

    expect(summary.playersTotal).toBe(5);
    expect(summary.statsPlayers).toBe(3);
    expect(summary.sampledMatches).toBe(30);
  });

  it("uses exposure-normalized team K/D instead of averaging player ratios", () => {
    const matchTeam = team("ratio", 2_000);
    const histories = historiesFor(matchTeam);
    histories.set(matchTeam.players[0]?.id ?? "", playerHistory(
      matchTeam.players[0]?.id ?? "",
      { kills: 20, deaths: 1 },
    ));
    histories.set(matchTeam.players[1]?.id ?? "", playerHistory(
      matchTeam.players[1]?.id ?? "",
      { kills: 10, deaths: 10 },
    ));

    const summary = calculateTeamPerformanceSummary(matchTeam, histories, 10, { now: NOW });
    expect(summary.kd).toBeCloseTo(84 / 53, 8);
  });

  it("uses validated declared team ELO when individual ELO rows are unavailable", () => {
    const withPlayers = team("declared", 2_000);
    const declared: MatchTeam = {
      ...withPlayers,
      averageElo: 2_123,
      eloKnown: 5,
      players: withPlayers.players.map(({ id, nickname, game }) => ({ id, nickname, game })),
    };
    const summary = calculateTeamPerformanceSummary(declared, historiesFor(declared), 10, { now: NOW });

    expect(summary.eloPlayers).toBe(5);
    expect(summary.averageElo).toBe(2_123);
  });
});
