import { afterEach, describe, expect, it } from "vitest";

import { readyState, restrictedState, type PlayerMatch } from "@eloscope/core";

import {
  PROFILE_STATS_BANNER_ATTRIBUTE,
  ProfileStatsBannerRenderer,
} from "../src/profile-stats-banner";
import { loadFixture } from "./fixture";

const player = {
  id: "fixture-player",
  nickname: "fixture-player",
  game: "cs2",
  elo: 2_486,
  officialLevel: 10,
};

function matches(count = 20): PlayerMatch[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `match-${index}`,
    playerId: player.id,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: Date.UTC(2026, 6, 23) - index * 60_000,
    result: index < 13 ? "win" as const : "loss" as const,
    map: index % 2 === 0 ? "dust2" : "mirage",
    roundsPlayed: 20,
    kills: 20 + (index % 2),
    assists: 4,
    deaths: 16,
    damage: 1_900,
    headshots: 9,
    firstKills: 2,
    survivedRounds: 4,
  }));
}

function host(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${PROFILE_STATS_BANNER_ATTRIBUTE}]`);
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("ProfileStatsBannerRenderer", () => {
  it("mounts after the unique native summary card and renders truthful last-20 metrics", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();

    expect(renderer.render(player, readyState(matches()))).toBe(true);

    const banner = host();
    const nativeCard = document.querySelector('[data-testid="native-profile-card-stack"]');
    expect(banner?.previousElementSibling).toBe(nativeCard);
    expect(banner?.nextElementSibling?.getAttribute("data-testid")).toBe("native-profile-survey");
    expect(banner?.getAttribute(PROFILE_STATS_BANNER_ATTRIBUTE)).toBe(player.id);
    expect(banner?.shadowRoot?.querySelector('[role="region"]')).not.toBeNull();
    expect(banner?.shadowRoot?.textContent).toContain("Последние 20 матчей");
    expect(banner?.shadowRoot?.textContent).toContain("13 / 7");
    expect(banner?.shadowRoot?.textContent).toContain("65,0%");
    expect(banner?.shadowRoot?.textContent).toContain("20,5 / 16,0 / 4,0");

    const sameHost = banner;
    const sameRegion = banner?.shadowRoot?.querySelector('[role="region"]');
    expect(renderer.sync()).toBe(true);
    expect(host()).toBe(sameHost);
    expect(host()?.shadowRoot?.querySelector('[role="region"]')).toBe(sameRegion);

    renderer.destroy();
    expect(host()).toBeNull();
  });

  it("keeps an off-screen layout anchor eligible instead of requiring viewport intersection", () => {
    loadFixture("profile");
    document.querySelector<HTMLElement>('[class*="styles__MainSection-sc-"]')
      ?.removeAttribute("data-eloscope-visible");
    document.querySelector<HTMLElement>('[class*="styles__CardStack-sc-"]')
      ?.removeAttribute("data-eloscope-visible");
    const renderer = new ProfileStatsBannerRenderer();

    expect(renderer.render(player, readyState(matches()))).toBe(true);
    expect(host()).not.toBeNull();
  });

  it("renders the independently selected profile sample window", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();

    expect(renderer.render(player, readyState(matches(30)), 10)).toBe(true);
    expect(host()?.shadowRoot?.querySelector(".window")?.textContent).toBe("10");
    expect(host()?.shadowRoot?.textContent).toContain("Последние 10 матчей");
    expect(host()?.shadowRoot?.textContent).not.toContain("13 / 7");
  });

  it("fails closed for missing or ambiguous native anchors", () => {
    loadFixture("profile");
    const main = document.querySelector<HTMLElement>('[class*="styles__MainSection-sc-"]')!;
    main.append(document.createElement("section"));
    main.lastElementChild!.className = "styles__CardStack-sc-duplicate";
    (main.lastElementChild as HTMLElement).dataset.eloscopeVisible = "true";
    const renderer = new ProfileStatsBannerRenderer();

    expect(renderer.render(player, readyState(matches()))).toBe(false);
    expect(host()).toBeNull();

    main.lastElementChild?.remove();
    expect(renderer.sync()).toBe(true);
    expect(host()).not.toBeNull();
    main.querySelector('[class*="styles__CardStack-sc-"]')?.remove();
    expect(renderer.sync()).toBe(false);
    expect(host()).toBeNull();
  });

  it("ignores a hidden stale SPA profile container but fails closed for two visible containers", () => {
    loadFixture("profile");
    const primary = document.querySelector<HTMLElement>('[class*="styles__PrimaryContent-sc-"]')!;
    const stale = primary.cloneNode(true) as HTMLElement;
    stale.hidden = true;
    document.body.append(stale);
    const renderer = new ProfileStatsBannerRenderer();

    expect(renderer.render(player, readyState(matches()))).toBe(true);
    expect(host()).not.toBeNull();

    stale.hidden = false;
    expect(renderer.sync()).toBe(false);
    expect(host()).toBeNull();
  });

  it("reattaches one existing host after a React-style main-section replacement", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, readyState(matches()));
    const originalHost = host();
    const main = document.querySelector<HTMLElement>('[class*="styles__MainSection-sc-"]')!;

    main.innerHTML = `
      <section class="styles__CardStack-sc-replacement" data-eloscope-visible="true">Replacement</section>
      <section data-testid="native-profile-survey">Survey</section>
    `;
    expect(originalHost?.isConnected).toBe(false);
    expect(renderer.sync()).toBe(true);
    expect(host()).toBe(originalHost);
    expect(document.querySelectorAll(`[${PROFILE_STATS_BANNER_ATTRIBUTE}]`)).toHaveLength(1);
    expect(host()?.previousElementSibling?.textContent).toBe("Replacement");
  });

  it("updates the host identity when the same native container displays another player", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, readyState(matches()));
    const originalHost = host();

    renderer.render(
      { ...player, id: "other-player", nickname: "other-player" },
      readyState(matches().map((row) => ({ ...row, playerId: "other-player" }))),
    );

    expect(host()).toBe(originalHost);
    expect(host()?.getAttribute(PROFILE_STATS_BANNER_ATTRIBUTE)).toBe("other-player");
  });

  it("shows explicit loading and restricted states without fake zeros", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, { status: "loading" });
    expect(host()?.shadowRoot?.querySelector('[role="status"]')?.getAttribute("aria-label"))
      .toBe("Загрузка статистики последних матчей");
    expect(host()?.shadowRoot?.textContent).not.toContain("0,0%");

    renderer.render(player, restrictedState("Профиль закрыт"));
    expect(host()?.shadowRoot?.textContent).toContain("Статистика недоступна");
    expect(host()?.shadowRoot?.textContent).toContain("Профиль закрыт");
  });

  it("shows honest empty and error states", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, readyState([]));
    expect(host()?.shadowRoot?.textContent).toContain("Нет завершённых матчей");
    expect(host()?.shadowRoot?.textContent).not.toContain("0 / 0");

    renderer.render(player, {
      status: "error",
      error: { code: "upstream", message: "FACEIT unavailable", retryable: true },
    });
    expect(host()?.shadowRoot?.textContent).toContain("Не удалось загрузить статистику");
    expect(host()?.shadowRoot?.textContent).toContain("временно не отвечает");
  });

  it("keeps optional metrics unavailable when FACEIT coverage is incomplete", () => {
    loadFixture("profile");
    const rows = matches(2);
    delete rows[1]!.headshots;
    delete rows[1]!.firstKills;
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, readyState(rows));

    const shadow = host()?.shadowRoot;
    const hs = Array.from(shadow?.querySelectorAll(".metric") ?? [])
      .find((candidate) => candidate.querySelector("dt")?.textContent === "HS%");
    expect(hs?.querySelector("dd")?.textContent).toBe("—");
    expect(hs?.textContent).toContain("1/2 матчей");

    shadow?.querySelector<HTMLButtonElement>('[data-tab="combat"]')?.click();
    const firstKills = Array.from(shadow?.querySelectorAll(".metric") ?? [])
      .find((candidate) => candidate.querySelector("dt")?.textContent === "First kills");
    expect(firstKills?.querySelector("dd")?.textContent).toBe("—");
    expect(firstKills?.textContent).toContain("1/2 матчей");
  });

  it("provides interactive Overview, Combat, Maps and Role tabs", () => {
    loadFixture("profile");
    const renderer = new ProfileStatsBannerRenderer();
    renderer.render(player, readyState(matches()));
    const shadow = host()?.shadowRoot;

    const tabs = shadow?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs).toHaveLength(4);
    const overview = shadow?.querySelector<HTMLButtonElement>('[data-tab="overview"]');
    expect(overview?.getAttribute("aria-selected")).toBe("true");
    expect(overview?.getAttribute("aria-controls")).toBe("eloscope-profile-stats-panel-overview");
    expect(shadow?.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby"))
      .toBe("eloscope-profile-stats-tab-overview");
    expect(shadow?.querySelectorAll('[role="tabpanel"]')).toHaveLength(4);
    expect(shadow?.querySelectorAll('[role="tabpanel"][hidden]')).toHaveLength(3);
    for (const tab of Array.from(tabs ?? [])) {
      expect(shadow?.getElementById(tab.getAttribute("aria-controls") ?? "")).not.toBeNull();
    }

    overview?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(host()?.shadowRoot?.querySelector('[data-tab="combat"]')?.getAttribute("aria-selected"))
      .toBe("true");

    host()?.shadowRoot?.querySelector<HTMLButtonElement>('[data-tab="maps"]')?.click();
    expect(host()?.shadowRoot?.textContent).toContain("dust2");
    expect(host()?.shadowRoot?.textContent).toContain("mirage");

    host()?.shadowRoot?.querySelector<HTMLButtonElement>('[data-tab="role"]')?.click();
    expect(host()?.shadowRoot?.textContent).toContain("Снайпер");
    expect(host()?.shadowRoot?.textContent).toContain("Энтри");
  });
});
