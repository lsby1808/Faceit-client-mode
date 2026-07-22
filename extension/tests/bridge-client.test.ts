import { describe, expect, it, vi } from "vitest";

import { FaceitBridgeAdapter } from "../src/bridge-client";

describe("isolated bridge client", () => {
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
});
