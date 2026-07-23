import { afterEach, describe, expect, it, vi } from "vitest";

import { FaceitBridgeAdapter } from "../src/bridge-client";
import { debugLog } from "../src/debug-log";

const FORBIDDEN_DEBUG_FIELDS = new Set([
  "args",
  "body",
  "id",
  "matchId",
  "message",
  "nickname",
  "pathname",
  "playerId",
  "request",
  "response",
]);

function expectPrivacySafeDebugEvent(event: Record<string, unknown>, secrets: readonly string[]): void {
  const keys: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      visit(nested);
    }
  };
  visit(event);
  expect(keys.filter((key) => FORBIDDEN_DEBUG_FIELDS.has(key))).toEqual([]);
  const serialized = JSON.stringify(event);
  for (const secret of secrets) expect(serialized).not.toContain(secret);
}

describe("isolated bridge client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a forged response with a malformed normalized model", async () => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: { status: "ok", sampledAt: Date.now(), data: { elo: 9_999 } },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getPlayer("player");
    adapter.destroy();
    expect(result).toMatchObject({ status: "error", error: { code: "upstream-shape" } });
  });

  it("accepts the bounded normalized Elo stake fields on a match", async () => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: {
              status: "ok",
              sampledAt: Date.now(),
              data: {
                id: "match-1",
                game: "cs2",
                status: "ready",
                mapPool: ["dust2"],
                calculateElo: true,
                premiumMatch: false,
                teams: [
                  {
                    id: "alpha",
                    winProbability: 0.42,
                    players: [{ id: "player-1", nickname: "one", game: "cs2" }],
                  },
                  {
                    id: "bravo",
                    winProbability: 0.58,
                    players: [{ id: "player-2", nickname: "two", game: "cs2" }],
                  },
                ],
              },
            },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getMatch("match-1");
    adapter.destroy();
    expect(result).toMatchObject({
      status: "ready",
      data: {
        calculateElo: true,
        premiumMatch: false,
        teams: [
          { id: "alpha", winProbability: 0.42 },
          { id: "bravo", winProbability: 0.58 },
        ],
      },
    });
  });

  it("rejects out-of-range Elo stake fields at the isolated bridge boundary", async () => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: {
              status: "ok",
              sampledAt: Date.now(),
              data: {
                id: "match-1",
                game: "cs2",
                status: "ready",
                mapPool: [],
                calculateElo: "true",
                teams: [
                  {
                    id: "alpha",
                    winProbability: 42,
                    players: [{ id: "player-1", nickname: "one", game: "cs2" }],
                  },
                  {
                    id: "bravo",
                    winProbability: -0.1,
                    players: [{ id: "player-2", nickname: "two", game: "cs2" }],
                  },
                ],
              },
            },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getMatch("match-1");
    adapter.destroy();
    expect(result).toMatchObject({ status: "error", error: { code: "upstream-shape" } });
  });

  it("rejects a forged recent-match row with a non-string map", async () => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: {
              status: "ok",
              sampledAt: Date.now(),
              data: [{
                id: "match-1",
                playerId: "player-1",
                game: "cs2",
                mode: "5v5",
                status: "finished",
                finishedAt: Date.now(),
                result: "win",
                map: { hostile: true },
                roundsPlayed: 20,
                kills: 20,
                assists: 5,
                deaths: 10,
                damage: 2_000,
              }],
            },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getRecentMatches("player-1", 30);
    adapter.destroy();
    expect(result).toMatchObject({ status: "error", error: { code: "upstream-shape" } });
  });

  it("rejects a forged recent-match row with a non-string team id", async () => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: {
              status: "ok",
              sampledAt: Date.now(),
              data: [{
                id: "match-1",
                playerId: "player-1",
                teamId: { hostile: true },
                game: "cs2",
                mode: "5v5",
                status: "finished",
                finishedAt: Date.now(),
                result: "win",
                map: "mirage",
                roundsPlayed: 20,
                kills: 20,
                assists: 5,
                deaths: 10,
                damage: 2_000,
              }],
            },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getRecentMatches("player-1", 30);
    adapter.destroy();
    expect(result).toMatchObject({ status: "error", error: { code: "upstream-shape" } });
  });

  it.each([
    [{ status: "restricted", reason: "forbidden" }, { status: "restricted", reason: "forbidden" }],
    [{ status: "error", code: "network" }, { status: "error", error: { code: "network" } }],
  ] as const)("preserves %s as a non-ready DataState instead of inventing zero statistics", async (bridgeResult, expected) => {
    const origin = "https://www.faceit.com";
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; type?: string };
      if (value.type !== "read" || !value.id) return;
      queueMicrotask(() => window.dispatchEvent(new MessageEvent("message", {
        origin,
        source: window,
        data: {
          source: "eloscope:main",
          version: 1,
          type: "response",
          id: value.id,
          result: bridgeResult,
        },
      })));
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const state = await adapter.getRecentMatches("11111111-2222-3333-4444-555555555555", 30);
    adapter.destroy();
    expect(state).toMatchObject(expected);
    expect(state).not.toHaveProperty("data");
  });

  it("logs only the read operation, state and duration without bridge arguments, ids or response bodies", async () => {
    const origin = "https://www.faceit.com";
    const nickname = "PrivateNickname-bridge";
    const playerId = "private-player-id-bridge";
    const record = vi.spyOn(debugLog, "record").mockImplementation(() => undefined);
    vi.spyOn(window, "postMessage").mockImplementation(((request: unknown) => {
      const value = request as { id?: string; operation?: string; type?: string };
      if (value.type !== "read" || value.operation !== "player" || !value.id) return;
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", {
          origin,
          source: window,
          data: {
            source: "eloscope:main",
            version: 1,
            type: "response",
            id: value.id,
            result: {
              status: "ok",
              sampledAt: Date.now(),
              data: {
                id: playerId,
                nickname,
                game: "cs2",
                elo: 2_511,
                officialLevel: 10,
              },
            },
          },
        }));
      });
    }) as typeof window.postMessage);

    const adapter = new FaceitBridgeAdapter(origin);
    const result = await adapter.getPlayer(nickname);
    adapter.destroy();

    expect(result).toMatchObject({
      status: "ready",
      data: { id: playerId, nickname },
    });
    const events = record.mock.calls.map(([event]) => event as Record<string, unknown>);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        component: "bridge",
        event: "bridge.request",
        operation: "player",
        status: "loading",
      }),
      expect.objectContaining({
        component: "bridge",
        event: "bridge.response",
        operation: "player",
        status: "ready",
        durationMs: expect.any(Number),
      }),
    ]));
    for (const event of events) expectPrivacySafeDebugEvent(event, [nickname, playerId]);
  });
});
