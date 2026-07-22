import { describe, expect, it } from "vitest";

import {
  normalizeMapStats,
  normalizeMatch,
  normalizeMatchStats,
  normalizeRecentMatches,
  normalizeVeto,
} from "../src/normalize";

describe("FACEIT response contracts", () => {
  it("distinguishes a valid empty collection from an unknown schema", () => {
    expect(normalizeRecentMatches({ items: [] }, "player-1")).toEqual([]);
    expect(normalizeRecentMatches({ unexpected: [] }, "player-1")).toBeNull();
    expect(normalizeMapStats({ segments: [] })).toEqual([]);
    expect(normalizeMapStats({ statistics: [] })).toBeNull();
  });

  it("rejects partial match and statistics models", () => {
    expect(normalizeMatch({ id: "match-1", status: "ready", game: "cs2", teams: [] })).toBeNull();
    expect(normalizeMatchStats({ rounds_played: 24, teams: [] }, "match-1")).toBeNull();
  });

  it("requires a recognizable veto envelope", () => {
    expect(normalizeVeto({ unexpected: true }, "match-1")).toBeNull();
    expect(normalizeVeto({ active: false, history: [] }, "match-1")).toMatchObject({
      matchId: "match-1",
      active: false,
      history: [],
    });
  });
});
