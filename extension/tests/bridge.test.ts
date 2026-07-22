import { describe, expect, it } from "vitest";
import { isValidBridgeRequest, sanitizeForBridge } from "../src/main-bridge";

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
});
