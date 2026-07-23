import { getEloTierPresentation, type Player } from "@eloscope/core";
import { describe, expect, it, vi } from "vitest";

import {
  NATIVE_TIER_ATTRIBUTE,
  NATIVE_TIER_RAIL_ATTRIBUTE,
  NativeTierSurfaceRenderer,
} from "../src/native-tier-surfaces";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    nickname: "Alpha",
    game: "cs2",
    elo: 2_401,
    officialLevel: 10,
    ...overrides,
  };
}

function skillIcon(level = 10, size = 32, style = ""): string {
  return `<svg class="SkillIcon__StyledSvg-sc-fixture-1" width="${size}" height="${size}"${
    style ? ` style="${style}"` : ""
  }><title>Skill level ${level}</title></svg>`;
}

function matchmakingWidget(extraIcon = ""): string {
  return `
    <div class="Header__Container-sc-fixture-1">
      <div
        class="EloWidget-module__fixture__widgetContainer"
        style="display:grid;grid-template-areas:'icon content';grid-template-columns:auto 1fr"
      >
        ${skillIcon(10, 106, "grid-area:icon;align-self:flex-end;justify-self:start")}
        <button class="style__EloValueRow-sc-fixture-1" style="grid-area:content">
          <span>2 401</span>
        </button>
        ${extraIcon}
      </div>
    </div>
  `;
}

function partyPlayer(nickname = "Alpha", elo = 2_401): string {
  return `
    <div class="styles__PlayerCardContainer-sc-fixture-1">
      <span>${nickname}</span>
      <div class="styles__PartyLevelSlot-sc-fixture-1">${skillIcon(10, 32)}</div>
      <span>${elo.toLocaleString("ru-RU")}</span>
    </div>`;
}

function profileSurfaces(elo = 2_401): string {
  const displayedElo = elo.toLocaleString("ru-RU");
  return `
    <main class="styles__MainSection-sc-fixture-1">
      <section class="styles__CardStack-sc-fixture-1">
        <div class="styles__SkillIconContainer-sc-fixture-1">${skillIcon(10, 64)}<span>${displayedElo}</span></div>
      </section>
      <section class="styles__RightPanel-sc-fixture-1">
        <footer class="styles__CurrentElo-sc-fixture-1">${skillIcon(10, 24)}<span>${displayedElo}</span></footer>
      </section>
      <a class="styles__MatchLink-sc-fixture-1" href="/en/cs2/room/match-1">${skillIcon(10, 24)}</a>
      <section class="Roster__Group-sc-fixture-1">${skillIcon(10, 30)}</section>
    </main>
  `;
}

function nativeProgressRail(options: { challenger?: boolean; omitLevel?: number; elo?: number } = {}): string {
  const levels = Array.from({ length: 10 }, (_, index) => index + 1)
    .filter((level) => level !== options.omitLevel)
    .map((level) => skillIcon(level, 24))
    .join("");
  const challenger = options.challenger === false
    ? ""
    : '<svg class="ChallengerIcon-sc-fixture-1"><title>Challenger rank</title></svg>';
  const elo = options.elo ?? 2_401;
  return `
    <section class="styles__Container-sc-progress-fixture-1">
      <div class="styles__TopSection-sc-progress-fixture-1">
        <div class="styles__CurrentElo-sc-fixture-1">${skillIcon(10, 48)}<span>${elo.toLocaleString("ru-RU")}</span></div>
        <div class="styles__NextLevel-sc-fixture-1"><span>1 149</span><span>до Challenger</span></div>
      </div>
      <section class="styles__SkillLevelsSection-sc-fixture-1">${levels}${challenger}</section>
    </section>`;
}

function tierHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${NATIVE_TIER_ATTRIBUTE}]`));
}

describe("NativeTierSurfaceRenderer", () => {
  it("replaces the single matchmaking EloWidget icon idempotently and restores exact native state", () => {
    document.body.innerHTML = matchmakingWidget();
    const native = document.querySelector<SVGSVGElement>('svg[class*="SkillIcon__StyledSvg"]') as SVGSVGElement;
    native.style.setProperty("display", "inline-block", "important");
    native.setAttribute("aria-hidden", "false");
    const renderer = new NativeTierSurfaceRenderer();

    expect(renderer.syncMatchmaking(player(), true)).toBe(1);
    const host = document.querySelector<HTMLElement>(`[${NATIVE_TIER_ATTRIBUTE}]`) as HTMLElement;
    const renderedTier = host.shadowRoot?.querySelector<HTMLElement>('[data-tier="11"]');
    expect(host.getAttribute(NATIVE_TIER_ATTRIBUTE)).toBe("matchmaking:main:player-1");
    expect(host.nextElementSibling).toBe(native);
    expect(host.style.getPropertyValue("--es-native-tier-size")).toBe("106px");
    expect(host.style.getPropertyValue("grid-area")).toBe("icon");
    expect(host.style.getPropertyValue("align-self")).toBe("flex-end");
    expect(host.style.getPropertyValue("justify-self")).toBe("start");
    expect(renderedTier?.textContent).toBe("11");
    expect(renderedTier?.getAttribute("aria-label")).toContain("official FACEIT level 10");
    expect(renderedTier?.tabIndex).toBe(0);
    expect(renderedTier?.style.getPropertyValue("--tier-fg")).toBe(getEloTierPresentation(11).foreground);
    expect(native.style.getPropertyValue("display")).toBe("none");
    expect(native.style.getPropertyPriority("display")).toBe("important");
    expect(native.getAttribute("aria-hidden")).toBe("true");

    const displayWrites = vi.spyOn(native.style, "setProperty");
    const ariaWrites = vi.spyOn(native, "setAttribute");
    const hostStyleWrites = vi.spyOn(host.style, "setProperty");
    const hostStyleRemovals = vi.spyOn(host.style, "removeProperty");
    expect(renderer.syncMatchmaking(player(), true)).toBe(1);
    expect(document.querySelector(`[${NATIVE_TIER_ATTRIBUTE}]`)).toBe(host);
    expect(host.shadowRoot?.querySelector('[data-tier="11"]')).toBe(renderedTier);
    expect(displayWrites).not.toHaveBeenCalled();
    expect(ariaWrites).not.toHaveBeenCalled();
    expect(hostStyleWrites).not.toHaveBeenCalled();
    expect(hostStyleRemovals).not.toHaveBeenCalled();
    displayWrites.mockRestore();
    ariaWrites.mockRestore();
    hostStyleWrites.mockRestore();
    hostStyleRemovals.mockRestore();

    native.style.setProperty("align-self", "center");
    native.setAttribute("width", "54");
    native.setAttribute("height", "54");
    expect(renderer.syncMatchmaking(player(), true)).toBe(1);
    expect(document.querySelector(`[${NATIVE_TIER_ATTRIBUTE}]`)).toBe(host);
    expect(host.style.getPropertyValue("align-self")).toBe("center");
    expect(host.style.getPropertyValue("--es-native-tier-size")).toBe("54px");

    expect(renderer.syncMatchmaking(player(), false)).toBe(0);
    expect(document.querySelector(`[${NATIVE_TIER_ATTRIBUTE}]`)).toBeNull();
    expect(native.style.getPropertyValue("display")).toBe("inline-block");
    expect(native.style.getPropertyPriority("display")).toBe("important");
    expect(native.getAttribute("aria-hidden")).toBe("false");
  });

  it("fails closed for missing, ambiguous, hidden, or untrusted matchmaking contracts", () => {
    const renderer = new NativeTierSurfaceRenderer();
    document.body.innerHTML = `${matchmakingWidget()}${matchmakingWidget()}`;
    expect(renderer.syncMatchmaking(player(), true)).toBe(0);
    expect(tierHosts()).toHaveLength(0);

    document.body.innerHTML = matchmakingWidget(skillIcon(10, 24));
    expect(renderer.syncMatchmaking(player(), true)).toBe(0);
    expect(tierHosts()).toHaveLength(0);

    document.body.innerHTML = matchmakingWidget();
    const widget = document.querySelector<HTMLElement>('[class*="EloWidget-module__"]') as HTMLElement;
    widget.hidden = true;
    expect(renderer.syncMatchmaking(player(), true)).toBe(0);
    expect(tierHosts()).toHaveLength(0);

    widget.hidden = false;
    expect(renderer.syncMatchmaking(player({ officialLevel: 9 }), true)).toBe(0);
    expect(renderer.syncMatchmaking(player({ elo: 2_250 }), true)).toBe(0);
    expect(tierHosts()).toHaveLength(0);
  });

  it("replaces the signed-in party card without touching another party member", () => {
    document.body.innerHTML = `${matchmakingWidget()}${partyPlayer()}${partyPlayer("Bravo", 2_600)}`;
    const renderer = new NativeTierSurfaceRenderer();

    expect(renderer.syncMatchmaking(player(), true)).toBe(2);
    expect(document.querySelectorAll(`[${NATIVE_TIER_ATTRIBUTE}]`)).toHaveLength(2);
    const ownHost = document.querySelector<HTMLElement>(
      `[${NATIVE_TIER_ATTRIBUTE}="matchmaking:party:player-1"]`,
    );
    const partyCards = document.querySelectorAll<HTMLElement>('[class*="styles__PlayerCardContainer-sc-"]');
    const ownNative = partyCards[0]?.querySelector<SVGSVGElement>('svg[class*="SkillIcon__StyledSvg"]');
    const otherNative = partyCards[1]?.querySelector<SVGSVGElement>('svg[class*="SkillIcon__StyledSvg"]');
    expect(ownHost?.shadowRoot?.querySelector('[data-tier="11"]')).not.toBeNull();
    expect(ownHost?.nextElementSibling).toBe(ownNative);
    expect(ownNative?.style.getPropertyValue("display")).toBe("none");
    expect(otherNative?.style.getPropertyValue("display")).toBe("");

    renderer.cleanup();
    expect(ownNative?.style.getPropertyValue("display")).toBe("");
  });

  it("replaces only profile main/current-ELO slots and excludes history links and room cards", () => {
    document.body.innerHTML = profileSurfaces(2_501);
    const nativeIcons = Array.from(document.querySelectorAll<SVGSVGElement>('svg[class*="SkillIcon__StyledSvg"]'));
    const renderer = new NativeTierSurfaceRenderer();

    expect(renderer.syncProfile(player({ elo: 2_501 }), true, false)).toBe(2);
    const hosts = tierHosts();
    expect(hosts.map((host) => host.getAttribute(NATIVE_TIER_ATTRIBUTE)).sort()).toEqual([
      "profile:current:player-1",
      "profile:main:player-1",
    ]);
    expect(hosts.every((host) => host.shadowRoot?.querySelector('[data-tier="12"]'))).toBe(true);
    expect(nativeIcons[0]?.style.getPropertyValue("display")).toBe("none");
    expect(nativeIcons[1]?.style.getPropertyValue("display")).toBe("none");
    expect(nativeIcons[2]?.style.getPropertyValue("display")).toBe("");
    expect(nativeIcons[3]?.style.getPropertyValue("display")).toBe("");

    renderer.cleanup();
    expect(tierHosts()).toHaveLength(0);
    expect(nativeIcons.every((icon) => icon.style.getPropertyValue("display") === "")).toBe(true);
    expect(nativeIcons.every((icon) => icon.getAttribute("aria-hidden") === null)).toBe(true);
  });

  it("reconciles React replacements without duplicating hosts", () => {
    document.body.innerHTML = profileSurfaces();
    const renderer = new NativeTierSurfaceRenderer();
    renderer.syncProfile(player(), true, false);
    const oldMain = document.querySelector<HTMLElement>('[class*="styles__SkillIconContainer-sc-"]') as HTMLElement;
    const oldNative = oldMain.querySelector("svg") as SVGSVGElement;
    const oldHost = oldMain.querySelector<HTMLElement>(`[${NATIVE_TIER_ATTRIBUTE}]`) as HTMLElement;
    const currentHost = document.querySelector<HTMLElement>(`[${NATIVE_TIER_ATTRIBUTE}="profile:current:player-1"]`);

    const replacement = document.createElement("div");
    replacement.className = "styles__SkillIconContainer-sc-remounted-2";
    replacement.innerHTML = `${skillIcon(10, 72)}<span>2 401</span>`;
    oldMain.replaceWith(replacement);
    const newNative = replacement.querySelector("svg") as SVGSVGElement;

    expect(renderer.syncProfile(player(), true, false)).toBe(2);
    const newHost = replacement.querySelector<HTMLElement>(`[${NATIVE_TIER_ATTRIBUTE}]`) as HTMLElement;
    expect(newHost).not.toBe(oldHost);
    expect(oldHost.isConnected).toBe(false);
    expect(oldNative.style.getPropertyValue("display")).toBe("");
    expect(newNative.style.getPropertyValue("display")).toBe("none");
    expect(newHost.style.getPropertyValue("--es-native-tier-size")).toBe("72px");
    expect(document.querySelector(`[${NATIVE_TIER_ATTRIBUTE}="profile:current:player-1"]`)).toBe(currentHost);
    expect(tierHosts()).toHaveLength(2);
  });

  it("replaces a verified native 1–10 + Challenger rail with a colored 1–20 progress rail", () => {
    document.body.innerHTML = nativeProgressRail({ elo: 2_600 });
    const native = document.querySelector<HTMLElement>('[class*="styles__Container-sc-progress-"]') as HTMLElement;
    native.style.setProperty("display", "flex", "important");
    native.setAttribute("aria-hidden", "false");
    const renderer = new NativeTierSurfaceRenderer();

    expect(renderer.syncProfile(player({ elo: 2_600 }), true, true)).toBe(1);
    const host = document.querySelector<HTMLElement>(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`) as HTMLElement;
    const rail = host.shadowRoot?.querySelector<HTMLElement>(".rail");
    const current = host.shadowRoot?.querySelector<HTMLElement>('[data-tier="12"]');
    const badges = Array.from(host.shadowRoot?.querySelectorAll<HTMLElement>(".badge") ?? []);
    const badgeStyle = getComputedStyle(badges[11] as HTMLElement);
    const floorStyle = getComputedStyle(
      host.shadowRoot?.querySelector<HTMLElement>('[data-tier="12"] .floor') as HTMLElement,
    );
    expect(host.getAttribute(NATIVE_TIER_RAIL_ATTRIBUTE)).toBe("profile:progress:player-1");
    expect(host.nextElementSibling).toBe(native);
    expect(host.shadowRoot?.querySelectorAll(".tiers > .tier")).toHaveLength(20);
    expect(badges).toHaveLength(20);
    expect([badges[0]?.textContent, badges[9]?.textContent, badges[10]?.textContent, badges[19]?.textContent])
      .toEqual(["1", "10", "11", "20"]);
    expect(badgeStyle.lineHeight).toBe("1");
    expect(badgeStyle.fontSize).toBe("10px");
    expect(badgeStyle.paddingBlockStart).toBe("1px");
    expect(badgeStyle.textAlign).toBe("center");
    expect(floorStyle.lineHeight).toBe("1");
    expect(floorStyle.textAlign).toBe("center");
    expect(rail?.dataset.currentTier).toBe("12");
    expect(rail?.textContent).toContain("Уровень 12 · 2600 ELO");
    expect(rail?.textContent).toContain("151 ELO до уровня 13");
    expect(current?.getAttribute("aria-current")).toBe("true");
    expect(current?.style.getPropertyValue("--tier-fg")).toBe(getEloTierPresentation(12).foreground);
    expect(current?.style.getPropertyValue("--tier-bg")).toBe(getEloTierPresentation(12).background);
    expect(host.shadowRoot?.querySelector<HTMLElement>('[data-tier="20"] .floor')?.textContent).toBe("4501");
    expect(native.style.getPropertyValue("display")).toBe("none");
    expect(native.style.getPropertyPriority("display")).toBe("important");
    expect(native.getAttribute("aria-hidden")).toBe("true");

    const originalRail = rail;
    expect(renderer.syncProfile(player({ elo: 2_600 }), true, true)).toBe(1);
    expect(host.shadowRoot?.querySelector(".rail")).toBe(originalRail);

    renderer.syncProfile(player({ elo: 2_600 }), true, false);
    expect(document.querySelector(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`)).toBeNull();
    expect(native.style.getPropertyValue("display")).toBe("flex");
    expect(native.style.getPropertyPriority("display")).toBe("important");
    expect(native.getAttribute("aria-hidden")).toBe("false");
  });

  it("fails closed on an invalid/ambiguous rail and restores after a React remount", () => {
    const renderer = new NativeTierSurfaceRenderer();
    document.body.innerHTML = nativeProgressRail({ challenger: false });
    const invalid = document.querySelector<HTMLElement>('[class*="styles__SkillLevelsSection-sc-"]') as HTMLElement;
    expect(renderer.syncProfile(player(), true, true)).toBe(0);
    expect(invalid.style.getPropertyValue("display")).toBe("");
    expect(document.querySelector(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`)).toBeNull();

    document.body.innerHTML = `${nativeProgressRail()}${nativeProgressRail()}`;
    expect(renderer.syncProfile(player(), true, true)).toBe(0);
    expect(document.querySelector(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`)).toBeNull();

    document.body.innerHTML = nativeProgressRail();
    const oldNative = document.querySelector<HTMLElement>('[class*="styles__Container-sc-progress-"]') as HTMLElement;
    renderer.syncProfile(player(), true, true);
    const oldHost = document.querySelector<HTMLElement>(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`) as HTMLElement;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = nativeProgressRail();
    const newNative = wrapper.firstElementChild as HTMLElement;
    oldNative.replaceWith(newNative);

    expect(renderer.syncProfile(player(), true, true)).toBe(1);
    const newHost = document.querySelector<HTMLElement>(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`) as HTMLElement;
    expect(newHost).not.toBe(oldHost);
    expect(oldNative.style.getPropertyValue("display")).toBe("");
    expect(newNative.style.getPropertyValue("display")).toBe("none");
    expect(document.querySelectorAll(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`)).toHaveLength(1);

    renderer.destroy();
    expect(newNative.style.getPropertyValue("display")).toBe("");
    expect(document.querySelector(`[${NATIVE_TIER_RAIL_ATTRIBUTE}]`)).toBeNull();
    expect(renderer.syncProfile(player(), true, true)).toBe(0);
  });
});
