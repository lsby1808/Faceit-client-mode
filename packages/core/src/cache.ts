export const CACHE_TTLS = Object.freeze({
  playerStats: 5 * 60 * 1_000,
  activeMatch: 30 * 1_000,
  finishedMatch: 60 * 60 * 1_000,
});

export interface RequestCacheOptions<V> {
  concurrency?: number;
  maxBytes?: number;
  now?: () => number;
  estimateSize?: (value: V) => number;
}

export interface CacheLoadOptions<V> {
  ttlMs: number;
  estimateSize?: (value: V) => number;
  cache?: boolean;
}

export interface RequestCacheStats {
  entries: number;
  bytes: number;
  inFlight: number;
  queued: number;
  active: number;
  concurrency: number;
  maxBytes: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  size: number;
  lastAccess: number;
}

interface QueueTask<T> {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;

const defaultEstimateSize = (value: unknown): number => {
  try {
    const serialized = JSON.stringify(value);
    // A conservative allowance for UTF-16 strings plus object/Map overhead.
    return new TextEncoder().encode(serialized ?? String(value)).byteLength * 2 + 128;
  } catch {
    return new TextEncoder().encode(String(value)).byteLength * 2 + 128;
  }
};

/**
 * Memory-only cache for session-scoped FACEIT models. It combines LRU eviction,
 * TTLs, same-key promise deduplication and a hard limit on concurrent loaders.
 */
export class RequestCache<K, V> {
  readonly concurrency: number;
  readonly maxBytes: number;

  private readonly now: () => number;
  private readonly estimateSize: (value: V) => number;
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly inFlight = new Map<K, Promise<V>>();
  private readonly queue: QueueTask<unknown>[] = [];
  private active = 0;
  private bytes = 0;
  private accessSequence = 0;

  constructor(options: RequestCacheOptions<V> = {}) {
    const requestedConcurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    this.concurrency = Number.isFinite(requestedConcurrency)
      ? Math.min(DEFAULT_CONCURRENCY, Math.max(1, Math.floor(requestedConcurrency)))
      : DEFAULT_CONCURRENCY;
    const requestedMaxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxBytes = Number.isFinite(requestedMaxBytes)
      ? Math.min(DEFAULT_MAX_BYTES, Math.max(0, Math.floor(requestedMaxBytes)))
      : DEFAULT_MAX_BYTES;
    this.now = options.now ?? Date.now;
    this.estimateSize = options.estimateSize ?? defaultEstimateSize;
  }

  get(key: K, loader: () => Promise<V>, options: CacheLoadOptions<V>): Promise<V> {
    this.removeExpired();
    const cached = this.entries.get(key);
    if (cached) {
      cached.lastAccess = ++this.accessSequence;
      return Promise.resolve(cached.value);
    }

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const scheduled = this.schedule(async () => {
      const value = await loader();
      if (options.cache !== false && options.ttlMs > 0) {
        this.set(key, value, options.ttlMs, options.estimateSize);
      }
      return value;
    });
    let tracked: Promise<V>;
    tracked = scheduled.finally(() => {
      if (this.inFlight.get(key) === tracked) this.inFlight.delete(key);
    });
    this.inFlight.set(key, tracked);
    return tracked;
  }

  peek(key: K): V | undefined {
    this.removeExpired();
    const cached = this.entries.get(key);
    if (!cached) return undefined;
    cached.lastAccess = ++this.accessSequence;
    return cached.value;
  }

  set(key: K, value: V, ttlMs: number, estimator?: (value: V) => number): void {
    this.delete(key);
    if (!Number.isFinite(ttlMs) || ttlMs <= 0 || this.maxBytes <= 0) return;

    const estimated = estimator?.(value) ?? this.estimateSize(value);
    const size = Number.isFinite(estimated) ? Math.max(0, Math.ceil(estimated)) : this.maxBytes + 1;
    if (size > this.maxBytes) return;

    this.entries.set(key, {
      value,
      expiresAt: this.now() + ttlMs,
      size,
      lastAccess: ++this.accessSequence,
    });
    this.bytes += size;
    this.evictToLimit();
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.bytes -= entry.size;
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  stats(): RequestCacheStats {
    this.removeExpired();
    return {
      entries: this.entries.size,
      bytes: this.bytes,
      inFlight: this.inFlight.size,
      queued: this.queue.length,
      active: this.active,
      concurrency: this.concurrency,
      maxBytes: this.maxBytes,
    };
  }

  private schedule<T>(run: () => Promise<T>): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({ run, resolve, reject } as QueueTask<unknown>);
    });
    this.pump();
    return promise;
  }

  private pump(): void {
    while (this.active < this.concurrency) {
      const task = this.queue.shift();
      if (!task) return;
      this.active += 1;
      void task
        .run()
        .then(task.resolve, task.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }

  private removeExpired(): void {
    const currentTime = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= currentTime) this.delete(key);
    }
  }

  private evictToLimit(): void {
    while (this.bytes > this.maxBytes && this.entries.size) {
      let oldestKey: K | undefined;
      let oldestAccess = Number.POSITIVE_INFINITY;
      let found = false;
      for (const [key, entry] of this.entries) {
        if (entry.lastAccess < oldestAccess) {
          oldestKey = key;
          oldestAccess = entry.lastAccess;
          found = true;
        }
      }
      if (!found) return;
      this.delete(oldestKey as K);
    }
  }
}
