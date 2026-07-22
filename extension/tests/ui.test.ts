import { createDefaultAutomationSettings, type DataState } from "@eloscope/core";
import { describe, expect, it, vi } from "vitest";

import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay, type HistoryDetailData, type OverlayCallbacks } from "../src/ui";
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

function callbacks(detail?: HistoryDetailData): OverlayCallbacks {
  return {
    onSettingsChange: vi.fn(),
    onStatsWindow: vi.fn(),
    onPositionSend: vi.fn(async () => "prepared" as const),
    onHistoryDetail: vi.fn(async (): Promise<DataState<HistoryDetailData>> => detail
      ? { status: "ready", data: detail, fetchedAt: Date.now() }
      : { status: "error", error: { code: "test", message: "missing", retryable: false } }),
  };
}

describe("Shadow DOM overlays", () => {
  it("shows official progress and detailed map metrics without rendering invalid rows as zeros", () => {
    loadFixture("profile");
    const overlay = new EloScopeOverlay(createDefaultSettings(), callbacks());
    overlay.showProfile(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 900, officialLevel: 2 },
      [validMatch],
      [{ map: "mirage", matches: 10, wins: 6, kills: 180, assists: 60, deaths: 150, roundsPlayed: 240, damage: 20_000 }],
    );
    expect(overlay.shadow.textContent).toContain("51 ELO до level 3");
    expect(overlay.shadow.textContent).toContain("1.20 KD");
    expect(overlay.shadow.textContent).toContain("83.3 ADR");

    overlay.showProfile(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 900, officialLevel: 2 },
      [{ ...validMatch, mode: "2v2" }],
      [],
    );
    expect(overlay.shadow.textContent).toContain("Нет достоверных завершённых CS2 5v5 матчей");
    overlay.destroy();
  });

  it("loads both teams and computes FCR only after a history-row click", async () => {
    loadFixture("history");
    const detail: HistoryDetailData = {
      match: {
        id: "match-1",
        game: "cs2",
        status: "finished",
        mapPool: ["mirage"],
        selectedMap: "mirage",
        teams: [
          { id: "team-a", name: "Alpha", players: [{ id: "player-1", nickname: "One", game: "cs2" }] },
          { id: "team-b", name: "Bravo", players: [{ id: "player-2", nickname: "Two", game: "cs2" }] },
        ],
      },
      stats: {
        matchId: "match-1",
        map: "mirage",
        roundsPlayed: 24,
        players: [
          { playerId: "player-1", teamId: "team-a", kills: 20, assists: 5, deaths: 14, damage: 2_100, roundsPlayed: 24, firstKills: 3 },
          { playerId: "player-2", teamId: "team-b", kills: 14, assists: 4, deaths: 20, damage: 1_700, roundsPlayed: 24, firstKills: 2 },
        ],
      },
    };
    const overlay = new EloScopeOverlay(
      { ...createDefaultSettings(), automations: createDefaultAutomationSettings() },
      callbacks(detail),
    );
    overlay.showHistory({ id: "player-1", nickname: "One", game: "cs2" }, [validMatch]);
    const row = overlay.shadow.querySelector('tr[data-clickable="true"]') as HTMLTableRowElement;
    row.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(overlay.shadow.textContent).toContain("Alpha");
    expect(overlay.shadow.textContent).toContain("Bravo");
    expect(overlay.shadow.textContent).toContain("100.0%");
    overlay.destroy();
  });

  it("mounts profile statistics in the native content flow after the FACEIT summary card", () => {
    loadFixture("profile");
    const nativeMain = document.querySelector<HTMLElement>('[data-testid="player-profile"]');
    const nativeCard = document.querySelector<HTMLElement>('[data-testid="native-profile-card-stack"]');
    const nativeSurvey = document.querySelector<HTMLElement>('[data-testid="native-profile-survey"]');
    const overlay = new EloScopeOverlay(createDefaultSettings(), callbacks());

    overlay.showProfile(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 2_401, officialLevel: 10 },
      [validMatch],
      [],
    );

    expect(overlay.host.dataset.layout).toBe("profile-inline");
    expect(overlay.host.dataset.profileMode).toBe("profile");
    expect(overlay.host.parentElement).toBe(nativeMain);
    expect(nativeCard?.nextElementSibling).toBe(overlay.host);
    expect(overlay.host.nextElementSibling).toBe(nativeSurvey);
    expect(overlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(false);
    expect(document.querySelector('[data-testid="native-profile-card-stack"]')).toBe(nativeCard);
    expect(document.querySelector('[data-testid="native-profile-survey"]')).toBe(nativeSurvey);
    expect(document.documentElement.children).not.toContain(overlay.host);
    overlay.destroy();
  });

  it("mounts extended history before the native table without replacing FACEIT content", () => {
    loadFixture("history");
    const nativeMain = document.querySelector<HTMLElement>('[data-testid="player-history"]');
    const nativeHistory = document.querySelector<HTMLElement>('[data-testid="native-history-wrapper"]');
    const nativeTable = document.querySelector<HTMLElement>('[data-testid="match-history"]');
    const overlay = new EloScopeOverlay(createDefaultSettings(), callbacks());

    overlay.showHistory({ id: "player-1", nickname: "Player", game: "cs2" }, [validMatch]);

    expect(overlay.host.dataset.layout).toBe("profile-inline");
    expect(overlay.host.dataset.profileMode).toBe("history");
    expect(overlay.host.parentElement).toBe(nativeMain);
    expect(overlay.host.nextElementSibling).toBe(nativeHistory);
    expect(nativeHistory?.querySelector('[data-testid="match-history"]')).toBe(nativeTable);
    expect(document.querySelectorAll('[data-testid="match-history"]')).toHaveLength(1);
    expect(overlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(false);
    expect(document.documentElement.children).not.toContain(overlay.host);
    overlay.destroy();
  });

  it("keeps loading and error states inline instead of flashing a floating panel", () => {
    loadFixture("history");
    const nativeMain = document.querySelector<HTMLElement>('[data-testid="player-history"]');
    const overlay = new EloScopeOverlay(createDefaultSettings(), callbacks());

    overlay.showLoading("Extended history", "history");
    expect(overlay.host.parentElement).toBe(nativeMain);
    expect(overlay.host.dataset.layout).toBe("profile-inline");
    expect(overlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(false);

    overlay.showState("Extended history", "error", "history");
    expect(overlay.host.parentElement).toBe(nativeMain);
    expect(overlay.host.dataset.layout).toBe("profile-inline");
    expect(overlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(false);
    overlay.destroy();
  });

  it("fails closed when the native profile mount is missing or ambiguous", () => {
    const missingOverlay = new EloScopeOverlay(createDefaultSettings(), callbacks());
    missingOverlay.showProfile(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 2_401, officialLevel: 10 },
      [validMatch],
      [],
    );
    expect(missingOverlay.host.dataset.layout).toBeUndefined();
    expect(missingOverlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(true);
    expect(missingOverlay.host.parentElement).toBe(document.documentElement);
    missingOverlay.destroy();

    loadFixture("profile");
    const nativeMain = document.querySelector<HTMLElement>('[data-testid="player-profile"]');
    const duplicate = nativeMain?.cloneNode(true) as HTMLElement;
    duplicate.dataset.testid = "ambiguous-player-profile";
    nativeMain?.parentElement?.append(duplicate);
    const ambiguousOverlay = new EloScopeOverlay(createDefaultSettings(), callbacks());
    ambiguousOverlay.showProfile(
      { id: "player-1", nickname: "Player", game: "cs2", elo: 2_401, officialLevel: 10 },
      [validMatch],
      [],
    );
    expect(ambiguousOverlay.host.dataset.layout).toBeUndefined();
    expect(ambiguousOverlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(true);
    expect(ambiguousOverlay.host.parentElement).toBe(document.documentElement);
    ambiguousOverlay.destroy();
  });

  it("reattaches the same inline history panel after FACEIT replaces its React subtree", () => {
    loadFixture("history");
    const overlay = new EloScopeOverlay(createDefaultSettings(), callbacks());
    overlay.showHistory({ id: "player-1", nickname: "Player", game: "cs2" }, [validMatch]);
    const originalMain = document.querySelector<HTMLElement>('[data-testid="player-history"]');
    const replacement = document.createElement("section");
    replacement.className = "styles__MainSection-sc-cd4a8e07-7";
    replacement.dataset.eloscopeVisible = "true";
    replacement.dataset.testid = "replacement-player-history";
    replacement.innerHTML = `
      <div data-testid="replacement-native-history-wrapper">
        <table class="styles__MatchTable-sc-cf17d301-4" data-eloscope-visible="true" data-testid="replacement-match-history">
          <tbody><tr><td>Replacement native match</td></tr></tbody>
        </table>
      </div>`;
    originalMain?.replaceWith(replacement);

    overlay.syncProfileInline("history");

    expect(overlay.host.parentElement).toBe(replacement);
    expect(replacement.firstElementChild).toBe(overlay.host);
    expect(overlay.host.nextElementSibling?.getAttribute("data-testid")).toBe("replacement-native-history-wrapper");
    expect(overlay.shadow.textContent).toContain("Player");
    expect(overlay.shadow.querySelector<HTMLElement>(".es-panel")?.hidden).toBe(false);

    overlay.hideRoutePanels();
    expect(overlay.host.dataset.layout).toBeUndefined();
    expect(overlay.host.dataset.profileMode).toBeUndefined();
    expect(overlay.host.parentElement).toBe(document.documentElement);
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

    const panel = overlay.shadow.querySelector<HTMLElement>(".es-panel");
    const host = document.querySelector<HTMLElement>('[data-eloscope-inline-player="alpha-ace"]');
    const tierHost = document.querySelector<HTMLElement>('[data-eloscope-inline-tier="alpha-ace"]');
    const extended = tierHost?.shadowRoot?.querySelector<HTMLElement>("[data-es-tier]");
    const batteryHost = document.querySelector<HTMLElement>('[data-eloscope-inline-battery="alpha-ace"]');
    expect(panel?.hidden).toBe(true);
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
