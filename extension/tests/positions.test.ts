import { describe, expect, it, vi } from "vitest";
import { isSelectedMapVisible, QuickPositionSender, visibleSelectedMap } from "../src/positions";
import { loadFixture } from "./fixture";

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
    const sendButton = document.querySelector('[data-testid="chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const sender = new QuickPositionSender();
    const first = await sender.send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A", "confirm");
    const second = await sender.send(document, "11111111-2222-3333-4444-555555555555", "mirage", "I play A", "confirm");
    expect(first).toBe("sent");
    expect(second).toBe("duplicate");
    expect(spy).toHaveBeenCalledOnce();
    expect((document.querySelector('[data-testid="chat-input"]') as HTMLTextAreaElement).value).toBe("I play A");
  });

  it("prefills without clicking send", async () => {
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const result = await new QuickPositionSender().send(document, "11111111-2222-3333-4444-555555555555", "nuke", "Ramp", "prefill");
    expect(result).toBe("prepared");
    expect(spy).not.toHaveBeenCalled();
  });

  it("atomically reserves concurrent sends", async () => {
    loadFixture("active-room");
    const sendButton = document.querySelector('[data-testid="chat-send"]') as HTMLButtonElement;
    const spy = vi.spyOn(sendButton, "click");
    const sender = new QuickPositionSender();
    const results = await Promise.all([
      sender.send(document, "match-concurrent", "mirage", "I play A", "auto"),
      sender.send(document, "match-concurrent", "mirage", "I play A", "auto"),
    ]);
    expect(results.sort()).toEqual(["duplicate", "sent"]);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
