import { describe, expect, it, vi } from "vitest";

import { LatestControllerLifecycle } from "../src/controller-restart";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("latest controller lifecycle", () => {
  it("destroys a pending start and never activates the superseded controller", async () => {
    const firstStart = deferred();
    const first = {
      start: vi.fn(() => firstStart.promise),
      destroy: vi.fn()
    };
    const second = {
      start: vi.fn(async () => undefined),
      destroy: vi.fn()
    };
    const activated = vi.fn();
    const create = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const lifecycle = new LatestControllerLifecycle(create, activated);

    const initial = lifecycle.restart();
    await vi.waitFor(() => expect(first.start).toHaveBeenCalledOnce());
    const replacement = lifecycle.restart();

    expect(first.destroy).toHaveBeenCalledOnce();
    expect(lifecycle.current).toBeUndefined();
    firstStart.resolve();
    await initial;
    await replacement;

    expect(activated).toHaveBeenCalledTimes(1);
    expect(activated).toHaveBeenCalledWith(second);
    expect(lifecycle.current).toBe(second);
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it("collapses queued restart requests before constructing stale controllers", async () => {
    const controller = {
      start: vi.fn(async () => undefined),
      destroy: vi.fn()
    };
    const create = vi.fn(() => controller);
    const lifecycle = new LatestControllerLifecycle(create);

    const first = lifecycle.restart();
    const second = lifecycle.restart();
    await Promise.all([first, second]);

    expect(create).toHaveBeenCalledOnce();
    expect(lifecycle.current).toBe(controller);
  });
});
