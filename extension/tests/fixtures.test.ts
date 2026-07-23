import { createDefaultAutomationSettings } from "@eloscope/core";
import { describe, expect, it } from "vitest";
import { VisibleDomAutomationRunner } from "../src/automations";
import { BUILT_IN_CAPABILITIES } from "../src/compatibility";
import { loadFixture } from "./fixture";

describe("DOM contract fixtures", () => {
  it.each(["logged-out", "profile", "history", "active-room", "veto", "server-ready", "finished-room"])(
    "loads %s without an accidental click",
    (name) => {
      loadFixture(name);
      const route = name.includes("room") || name === "veto" || name === "server-ready"
        ? ({ kind: "match", matchId: "11111111-2222-3333-4444-555555555555" } as const)
        : ({ kind: "other" } as const);
      const result = new VisibleDomAutomationRunner().run(document, route, createDefaultAutomationSettings(), { ...BUILT_IN_CAPABILITIES });
      expect(result.clicked).toBe(false);
    }
  );

  it("models the verified two-sided FACEIT match header contract", () => {
    loadFixture("active-room");
    const wrapper = document.querySelector<HTMLElement>('[class*="styles__HeaderWrapper-sc-"]');
    const factions = wrapper?.querySelectorAll('[class*="styles__Faction-sc-"]');
    const names = wrapper?.querySelectorAll('[class*="styles__StyledFactionName-sc-"]');

    expect(wrapper).not.toBeNull();
    expect(factions).toHaveLength(2);
    expect(names).toHaveLength(2);
    expect(factions?.[0]?.parentElement).toBe(factions?.[1]?.parentElement);
    expect(factions?.[0]?.parentElement?.parentElement).toBe(wrapper?.firstElementChild);
  });

  it("models the unique visible FACEIT profile mount and summary-card anchor", () => {
    loadFixture("profile");
    const primary = document.querySelector<HTMLElement>('[class*="styles__PrimaryContent-sc-"]');
    const main = primary?.querySelectorAll<HTMLElement>('[class*="styles__MainSection-sc-"]');
    const cards = main?.[0]?.querySelectorAll<HTMLElement>('[class*="styles__CardStack-sc-"]');

    expect(primary).not.toBeNull();
    expect(primary?.querySelectorAll('[class*="styles__TopSection-sc-"]')).toHaveLength(1);
    expect(main).toHaveLength(1);
    expect(main?.[0]?.dataset.eloscopeVisible).toBe("true");
    expect(cards).toHaveLength(1);
    expect(cards?.[0]?.nextElementSibling?.getAttribute("data-testid")).toBe("native-profile-survey");
  });

  it("models the unique visible FACEIT history mount and preserves its native table wrapper", () => {
    loadFixture("history");
    const primary = document.querySelector<HTMLElement>('[class*="styles__PrimaryContent-sc-"]');
    const main = primary?.querySelectorAll<HTMLElement>('[class*="styles__MainSection-sc-"]');
    const nativeWrapper = main?.[0]?.querySelector<HTMLElement>('[data-testid="native-history-wrapper"]');
    const tables = main?.[0]?.querySelectorAll<HTMLElement>('[class*="styles__MatchTable-sc-"]');

    expect(primary).not.toBeNull();
    expect(primary?.querySelectorAll('[class*="styles__TopSection-sc-"]')).toHaveLength(1);
    expect(main).toHaveLength(1);
    expect(main?.[0]?.dataset.eloscopeVisible).toBe("true");
    expect(tables).toHaveLength(1);
    expect(nativeWrapper?.contains(tables?.[0] ?? null)).toBe(true);
    expect(nativeWrapper?.querySelector("button")?.textContent).toContain("Show more");
  });

  it("models the unique finished-room map card and native back CTA in one validated container", () => {
    loadFixture("finished-room");
    const containers = document.querySelectorAll<HTMLElement>('[class*="Finished__Container-sc-"]');
    const sections = document.querySelectorAll<HTMLElement>('[class*="Finished__Section-sc-"]');
    const preferenceContainers = document.querySelectorAll<HTMLElement>('[class*="Preferences__Container-sc-"]');
    const container = containers[0];
    const section = sections[0];
    const preferences = preferenceContainers[0];
    const preferenceCards = preferences?.querySelectorAll<HTMLElement>('[data-testid="matchPreference"]');
    const mapCards = Array.from(preferenceCards ?? []).filter((card) =>
      card.previousElementSibling?.querySelector('[data-testid="mapsVetoHistory"]')
    );
    const serverCards = Array.from(preferenceCards ?? []).filter((card) =>
      card.previousElementSibling?.querySelector('[data-testid="serverVetoHistory"]')
    );
    const directChildren = Array.from(container?.children ?? []);
    const demo = directChildren.find((child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.testid === "watch-demo"
    );
    const matchmaking = directChildren.find((child): child is HTMLElement =>
      child instanceof HTMLElement && child.dataset.testid === "back-to-matchmaking"
    );

    expect(containers).toHaveLength(1);
    expect(sections).toHaveLength(1);
    expect(preferenceContainers).toHaveLength(1);
    expect(section?.parentElement).toBe(container);
    expect(preferences?.parentElement).toBe(section);
    expect(section?.firstElementChild).toBe(preferences);
    expect(preferenceCards).toHaveLength(2);
    expect(serverCards).toHaveLength(1);
    expect(serverCards[0]?.textContent).toBe("Germany");
    expect(mapCards).toHaveLength(1);
    expect(mapCards[0]?.textContent).toBe("Dust2");
    expect(mapCards[0]?.parentElement).toBe(preferences);
    expect(mapCards[0]?.previousElementSibling?.parentElement).toBe(preferences);
    expect(matchmaking?.matches('[data-testid="back-to-matchmaking"]')).toBe(true);
    expect(matchmaking?.parentElement).toBe(container);
    expect(container?.contains(mapCards[0] ?? null)).toBe(true);
    expect(demo?.previousElementSibling).toBe(section);
    expect(matchmaking?.previousElementSibling).toBe(demo);
    expect(container?.querySelectorAll('[class*="Finished__Action-sc-"]')).toHaveLength(2);
  });
});
