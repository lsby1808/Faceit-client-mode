import { describe, expect, it } from "vitest";
import type { AnyBridgeRequest } from "../src/protocol";
import { endpointFor, isValidBridgeRequest, sanitizeForBridge } from "../src/main-bridge";

describe("MAIN-world bridge boundary", () => {
  it("removes every credential-like key recursively", () => {
    const safe = sanitizeForBridge({
      nickname: "safe",
      token: "secret-1",
      accessToken: "secret-2",
      nested: { Authorization: "Bearer secret-3", cookieJar: "secret-4", elo: 2300 }
    });
    expect(safe).toEqual({ nickname: "safe", nested: { elo: 2300 } });
    expect(JSON.stringify(safe)).not.toContain("secret");
  });

  it("accepts only allowlisted read operations and strict arguments", () => {
    const base = { source: "eloscope:isolated", version: 1, type: "read", id: "a".repeat(32) };
    expect(isValidBridgeRequest({ ...base, operation: "match", args: { matchId: "11111111-2222-3333-4444-555555555555" } })).toBe(true);
    expect(isValidBridgeRequest({ ...base, operation: "deleteMatch", args: { matchId: "11111111-2222-3333-4444-555555555555" } })).toBe(false);
    expect(isValidBridgeRequest({ ...base, operation: "match", args: { matchId: "../sessions/me" } })).toBe(false);
    expect(isValidBridgeRequest({ ...base, operation: "recentMatches", args: { playerId: "11111111-2222-3333-4444-555555555555", limit: 17 } })).toBe(false);
  });

  it("uses the authenticated same-origin /api gateway and current time-stats query", () => {
    const base = { source: "eloscope:isolated", version: 1, type: "read", id: "a".repeat(32) } as const;
    const entityId = "11111111-2222-3333-4444-555555555555";
    const recent = endpointFor({
      ...base,
      operation: "recentMatches",
      args: { playerId: entityId, limit: 30 },
    } as AnyBridgeRequest);
    const match = endpointFor({
      ...base,
      operation: "match",
      args: { matchId: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
    } as AnyBridgeRequest);

    expect(recent?.origin).toBe("https://www.faceit.com");
    expect(recent?.pathname).toBe(`/api/stats/v1/stats/time/users/${entityId}/games/cs2`);
    expect(Object.fromEntries(recent?.searchParams ?? [])).toEqual({ page: "0", size: "30", game_mode: "5v5" });
    expect(match?.pathname).toBe("/api/match/v2/match/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    const cases = [
      ["viewer", {}, "/api/users/v1/sessions/me"],
      ["player", { nickname: "FixturePlayer" }, "/api/users/v1/nicknames/FixturePlayer"],
      ["playerMapStats", { playerId: entityId }, `/api/stats/v1/stats/users/${entityId}/games/cs2`],
      ["vetoState", { matchId: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }, "/api/democracy/v1/match/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/history"],
    ] as const;
    for (const [operation, args, pathname] of cases) {
      expect(endpointFor({ ...base, operation, args } as AnyBridgeRequest)?.pathname).toBe(pathname);
    }
  });
});
