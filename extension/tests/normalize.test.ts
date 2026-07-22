import { describe, expect, it } from "vitest";

import {
  normalizeMapStats,
  normalizeMatch,
  normalizeMatchStats,
  normalizeRecentMatches,
  normalizeVeto,
} from "../src/normalize";
import currentMapStats from "../fixtures/api/current-map-stats.json";
import currentMatch from "../fixtures/api/current-match.json";
import currentRecentMatches from "../fixtures/api/current-recent-matches.json";

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

  it("normalizes the current same-origin time-stats response without fake zero rows", () => {
    expect(normalizeRecentMatches(currentRecentMatches, "11111111-2222-3333-4444-555555555555")).toEqual([
      expect.objectContaining({
        id: "1-12345678-90ab-cdef-1234-567890abcdef",
        status: "finished",
        mode: "5v5",
        result: "win",
        map: "dust2",
        kills: 21,
        assists: 6,
        deaths: 14,
        roundsPlayed: 24,
        damage: 2_184,
        headshots: 11,
        firstKills: 4,
        survivedRounds: 10,
        eloBefore: 2_485,
        eloAfter: 2_511,
      }),
    ]);
    expect(normalizeRecentMatches([{ ...currentRecentMatches[0], i20: undefined }], "player-id")).toEqual([]);
  });

  it("normalizes current nested csgo_map aggregates and ignores non-map groups", () => {
    const payload: unknown = {
      ...currentMapStats,
      segments: [...currentMapStats.segments, {
        _id: { game: "cs2", gameMode: "1v1", segmentId: "csgo_map", playerId: "ignored" },
        segments: { de_mirage: { m1: "99", m2: "99", m3: "99", m4: "99", m5: "99", m8: "99", m19: "99" } }
      }]
    };
    expect(normalizeMapStats(payload)).toEqual([
      {
        map: "dust2",
        matches: 28,
        wins: 17,
        kills: 504,
        assists: 126,
        deaths: 420,
        roundsPlayed: 640,
        damage: 54_400,
        headshots: 251,
      },
    ]);
  });

  it("normalizes current match/v2 roster fields and selected map", () => {
    expect(normalizeMatch(currentMatch)).toEqual(expect.objectContaining({
      id: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      status: "finished",
      selectedMap: "dust2",
      mapPool: ["dust2", "mirage"],
      teams: expect.arrayContaining([
        expect.objectContaining({
          id: "faction1",
          players: [expect.objectContaining({ nickname: "FixturePlayer", elo: 2_511, officialLevel: 10 })],
        }),
      ]),
    }));
  });
});
