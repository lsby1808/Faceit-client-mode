import { describe, expect, it } from "vitest";

import {
  classifyPlayerRole,
  ROLE_MATCH_WINDOW,
  type PlayerMatch,
  type PlayerRole,
} from "../src/index.js";
import { makeMatch } from "./fixtures.js";

const BASE_TIME = Date.parse("2026-07-22T12:00:00.000Z");

type RoleProfile = Readonly<{
  roundsPlayed: number;
  kills: number;
  assists: number;
  deaths: number;
  damage: number;
  headshots: number;
  firstKills: number;
  survivedRounds: number;
}>;

const PROFILES: Record<PlayerRole, RoleProfile> = {
  entry: {
    roundsPlayed: 20,
    kills: 18,
    assists: 3,
    deaths: 16,
    damage: 1_900,
    headshots: 10,
    firstKills: 3,
    survivedRounds: 4,
  },
  sniper: {
    roundsPlayed: 20,
    kills: 17,
    assists: 2,
    deaths: 9,
    damage: 1_800,
    headshots: 3,
    firstKills: 2,
    survivedRounds: 11,
  },
  support: {
    roundsPlayed: 20,
    kills: 12,
    assists: 6,
    deaths: 13,
    damage: 1_500,
    headshots: 6,
    firstKills: 0,
    survivedRounds: 7,
  },
  anchor: {
    roundsPlayed: 20,
    kills: 14,
    assists: 3,
    deaths: 8,
    damage: 1_600,
    headshots: 7,
    firstKills: 0,
    survivedRounds: 12,
  },
  rifler: {
    roundsPlayed: 20,
    kills: 16,
    assists: 3,
    deaths: 12,
    damage: 1_750,
    headshots: 11,
    firstKills: 1,
    survivedRounds: 8,
  },
};

const roleMatches = (
  role: PlayerRole,
  count: number = ROLE_MATCH_WINDOW,
  prefix: string = role,
): PlayerMatch[] => Array.from({ length: count }, (_, index) => makeMatch({
  id: `${prefix}-${index}`,
  finishedAt: BASE_TIME - index * 60_000,
  ...PROFILES[role],
}));

const withoutOptional = (
  matches: readonly PlayerMatch[],
  key: "headshots" | "firstKills" | "survivedRounds",
): PlayerMatch[] => matches.map((match) => {
  const copy = { ...match };
  delete copy[key];
  return copy;
});

