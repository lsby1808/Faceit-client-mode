import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSelectedMapVisible, PositionSendLedger, QuickPositionSender, visibleSelectedMap } from "../src/positions";
import { loadFixture } from "./fixture";

class TestLockManager {
  readonly #tails = new Map<string, Promise<void>>();

  async request<T>(
    name: string,
    _options: LockOptions,
    callback: () => T | PromiseLike<T>
  ): Promise<T> {
    const previous = this.#tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    this.#tails.set(name, tail);
    await previous;
    try {
      return await callback();
    } finally {
      release();
      if (this.#tails.get(name) === tail) this.#tails.delete(name);
    }
  }
}

beforeEach(() => {
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: new TestLockManager() as unknown as LockManager
  });
});

afterEach(() => {
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
});

describe("quick positions", () => {
  it("accepts only one visible selected-map contract", () => {
    loadFixture("active-room");
    expect(visibleSelectedMap(document)).toBe("mirage");
    expect(isSelectedMapVisible(document, "Mirage")).toBe(true);
    document.querySelector("main")?.insertAdjacentHTML(
      "afterbegin",
      '<div data-testid="selected-map" data-map-id="nuke" data-eloscope-visible="true"></div>',
    );
    expect(visibleSelectedMap(document)).toBeNull();
  });
  it("sends once through visible FACEIT chat and deduplicates", async () => {
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const roomButton = document.querySelector('[data-testid="chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const roomSpy = vi.spyOn(roomButton, "click");
    const sender = new QuickPositionSender();
    const first = await sender.send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A", "confirm");
    const second = await sender.send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A", "confirm");
    expect(first).toBe("sent");
    expect(second).toBe("duplicate");
    expect(spy).toHaveBeenCalledOnce();
    expect(roomSpy).not.toHaveBeenCalled();
    expect((document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement).value).toBe("I play A");
    expect((document.querySelector('[data-testid="room-chat"] textarea') as HTMLTextAreaElement).value).toBe("");
  });

  it("prefills without clicking send", async () => {
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const result = await new QuickPositionSender().send(document, "11111111-2222-3333-4444-555555555555", "nuke", "Ramp", "prefill");
    expect(result).toBe("prepared");
    expect(spy).not.toHaveBeenCalled();
  });

  it("atomically reserves concurrent sends", async () => {
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const results = await Promise.all([
      new QuickPositionSender().send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A concurrent", "auto"),
      new QuickPositionSender().send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A concurrent", "auto"),
    ]);
    expect(results.sort()).toEqual(["duplicate", "sent"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fails closed to a prepared message when Web Locks are unavailable", async () => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const input = document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement;
    const spy = vi.spyOn(sendButton, "click");

    const result = await new QuickPositionSender().send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Lock fallback",
      "confirm"
    );

    expect(result).toBe("prepared");
    expect(input.value).toBe("Lock fallback");
    expect(spy).not.toHaveBeenCalled();
  });

  it("releases a reservation when the controller is destroyed while reserve is pending", async () => {
    loadFixture("active-room");
    const ledger = new PositionSendLedger();
    let finishReserve!: (reserved: boolean) => void;
    const reserve = vi.spyOn(ledger, "reserve").mockImplementation(() => new Promise<boolean>((resolve) => {
      finishReserve = resolve;
    }));
    const release = vi.spyOn(ledger, "release");
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const input = document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement;
    const click = vi.spyOn(sendButton, "click");
    const lifecycle = new AbortController();

    const pending = new QuickPositionSender(ledger).send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Abort before mutation",
      "auto",
      lifecycle.signal
    );
    await vi.waitFor(() => expect(reserve).toHaveBeenCalledOnce());
    lifecycle.abort();
    finishReserve(true);

    await expect(pending).resolves.toBe("chat-unavailable");
    expect(release).toHaveBeenCalledOnce();
    expect(input.value).toBe("");
    expect(click).not.toHaveBeenCalled();
  });

  it("does not click when a durable reservation cannot be written", async () => {
    loadFixture("active-room");
    const storage = vi.spyOn(chrome.storage.local, "set").mockRejectedValueOnce(new Error("disk"));
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const input = document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement;
    const click = vi.spyOn(sendButton, "click");

    const result = await new QuickPositionSender().send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Durable first",
      "confirm"
    );

    expect(result).toBe("prepared");
    expect(input.value).toBe("Durable first");
    expect(click).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("retains the durable pending marker when post-click commit is interrupted", async () => {
    loadFixture("active-room");
    const firstLedger = new PositionSendLedger();
    vi.spyOn(firstLedger, "commit").mockRejectedValueOnce(new Error("context destroyed"));
    const sendButton = document.querySelector('[data-testid="team-chat-send"]') as HTMLButtonElement;
    const click = vi.spyOn(sendButton, "click");
    const args = [
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Unknown outcome",
      "auto"
    ] as const;

    await expect(new QuickPositionSender(firstLedger).send(...args)).resolves.toBe("prepared");
    await expect(new QuickPositionSender().send(...args)).resolves.toBe("duplicate");
    expect(click).toHaveBeenCalledOnce();
  });

  it("uses the current FACEIT enter-to-send contract when no send button exists", async () => {
    loadFixture("active-room");
    document.querySelector('[data-testid="team-chat-send"]')?.remove();
    const input = document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement;
    const room = document.querySelector('[data-testid="room-chat"] textarea') as HTMLTextAreaElement;
    const keySpy = vi.fn((event: KeyboardEvent) => {
      if (event.key === "Enter") input.value = "";
    });
    input.addEventListener("keydown", keySpy);

    const result = await new QuickPositionSender().send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Connector",
      "confirm"
    );

    expect(result).toBe("sent");
    expect(keySpy).toHaveBeenCalledOnce();
    expect(room.value).toBe("");
  });

  it("keeps the message prepared when FACEIT does not acknowledge enter-to-send", async () => {
    loadFixture("active-room");
    document.querySelector('[data-testid="team-chat-send"]')?.remove();
    const input = document.querySelector('[data-testid="team-chat-input"]') as HTMLTextAreaElement;
    const sender = new QuickPositionSender();

    const result = await sender.send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Connector fallback",
      "auto"
    );

    expect(result).toBe("prepared");
    expect(input.value).toBe("Connector fallback");
  });

  it("fails closed when the current team-chat structure is ambiguous", async () => {
    loadFixture("active-room");
    document.querySelector('[data-testid="team-chat"]')?.insertAdjacentHTML(
      "afterend",
      `<section>
        <div id="scrollable-container-team-11111111-2222-3333-4444-555555555555_other-team@muclight.chat.faceit.com" data-eloscope-visible="true"></div>
        <textarea enterkeyhint="send" aria-multiline="true" data-eloscope-visible="true"></textarea>
      </section>`
    );
    const result = await new QuickPositionSender().send(
      document,
      "11111111-2222-3333-4444-555555555555",
      "mirage",
      "Connector",
      "confirm"
    );
    expect(result).toBe("chat-unavailable");
  });
});
