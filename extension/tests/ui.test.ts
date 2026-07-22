import { createDefaultAutomationSettings, type DataState } from "@eloscope/core";
import { describe, expect, it, vi } from "vitest";

import { createDefaultSettings } from "../src/settings";
import { EloScopeOverlay, type HistoryDetailData, type OverlayCallbacks } from "../src/ui";

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
});
