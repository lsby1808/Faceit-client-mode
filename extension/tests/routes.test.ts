import { describe, expect, it } from "vitest";
import { parseFaceitRoute } from "../src/routes";
import { routeIdentity } from "../src/controller";

describe("FACEIT route contracts", () => {
  it.each([
    ["/ru/players/donk666", { kind: "profile", nickname: "donk666" }],
    ["/en-US/players/test.name/cs2/history", { kind: "history", nickname: "test.name" }],
    ["/ru/cs2/room/11111111-2222-3333-4444-555555555555", { kind: "match", matchId: "11111111-2222-3333-4444-555555555555" }],
    ["/en/login", { kind: "logged-out" }]
  ])("parses %s", (path, expected) => {
    expect(parseFaceitRoute(path)).toEqual(expected);
  });

  it("does not guess unknown routes", () => {
    expect(parseFaceitRoute("/en/players/name/cs2/stats")).toEqual({ kind: "other" });
  });

  it("keeps a stable identity for repeated same-room locale notifications", () => {
    const first = parseFaceitRoute("/en/cs2/room/11111111-2222-3333-4444-555555555555");
    const second = parseFaceitRoute("/ru/cs2/room/11111111-2222-3333-4444-555555555555");
    expect(routeIdentity(first)).toBe(routeIdentity(second));
  });
});
