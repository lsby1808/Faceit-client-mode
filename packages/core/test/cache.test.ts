import { describe, expect, it, vi } from "vitest";

import { CACHE_TTLS, RequestCache } from "../src/index.js";

describe("RequestCache", () => {
  it("fails closed for non-finite limits and never exceeds four loaders", () => {
    const cache = new RequestCache<string, string>({
      concurrency: Number.NaN,
      maxBytes: Number.POSITIVE_INFINITY,
    });
    expect(cache.stats().concurrency).toBe(4);
    expect(cache.stats().maxBytes).toBe(50 * 1024 * 1024);
    cache.set("never", "value", Number.NaN);
    expect(cache.peek("never")).toBeUndefined();

    const capped = new RequestCache<string, string>({ concurrency: 99 });
    expect(capped.stats().concurrency).toBe(4);
  });
  it("uses the documented cache TTLs", () => {
    expect(CACHE_TTLS).toEqual({
      playerStats: 300_000,
      activeMatch: 30_000,
      finishedMatch: 3_600_000,
    });
    expect(new RequestCache().stats()).toMatchObject({ concurrency: 4, maxBytes: 50 * 1024 * 1024 });
  });

  it("deduplicates concurrent requests for the same key", async () => {
    const cache = new RequestCache<string, { value: number }>();
    const loader = vi.fn(async () => ({ value: 7 }));
    const first = cache.get("player", loader, { ttlMs: 1_000 });
    const second = cache.get("player", loader, { ttlMs: 1_000 });

    expect(first).toBe(second);
    await expect(Promise.all([first, second])).resolves.toEqual([{ value: 7 }, { value: 7 }]);
    expect(loader).toHaveBeenCalledTimes(1);
    await cache.get("player", loader, { ttlMs: 1_000 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("expires entries using the configured clock", async () => {
    let now = 1_000;
    const cache = new RequestCache<string, number>({ now: () => now });
    const loader = vi.fn(async () => 9);
    await cache.get("x", loader, { ttlMs: 100 });
    now = 1_099;
    await cache.get("x", loader, { ttlMs: 100 });
    expect(loader).toHaveBeenCalledTimes(1);
    now = 1_100;
    await cache.get("x", loader, { ttlMs: 100 });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("evicts least-recently-used values at its byte limit", () => {
    const cache = new RequestCache<string, string>({ maxBytes: 20, estimateSize: () => 10 });
    cache.set("a", "A", 1_000);
    cache.set("b", "B", 1_000);
    expect(cache.peek("a")).toBe("A");
    cache.set("c", "C", 1_000);

    expect(cache.peek("a")).toBe("A");
    expect(cache.peek("b")).toBeUndefined();
    expect(cache.peek("c")).toBe("C");
    expect(cache.stats().bytes).toBe(20);
  });

  it("runs no more than four loaders at once", async () => {
    const cache = new RequestCache<number, number>({ concurrency: 4 });
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];
    const loads = Array.from({ length: 6 }, (_, key) =>
      cache.get(
        key,
        () =>
          new Promise<number>((resolve) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            releases.push(() => {
              active -= 1;
              resolve(key);
            });
          }),
        { ttlMs: 1_000 },
      ),
    );

    await vi.waitFor(() => expect(releases).toHaveLength(4));
    releases.splice(0, 4).forEach((release) => release());
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());

    await expect(Promise.all(loads)).resolves.toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxActive).toBe(4);
    expect(cache.stats().active).toBe(0);
  });
});
