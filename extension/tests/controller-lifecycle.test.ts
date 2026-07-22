import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "error" as "error" | "pending-profile" | "match",
  resolvePlayer: undefined as ((value: unknown) => void) | undefined,
  playerRequested: vi.fn(),
  matchRequested: vi.fn(),
  recentMatchesRequested: vi.fn(),
  mapStatsRequested: vi.fn(),
  deferMapStats: false,
  mapStatsResolvers: [] as Array<(value: unknown) => void>,
  automationRun: vi.fn(),
  automationReset: vi.fn(),
  positionSend: vi.fn(),
  overlayShowMatch: vi.fn(),
  overlayInlineSync: vi.fn(),
  domMutation: undefined as (() => void) | undefined,
  visibleMap: null as string | null,
  match: {
    id: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    game: "cs2",
    status: "voting",
    mapPool: ["mirage", "nuke"],
    selectedMap: "mirage",
    teams: [
      { id: "team-a", players: [{ id: "player-a", nickname: "Alpha", game: "cs2", elo: 2_511, officialLevel: 10 }] },
      { id: "team-b", players: [{ id: "player-b", nickname: "Bravo", game: "cs2", elo: 2_100, officialLevel: 10 }] }
    ]
  }
}));

vi.mock("../src/automations", () => ({
  VisibleDomAutomationRunner: class {
    resetForRoute(): void {
      state.automationReset();
    }

    run(): void {
      state.automationRun();
    }
  }
}));

vi.mock("../src/bridge-client", () => ({
  FaceitBridgeAdapter: class {
    destroy(): void {
      state.resolvePlayer?.({
        status: "error",
        error: { code: "destroyed", message: "destroyed", retryable: false }
      });
      state.resolvePlayer = undefined;
    }

    getPlayer(): Promise<unknown> {
      if (state.mode !== "pending-profile") {
        return Promise.resolve({
          status: "error",
          error: { code: "test", message: "test", retryable: false }
        });
      }
      state.playerRequested();
      return new Promise((resolve) => {
        state.resolvePlayer = resolve;
      });
    }

    getRecentMatches(playerId: string): Promise<unknown> {
      state.recentMatchesRequested(playerId);
      return Promise.resolve({ status: "ready", data: [], fetchedAt: Date.now() });
    }

    getPlayerMapStats(playerId: string): Promise<unknown> {
      state.mapStatsRequested(playerId);
      const result = {
        status: "ready",
        data: [{ map: "mirage", matches: 416, wins: 220, kills: 7_900, assists: 1_800, deaths: 6_700, roundsPlayed: 9_800, damage: 820_000 }],
        fetchedAt: Date.now()
      };
      if (!state.deferMapStats) return Promise.resolve(result);
      return new Promise((resolve) => state.mapStatsResolvers.push(() => resolve(result)));
    }

    getMatch(): Promise<unknown> {
      state.matchRequested();
      if (state.mode === "match") {
        return Promise.resolve({ status: "ready", data: state.match, fetchedAt: Date.now() });
      }
      return Promise.resolve({
        status: "error",
        error: { code: "test", message: "test", retryable: false }
      });
    }

    getMatchStats(): Promise<unknown> {
      return Promise.resolve({
        status: "error",
        error: { code: "test", message: "test", retryable: false }
      });
    }

    getVetoState(): Promise<unknown> {
      return Promise.resolve({
        status: "error",
        error: { code: "test", message: "test", retryable: false }
      });
    }
  }
}));

vi.mock("../src/compatibility", () => {
  const capabilities = {
    profile: true,
    history: true,
    matchRoom: true,
    quickPositions: true,
    partyAccept: true,
    readyUp: true,
    mapVeto: true,
    serverVeto: true,
    connect: true,
    copyServerData: true
  };
  return {
    BUILT_IN_CAPABILITIES: capabilities,
    loadCompatibility: vi.fn(async () => ({
      capabilities,
      status: "built-in",
      checkedAt: Date.now()
    }))
  };
});

vi.mock("../src/dom", () => ({
  observeScopedDom: vi.fn((callback: () => void) => {
    state.domMutation = callback;
    return () => { state.domMutation = undefined; };
  }),
  findUniqueVisible: vi.fn(() => null),
  isVisible: vi.fn(() => false)
}));

