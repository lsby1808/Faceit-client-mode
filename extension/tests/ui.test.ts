import { describe, expect, it, vi } from "vitest";

import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay, type OverlayCallbacks } from "../src/ui";
import { loadFixture } from "./fixture";

const validMatch = {
  id: "match-1",
  playerId: "player-1",
  teamId: "team-a",
  game: "cs2",
  mode: "5v5",
  status: "finished",
  finishedAt: "2026-07-22T10:00:00.000Z",
  result: "win" as const,
  map: "mirage",
  roundsPlayed: 24,
  kills: 20,
  assists: 5,
  deaths: 14,
  damage: 2_100,
  headshots: 10,
  eloBefore: 2_075,
  eloAfter: 2_100,
};

function callbacks(): OverlayCallbacks {
  return {
    onSettingsChange: vi.fn(),
    onStatsWindow: vi.fn(),
    onPositionSend: vi.fn(async () => "prepared" as const),
  };
}

describe("Shadow DOM overlays", () => {
  it("replaces only the native profile tier and never mounts a large profile/history panel", () => {
    loadFixture("profile");
    const settings = { ...createDefaultSettings(), showExtendedTier: true };
    const overlay = new EloScopeOverlay(settings, callbacks());
    const native = document.querySelector<SVGSVGElement>('svg[class*="SkillIcon__StyledSvg-sc-"]') as SVGSVGElement;

    overlay.showProfileTier(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 2_401, officialLevel: 10 },
      false,
    );

    const host = document.querySelector<HTMLElement>('[data-eloscope-native-tier="profile:main:player-1"]');
    const nativeTier = host?.shadowRoot?.querySelector<HTMLElement>('[data-tier="11"]');
    expect(nativeTier?.textContent).toBe("11");
    expect(nativeTier?.style.getPropertyValue("--tier-fg")).toBe("#4DD8FF");
    expect(native.style.getPropertyValue("display")).toBe("none");
    expect(overlay.host.parentElement).toBe(document.documentElement);
    expect(overlay.host.dataset.layout).toBeUndefined();
    expect(overlay.host.dataset.profileMode).toBeUndefined();
    expect(overlay.shadow.querySelector(".es-panel")).toBeNull();
    expect(overlay.shadow.textContent).not.toContain("Профиль");
    expect(overlay.shadow.textContent).not.toContain("Расширенная история");

    overlay.hideRoutePanels();
    expect(document.querySelector('[data-eloscope-native-tier]')).toBeNull();
    expect(native.style.getPropertyValue("display")).toBe("");
    overlay.destroy();
  });

  it("renders match stats inside native player cards instead of the floating panel", () => {
    loadFixture("active-room");
    const settings = { ...createDefaultSettings(), showExtendedTier: true };
    const overlay = new EloScopeOverlay(settings, callbacks());
    overlay.showMatch({
      id: "match-1",
      game: "cs2",
      status: "finished",
      mapPool: ["dust2"],
      selectedMap: "dust2",
      teams: [
        {
          id: "team-a",
          name: "Alpha",
          players: [
            { id: "alpha-ace", nickname: "ace", game: "cs2", elo: 2_511, officialLevel: 10 },
            { id: "alpha-two", nickname: "alpha-two", game: "cs2", elo: 2_401, officialLevel: 10 },
            { id: "alpha-three", nickname: "alpha-three", game: "cs2", elo: 2_202, officialLevel: 10 },
            { id: "alpha-four", nickname: "alpha-four", game: "cs2", elo: 2_301, officialLevel: 10 },
            { id: "alpha-five", nickname: "alpha-five", game: "cs2", elo: 2_151, officialLevel: 10 },
          ],
        },
        {
          id: "team-b",
          name: "Bravo",
          players: [
            { id: "bravo-one", nickname: "bravo-one", game: "cs2", elo: 2_100, officialLevel: 10 },
            { id: "bravo-two", nickname: "ace2", game: "cs2", elo: 2_050, officialLevel: 10 },
            { id: "bravo-three", nickname: "bravo-three", game: "cs2", elo: 2_000, officialLevel: 10 },
            { id: "bravo-four", nickname: "bravo-four", game: "cs2", elo: 1_950, officialLevel: 9 },
            { id: "bravo-five", nickname: "bravo-five", game: "cs2", elo: 1_900, officialLevel: 9 },
          ],
        },
      ],
    }, new Map([["alpha-ace", [{ ...validMatch, playerId: "alpha-ace", map: "dust2" }]]]), new Map([[
      "alpha-ace",
      [{ map: "dust2", matches: 416, wins: 220, kills: 7_900, assists: 1_800, deaths: 6_700, roundsPlayed: 9_800, damage: 820_000 }],
    ]]));

    const host = document.querySelector<HTMLElement>('[data-eloscope-inline-player="alpha-ace"]');
    const tierHost = document.querySelector<HTMLElement>('[data-eloscope-inline-tier="alpha-ace"]');
    const extended = tierHost?.shadowRoot?.querySelector<HTMLElement>("[data-es-tier]");
    const batteryHost = document.querySelector<HTMLElement>('[data-eloscope-inline-battery="alpha-ace"]');
    expect(overlay.shadow.querySelector(".es-panel")).toBeNull();
    expect(overlay.shadow.querySelector(".es-teams")).toBeNull();
    expect(document.querySelectorAll("[data-eloscope-inline-player]")).toHaveLength(10);
    expect(document.querySelectorAll("[data-eloscope-inline-team]")).toHaveLength(2);
    expect(document.querySelector('[data-eloscope-inline-team="team-a"]')?.getAttribute("data-eloscope-team-side")).toBe("right");
    expect(document.querySelector('[data-eloscope-inline-team="team-b"]')?.getAttribute("data-eloscope-team-side")).toBe("left");
    expect(host?.previousElementSibling?.matches('[class*="ListContentPlayer__Background"]')).toBe(true);
    expect(host?.shadowRoot?.textContent).toContain("416");
    expect(host?.shadowRoot?.textContent).toContain("AVG KILLS");
    expect(extended?.textContent).toBe("12");
    expect(extended?.title).toContain("официальный FACEIT level 10");
    expect(batteryHost?.previousElementSibling?.matches('[class*="Nickname__Container-sc-"]')).toBe(true);
    const positionMode = overlay.shadow.querySelector<HTMLSelectElement>(".es-position-card .es-select");
    const positionButton = overlay.shadow.querySelector<HTMLButtonElement>(".es-position-card .es-primary");
    if (positionMode) {
      positionMode.value = "prefill";
      positionMode.dispatchEvent(new Event("change"));
    }
    expect(positionButton?.textContent).toBe("Подготовить");
    overlay.hideRoutePanels();
    expect(document.querySelectorAll("[data-eloscope-inline-player]")).toHaveLength(0);
    expect(document.querySelectorAll("[data-eloscope-inline-team], [data-eloscope-inline-tier], [data-eloscope-inline-battery]")).toHaveLength(0);
    overlay.destroy();
    expect(document.querySelectorAll("[data-eloscope-inline-player]")).toHaveLength(0);
  });
});
