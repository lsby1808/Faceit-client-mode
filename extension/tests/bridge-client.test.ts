import { afterEach, describe, expect, it, vi } from "vitest";

import { FaceitBridgeAdapter } from "../src/bridge-client";

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
});