vi.mock("../src/positions", () => ({
  isSelectedMapVisible: vi.fn(() => true),
  visibleSelectedMap: vi.fn(() => state.visibleMap),
  QuickPositionSender: class {
    async send(): Promise<"prepared"> {
      state.positionSend();
      return "prepared";
    }
  }
}));

vi.mock("../src/snapshots", () => ({
  EloSnapshotStore: class {
    async recordPlayer(): Promise<void> {}
    async hydrateMatchElos(_playerId: string, matches: unknown[]): Promise<unknown[]> {
      return matches;
    }
    async rememberMatchElos(): Promise<void> {}
  }
}));

vi.mock("../src/ui", () => ({
  EloScopeOverlay: class {
    updateSettings(): void {}
    setCompatibility(): void {}
    hideRoutePanels(): void {}
    showLoading(): void {}
    showState(): void {}
    showProfile(): void {}
    showHistory(): void {}
    showMatch(...args: unknown[]): void { state.overlayShowMatch(...args); }
    syncMatchInline(...args: unknown[]): void { state.overlayInlineSync(...args); }
    destroy(): void {}
  }
}));

import { allowsAutomaticPosition, EloScopeController } from "../src/controller";
import { MAIN_SOURCE, PROTOCOL_VERSION } from "../src/protocol";
import { createDefaultSettings, saveSettings } from "../src/settings";

