import { describe, expect, it } from "vitest";
import { parseFaceitRoute } from "../src/routes";
import { routeIdentity } from "../src/controller";

describe("FACEIT route contracts", () => {
  it.each([
    ["/ru/players/donk666", { kind: "profile", nickname: "donk666" }],
    ["/ru/players/FixturePlayer/cs2", { kind: "profile", nickname: "FixturePlayer" }],
    ["/ru/players/FixturePlayer/cs2/stats", { kind: "profile", nickname: "FixturePlayer" }],
    ["/en-US/players/test.name/cs2/history", { kind: "history", nickname: "test.name" }],
    ["/ru/cs2/room/11111111-2222-3333-4444-555555555555", { kind: "match", matchId: "11111111-2222-3333-4444-555555555555" }],
    ["/ru/cs2/room/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/scoreboard", { kind: "match", matchId: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }],
    ["/ru/cs2/room/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/scoreboard/match-insights", { kind: "match", matchId: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }],
    ["/en/login", { kind: "logged-out" }]
  ])("parses %s", (path, expected) => {
    expect(parseFaceitRoute(path)).toEqual(expected);
  });

  it("does not guess unknown routes", () => {
    expect(parseFaceitRoute("/en/players/name/cs2/inventory")).toEqual({ kind: "other" });
    expect(parseFaceitRoute("/en/cs2/room/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/unknown")).toEqual({ kind: "other" });
  });

  it("keeps a stable identity for repeated same-room locale notifications", () => {
    const first = parseFaceitRoute("/en/cs2/room/11111111-2222-3333-4444-555555555555");
    const second = parseFaceitRoute("/ru/cs2/room/11111111-2222-3333-4444-555555555555");
    expect(routeIdentity(first)).toBe(routeIdentity(second));
  });
});
