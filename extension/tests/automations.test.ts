import { createDefaultAutomationSettings } from "@eloscope/core";
import { describe, expect, it, vi } from "vitest";
import { VisibleDomAutomationRunner } from "../src/automations";
import { BUILT_IN_CAPABILITIES } from "../src/compatibility";
import { loadFixture } from "./fixture";

const route = { kind: "match", matchId: "11111111-2222-3333-4444-555555555555" } as const;

describe("visible DOM-only automations", () => {
  it("does nothing while all opt-ins are false", () => {
    loadFixture("active-room");
    const ready = document.querySelector("button") as HTMLButtonElement;
    const spy = vi.spyOn(ready, "click");
    const result = new VisibleDomAutomationRunner().run(document, route, createDefaultAutomationSettings(), { ...BUILT_IN_CAPABILITIES });
    expect(result.clicked).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("clicks the one visible ready button after opt-in", () => {
    loadFixture("active-room");
    const ready = document.querySelector('[data-testid="match-ready-button"]') as HTMLButtonElement;
    const spy = vi.spyOn(ready, "click");
    const settings = createDefaultAutomationSettings();
    settings.readyUp = true;
    expect(new VisibleDomAutomationRunner().run(document, route, settings, { ...BUILT_IN_CAPABILITIES })).toEqual({ action: "readyUp", clicked: true });
    expect(spy).toHaveBeenCalledOnce();
  });

  it("uses captain turn and configured map order", () => {
    loadFixture("veto");
    const mirage = document.querySelector('[data-testid="veto-map-mirage"]') as HTMLButtonElement;
    const spy = vi.spyOn(mirage, "click");
    const settings = createDefaultAutomationSettings();
    settings.mapVeto = { enabled: true, banOrder: ["mirage", "nuke"], pickOrder: [] };
    expect(new VisibleDomAutomationRunner().run(document, route, settings, { ...BUILT_IN_CAPABILITIES }).action).toBe("mapVeto");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("fails closed on selector drift", () => {
    loadFixture("selector-drift");
    const unknown = document.querySelector("button") as HTMLButtonElement;
    const spy = vi.spyOn(unknown, "click");
    const settings = createDefaultAutomationSettings();
    settings.readyUp = true;
    settings.mapVeto = { enabled: true, banOrder: ["mirage"], pickOrder: [] };
    const result = new VisibleDomAutomationRunner().run(document, route, settings, { ...BUILT_IN_CAPABILITIES });
    expect(result.clicked).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed when a selector is ambiguous", () => {
    loadFixture("active-room");
    const duplicate = document.querySelector('[data-testid="match-ready-button"]')?.cloneNode(true);
    document.querySelector("main")?.append(duplicate as Node);
    const buttons = [...document.querySelectorAll('[data-testid="match-ready-button"]')] as HTMLButtonElement[];
    const spies = buttons.map((button) => vi.spyOn(button, "click"));
    const settings = createDefaultAutomationSettings();
    settings.readyUp = true;
    expect(new VisibleDomAutomationRunner().run(document, route, settings, { ...BUILT_IN_CAPABILITIES }).clicked).toBe(false);
    spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("arms only the unique visible steam link for the native policy", async () => {
    loadFixture("server-ready");
    const anchor = document.querySelector('[data-testid="connect-to-server"]') as HTMLAnchorElement;
    let armedDuringClick = false;
    vi.spyOn(anchor, "click").mockImplementation(() => {
      armedDuringClick = anchor.dataset.eloscopeAutoConnect === "armed";
    });
    const settings = createDefaultAutomationSettings();
    settings.autoConnect = true;
    const result = new VisibleDomAutomationRunner().run(document, route, settings, { ...BUILT_IN_CAPABILITIES });
    expect(result).toEqual({ action: "connect", clicked: true });
    expect(armedDuringClick).toBe(true);
    await Promise.resolve();
    expect(anchor.dataset.eloscopeAutoConnect).toBeUndefined();
  });

  it("honours a remote kill switch even when the user opted in", () => {
    loadFixture("active-room");
    const ready = document.querySelector('[data-testid="match-ready-button"]') as HTMLButtonElement;
    const spy = vi.spyOn(ready, "click");
    const settings = createDefaultAutomationSettings();
    settings.readyUp = true;
    const capabilities = { ...BUILT_IN_CAPABILITIES, readyUp: false };
    expect(new VisibleDomAutomationRunner().run(document, route, settings, capabilities).clicked).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("requires an explicit active server-veto phase", () => {
    document.body.innerHTML = `<main data-match-id="${route.matchId}">
      <div data-testid="veto-your-turn" data-state="active" data-eloscope-visible="true"></div>
      <button data-testid="veto-server-dallas" data-eloscope-visible="true">Dallas</button>
    </main>`;
    const button = document.querySelector("button") as HTMLButtonElement;
    const spy = vi.spyOn(button, "click");
    const settings = createDefaultAutomationSettings();
    settings.serverVeto = { enabled: true, order: ["dallas"] };
    const runner = new VisibleDomAutomationRunner();
    expect(runner.run(document, route, settings, { ...BUILT_IN_CAPABILITIES }).clicked).toBe(false);
    document.querySelector("main")?.insertAdjacentHTML(
      "afterbegin",
      '<div data-testid="server-veto" data-state="active" data-eloscope-visible="true"></div>',
    );
    expect(runner.run(document, route, settings, { ...BUILT_IN_CAPABILITIES }).action).toBe("serverVeto");
    expect(spy).toHaveBeenCalledOnce();
  });
});