describe("controller lifecycle", () => {
  beforeEach(() => {
    state.mode = "error";
    state.resolvePlayer = undefined;
    state.playerRequested.mockClear();
    state.matchRequested.mockClear();
    state.recentMatchesRequested.mockClear();
    state.mapStatsRequested.mockClear();
    state.deferMapStats = false;
    state.mapStatsResolvers = [];
    state.automationRun.mockClear();
    state.automationReset.mockClear();
    state.positionSend.mockClear();
    state.overlayShowMatch.mockClear();
    state.overlayInlineSync.mockClear();
    state.domMutation = undefined;
    state.visibleMap = null;
    state.match.status = "voting";
  });

  it.each([
    ["voting", true],
    ["VOTING", true],
    ["configuring", true],
    ["ready", true],
    ["created", false],
    ["ongoing", false],
    ["finished", false],
    ["cancelled", false],
    ["aborted", false],
    ["unknown", false],
    ["", false]
  ])("gates automatic positions for match status %s", (status, expected) => {
    expect(allowsAutomaticPosition(status)).toBe(expected);
  });

  it("invalidates an in-flight navigation before old automations can run", async () => {
    const controller = new EloScopeController();
    await controller.start();
    state.automationRun.mockClear();
    state.mode = "pending-profile";

    const navigation = controller.navigate("/ru/players/FixturePlayer/cs2/stats");
    await vi.waitFor(() => expect(state.playerRequested).toHaveBeenCalledOnce());
    controller.destroy();
    await navigation;

    expect(state.automationRun).not.toHaveBeenCalled();
  });

  it("publishes the API map pool to settings and clears it after leaving the room", async () => {
    const onMapPoolChange = vi.fn();
    const controller = new EloScopeController({ onMapPoolChange });
    await controller.start();
    onMapPoolChange.mockClear();
    state.mode = "match";

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    expect(onMapPoolChange).toHaveBeenLastCalledWith(["mirage", "nuke"]);

    await controller.navigate("/ru/players/FixturePlayer/cs2/stats");
    expect(onMapPoolChange).toHaveBeenLastCalledWith([]);
    controller.destroy();
  });

  it("loads lifetime map aggregates for every room player and passes them to the inline renderer", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.mapStatsRequested.mockClear();
    state.overlayShowMatch.mockClear();

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.recentMatchesRequested).toHaveBeenCalledTimes(2);
    expect(state.overlayShowMatch.mock.calls[0]?.[2]).toEqual(new Map());
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(2));
    expect(state.mapStatsRequested).toHaveBeenCalledWith("player-a");
    expect(state.mapStatsRequested).toHaveBeenCalledWith("player-b");
    await vi.waitFor(() => expect(state.overlayInlineSync).toHaveBeenCalled());
    const mapStats = state.overlayInlineSync.mock.calls.at(-1)?.[2] as Map<string, Array<{ matches: number }>>;
    expect(mapStats.get("player-a")?.[0]?.matches).toBe(416);
    controller.destroy();
  });

  it("uses the current selected map when deferred lifetime stats finish", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.deferMapStats = true;

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.mapStatsResolvers).toHaveLength(2));
    state.visibleMap = "nuke";
    state.domMutation?.();
    await vi.waitFor(() => {
      const current = state.overlayShowMatch.mock.calls.at(-1)?.[0] as { selectedMap?: string } | undefined;
      expect(current?.selectedMap).toBe("nuke");
    });

    for (const resolve of state.mapStatsResolvers.splice(0)) resolve(undefined);
    await vi.waitFor(() => {
      const current = state.overlayInlineSync.mock.calls.at(-1)?.[0] as { selectedMap?: string } | undefined;
      expect(current?.selectedMap).toBe("nuke");
    });
    controller.destroy();
  });

  it("does not start queued lifetime requests after leaving the room", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const originalTeams = state.match.teams;
    state.match.teams = [
      {
        id: "team-a",
        players: Array.from({ length: 5 }, (_, index) => ({
          id: `player-a-${index}`,
          nickname: `Alpha${index}`,
          game: "cs2",
          elo: 2_500 + index,
          officialLevel: 10,
        })),
      },
      {
        id: "team-b",
        players: Array.from({ length: 5 }, (_, index) => ({
          id: `player-b-${index}`,
          nickname: `Bravo${index}`,
          game: "cs2",
          elo: 2_400 + index,
          officialLevel: 10,
        })),
      },
    ];
    const controller = new EloScopeController();

    try {
      await controller.start();
      state.mode = "match";
      state.deferMapStats = true;
      await controller.navigate(`/ru/cs2/room/${state.match.id}`);
      await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(4));

      await controller.navigate("/");
      for (const resolve of state.mapStatsResolvers.splice(0)) resolve(undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(state.mapStatsRequested).toHaveBeenCalledTimes(4);
    } finally {
      controller.destroy();
      state.match.teams = originalTeams;
    }
  });

  it("keeps match context and automations active when only the match overlay is hidden", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = false;
    await saveSettings(settings);
    const onMapPoolChange = vi.fn();
    const controller = new EloScopeController({ onMapPoolChange });
    await controller.start();
    state.automationRun.mockClear();
    state.mode = "match";

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.matchRequested).toHaveBeenCalledOnce();
    expect(state.recentMatchesRequested).not.toHaveBeenCalled();
    expect(state.mapStatsRequested).not.toHaveBeenCalled();
    expect(onMapPoolChange).toHaveBeenLastCalledWith(["mirage", "nuke"]);
    expect(state.automationRun).toHaveBeenCalledOnce();
    expect(state.overlayShowMatch).not.toHaveBeenCalled();

    state.visibleMap = "mirage";
    state.domMutation?.();
    expect(state.automationRun).toHaveBeenCalledTimes(2);
    expect(state.overlayShowMatch).not.toHaveBeenCalled();
    expect(state.overlayInlineSync).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("resyncs inline placement after every DOM mutation even when the selected map is unchanged", async () => {
    state.mode = "match";
    state.visibleMap = "mirage";
    const controller = new EloScopeController();

    await controller.start();
    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    state.overlayInlineSync.mockClear();

    state.domMutation?.();

    await vi.waitFor(() => expect(state.overlayInlineSync).toHaveBeenCalledOnce());
    controller.destroy();
  });

  it("ignores duplicate same-path route messages instead of remounting inline hosts", async () => {
    state.mode = "match";
    const roomPath = `/ru/cs2/room/${state.match.id}`;
    history.replaceState(null, "", roomPath);
    const controller = new EloScopeController();

    try {
      await controller.start();
      state.matchRequested.mockClear();
      state.overlayShowMatch.mockClear();

      window.dispatchEvent(new MessageEvent("message", {
        source: window,
        origin: location.origin,
        data: { source: MAIN_SOURCE, version: PROTOCOL_VERSION, type: "route", pathname: roomPath },
      }));
      await Promise.resolve();

      expect(state.matchRequested).not.toHaveBeenCalled();
      expect(state.overlayShowMatch).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
  });

  it("never auto-sends a configured position in a finished room", async () => {
    const settings = createDefaultSettings();
    settings.automations.positions.mirage = {
      enabled: true,
      message: "I play connector",
      mode: "auto"
    };
    await saveSettings(settings);
    state.mode = "match";
    state.visibleMap = "mirage";
    state.match.status = "finished";
    const controller = new EloScopeController();

    await controller.start();
    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.positionSend).not.toHaveBeenCalled();
    controller.destroy();
  });
});
