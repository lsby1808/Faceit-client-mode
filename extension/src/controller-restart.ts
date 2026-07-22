export type RestartableController = {
  start(): Promise<void>;
  destroy(): void;
};

/**
 * Serializes controller startup while making restart requests latest-wins.
 * In-flight controllers are destroyed synchronously so stale automation
 * settings cannot become active after a slow compatibility/data read.
 */
export class LatestControllerLifecycle<T extends RestartableController> {
  #active: T | undefined;
  #starting: T | undefined;
  #generation = 0;
  #queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly create: () => T,
    private readonly afterStart?: (controller: T) => void | Promise<void>
  ) {}

  get current(): T | undefined {
    return this.#active;
  }

  restart(): Promise<void> {
    const generation = ++this.#generation;
    this.#active?.destroy();
    this.#active = undefined;
    this.#starting?.destroy();
    this.#starting = undefined;

    this.#queue = this.#queue.catch(() => undefined).then(async () => {
      if (generation !== this.#generation) return;
      const next = this.create();
      this.#starting = next;
      try {
        await next.start();
        if (generation !== this.#generation || this.#starting !== next) return;
        this.#starting = undefined;
        this.#active = next;
        await this.afterStart?.(next);
      } catch (error) {
        next.destroy();
        if (this.#starting === next) this.#starting = undefined;
        if (this.#active === next) this.#active = undefined;
        if (generation === this.#generation) throw error;
      }
    });
    return this.#queue;
  }

  destroy(): void {
    this.#generation += 1;
    this.#active?.destroy();
    this.#active = undefined;
    this.#starting?.destroy();
    this.#starting = undefined;
  }
}