describe("classifyPlayerRole", () => {
  it("uses a fixed 20-match contract", () => {
    expect(ROLE_MATCH_WINDOW).toBe(20);
    const result = classifyPlayerRole(roleMatches("entry"));
    expect(result).toMatchObject({
      status: "known",
      role: "entry",
      sampleSize: 20,
      requiredMatches: 20,
    });
  });

  it.each(Object.keys(PROFILES) as PlayerRole[])("recognizes the %s archetype", (role) => {
    const result = classifyPlayerRole(roleMatches(role));
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.role).toBe(role);
    expect(result.scores[result.role]).not.toBeNull();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(0.95);
  });

  it("returns unknown and reports the unique eligible sample when fewer than 20 rows exist", () => {
    const rows = roleMatches("entry", 19);
    rows.push({ ...(rows[0] as PlayerMatch) });
    rows.push(makeMatch({ id: "wrong-game", game: "csgo", finishedAt: BASE_TIME + 1_000 }));

    expect(classifyPlayerRole(rows)).toEqual({
      status: "unknown",
      reason: "insufficient-matches",
      sampleSize: 19,
      requiredMatches: 20,
    });
  });

  it("sorts before taking 20 and ignores every older match", () => {
    const recentSupport = roleMatches("support", 20, "recent-support");
    const olderEntry = roleMatches("entry", 20, "older-entry").map((match, index) => ({
      ...match,
      finishedAt: BASE_TIME - (100 + index) * 60_000,
    }));
    const mixed = [...olderEntry, ...recentSupport].reverse();
    const originalOrder = mixed.map(({ id }) => id);

    const result = classifyPlayerRole(mixed);

    expect(result).toMatchObject({ status: "known", role: "support", sampleSize: 20 });
    expect(mixed.map(({ id }) => id)).toEqual(originalOrder);
    expect(result).toEqual(classifyPlayerRole([...mixed].reverse()));
  });

  it("does not use the visible stats window and accepts the UI fixture profile as entry", () => {
    const rows = Array.from({ length: 20 }, (_, index) => makeMatch({
      id: `fixture-${index}`,
      finishedAt: BASE_TIME - index * 60_000,
      roundsPlayed: 24,
      kills: 18 + (index % 4),
      assists: 4 + (index % 3),
      deaths: 13 + (index % 3),
      damage: 1_920 + (index % 4) * 48,
      headshots: 8 + (index % 3),
      firstKills: 3 + (index % 2),
      survivedRounds: 9 + (index % 3),
    }));

    expect(classifyPlayerRole(rows)).toMatchObject({ status: "known", role: "entry", sampleSize: 20 });
    expect(classifyPlayerRole([...rows, ...roleMatches("anchor", 30, "irrelevant-old").map((match, index) => ({
      ...match,
      finishedAt: BASE_TIME - (100 + index) * 60_000,
    }))])).toMatchObject({ status: "known", role: "entry", sampleSize: 20 });
  });

  it("requires at least 80% round coverage before using optional opening/headshot metrics", () => {
    const seventyFivePercent = roleMatches("entry").map((match, index) => {
      if (index < 15) return match;
      const copy = { ...match };
      delete copy.firstKills;
      return copy;
    });
    const eightyPercent = roleMatches("entry").map((match, index) => {
      if (index < 16) return match;
      const copy = { ...match };
      delete copy.firstKills;
      return copy;
    });

    const below = classifyPlayerRole(seventyFivePercent);
    const boundary = classifyPlayerRole(eightyPercent);
    expect(below.status).toBe("known");
    expect(boundary.status).toBe("known");
    if (below.status !== "known" || boundary.status !== "known") return;
    expect(below.metrics.firstKillCoverage).toBeCloseTo(0.75);
    expect(below.metrics.firstKillRate).toBeUndefined();
    expect(below.scores.entry).toBeNull();
    expect(below.scores.sniper).toBeNull();
    expect(boundary.metrics.firstKillCoverage).toBeCloseTo(0.8);
    expect(boundary.metrics.firstKillRate).toBeCloseTo(0.15);
    expect(boundary.scores.entry).not.toBeNull();
  });

  it("does not invent sniper evidence when optional stats are absent", () => {
    const noFirstKills = classifyPlayerRole(withoutOptional(roleMatches("sniper"), "firstKills"));
    const noHeadshots = classifyPlayerRole(withoutOptional(roleMatches("sniper"), "headshots"));
    expect(noFirstKills.status).toBe("known");
    expect(noHeadshots.status).toBe("known");
    if (noFirstKills.status !== "known" || noHeadshots.status !== "known") return;

    expect(noFirstKills.metrics.firstKillCoverage).toBe(0);
    expect(noFirstKills.metrics.firstKillRate).toBeUndefined();
    expect(noFirstKills.scores.entry).toBeNull();
    expect(noFirstKills.scores.sniper).toBeNull();
    expect(noHeadshots.metrics.headshotCoverage).toBe(0);
    expect(noHeadshots.metrics.headshotRate).toBeUndefined();
    expect(noHeadshots.scores.sniper).toBeNull();
  });

  it("derives survival safely when the optional survived-rounds field is absent", () => {
    const result = classifyPlayerRole(withoutOptional(roleMatches("anchor"), "survivedRounds"));
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.metrics.survivalRate).toBeCloseTo(0.6);
    expect(result.role).toBe("anchor");
  });

  it("clamps corrupt optional counts and keeps every exposed metric finite", () => {
    const rows = roleMatches("rifler").map((match) => ({
      ...match,
      headshots: match.kills + 1_000,
      firstKills: match.roundsPlayed + 1_000,
      survivedRounds: match.roundsPlayed + 1_000,
    }));
    const result = classifyPlayerRole(rows);
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.metrics.headshotRate).toBe(1);
    expect(result.metrics.firstKillRate).toBe(1);
    expect(result.metrics.survivalRate).toBe(1);
    expect(Object.values(result.scores).filter((score): score is number => score !== null)
      .every((score) => Number.isFinite(score) && score >= 0 && score <= 1)).toBe(true);
  });

  it("caps inferred sniper confidence because weapon-kill data is unavailable", () => {
    const result = classifyPlayerRole(roleMatches("sniper"));
    expect(result.status).toBe("known");
    if (result.status !== "known") return;
    expect(result.role).toBe("sniper");
    expect(result.confidence).toBeLessThanOrEqual(0.75);
  });
});
