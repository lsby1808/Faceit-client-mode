import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "error" as "error" | "pending-profile" | "profile" | "match" | "matchmaking",
  resolvePlayer: undefined as ((value: unknown) => void) | undefined,
  viewerRequested: vi.fn(),
  deferViewer: false,
  viewerResolver: undefined as (() => void) | undefined,
  playerRequested: vi.fn(),
  matchRequested: vi.fn(),
  matchFailuresRemaining: 0,
  recentMatchesRequested: vi.fn(),
  recentMatchesByPlayer: new Map<string, unknown[]>(),
  deferRecentMatches: false,
  deferredRecentPlayerIds: new Set<string>(),
  recentMatchesResolvers: [] as Array<(value: unknown) => void>,
  mapStatsRequested: vi.fn(),
  deferMapStats: false,
  mapStatsRestrictedPlayers: new Set<string>(),
  mapStatsResolvers: [] as Array<(value: unknown) => void>,
  automationRun: vi.fn(),
  automationReset: vi.fn(),
  automationResult: { action: null, clicked: false } as {
    action: "partyAccept" | "readyUp" | "mapVeto" | "serverVeto" | "connect" | "copyServerData" | null;
    clicked: boolean;
    reason?: string;
  },
  positionSend: vi.fn(),
  overlayShowMatch: vi.fn(),
  overlayInlineSync: vi.fn(),
  overlayRenderResult: {
    status: "rendered",
    players: 2,
    teams: 2,
    updated: 2,
  } as
    | { status: "rendered"; players: number; teams: number; updated: number }
    | {
        status: "incompatible";
        reason:
          | "invalid-match-roster"
          | "roster-contract"
          | "team-roster-ambiguous"
          | "nickname-ambiguous"
          | "player-card-contract"
          | "player-holder-contract";
      },
  overlayShowMatchmakingTier: vi.fn(),
  overlaySyncMatchmakingTier: vi.fn(),
  overlayShowProfileTier: vi.fn(),
  overlaySyncProfileTier: vi.fn(),
  overlayShowProfileStats: vi.fn(),
  overlaySyncProfileStats: vi.fn(),
  domMutation: undefined as (() => void) | undefined,
  visibleMap: null as string | null,
  matchViewerId: "player-a",
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

function recentRow(playerId: string, id: string) {
  return {
    id,
    playerId,
    teamId: "historic-team",
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: "2026-07-20T12:00:00.000Z",
    result: "win" as const,
    map: "mirage",
    roundsPlayed: 24,
    kills: 20,
    assists: 5,
    deaths: 14,
    damage: 2_100,
  };
}

vi.mock("../src/automations", () => ({
  VisibleDomAutomationRunner: class {
    resetForRoute(): void {
      state.automationReset();
    }

    run(...args: unknown[]): typeof state.automationResult {
      state.automationRun(...args);
      return state.automationResult;
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

    getViewer(): Promise<unknown> {
      state.viewerRequested();
      if (state.mode === "matchmaking") {
        return Promise.resolve({
          status: "ready",
          data: { id: "viewer-1", nickname: "Viewer" },
          fetchedAt: Date.now(),
        });
      }
      if (state.mode === "match") {
        const result = {
          status: "ready",
          data: { id: state.matchViewerId, nickname: "Different nickname" },
          fetchedAt: Date.now(),
        };
        if (!state.deferViewer) return Promise.resolve(result);
        return new Promise((resolve) => {
          state.viewerResolver = () => resolve(result);
        });
      }
      return Promise.resolve({
        status: "error",
        error: { code: "test", message: "test", retryable: false },
      });
    }

    getPlayer(): Promise<unknown> {
      if (state.mode === "matchmaking") {
        state.playerRequested();
        return Promise.resolve({
          status: "ready",
          data: { id: "viewer-1", nickname: "Viewer", game: "cs2", elo: 2_486, officialLevel: 10 },
          fetchedAt: Date.now(),
        });
      }
      if (state.mode === "profile") {
        state.playerRequested();
        return Promise.resolve({
          status: "ready",
          data: { id: "profile-1", nickname: "FixturePlayer", game: "cs2", elo: 2_486, officialLevel: 10 },
          fetchedAt: Date.now(),
        });
      }
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

    getRecentMatches(playerId: string, limit: number): Promise<unknown> {
      state.recentMatchesRequested(playerId, limit);
      const result = {
        status: "ready",
        data: state.recentMatchesByPlayer.get(playerId) ?? [],
        fetchedAt: Date.now(),
      };
      if (!state.deferRecentMatches && !state.deferredRecentPlayerIds.has(playerId)) {
        return Promise.resolve(result);
      }
      return new Promise((resolve) => state.recentMatchesResolvers.push(() => resolve(result)));
    }

    getPlayerMapStats(playerId: string): Promise<unknown> {
      state.mapStatsRequested(playerId);
      if (state.mapStatsRestrictedPlayers.has(playerId)) {
        return Promise.resolve({ status: "restricted", reason: "rate-limited" });
      }
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
        if (state.matchFailuresRemaining > 0) {
          state.matchFailuresRemaining -= 1;
          return Promise.resolve({
            status: "error",
            error: { code: "upstream", message: "match is not ready yet", retryable: false },
          });
        }
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
    showMatchmakingTier(...args: unknown[]): void { state.overlayShowMatchmakingTier(...args); }
    syncMatchmakingTier(...args: unknown[]): void { state.overlaySyncMatchmakingTier(...args); }
    showProfileTier(...args: unknown[]): void { state.overlayShowProfileTier(...args); }
    syncProfileTier(...args: unknown[]): void { state.overlaySyncProfileTier(...args); }
    showProfileStats(...args: unknown[]): void { state.overlayShowProfileStats(...args); }
    syncProfileStats(...args: unknown[]): void { state.overlaySyncProfileStats(...args); }
    showMatch(...args: unknown[]): typeof state.overlayRenderResult {
      state.overlayShowMatch(...args);
      return state.overlayRenderResult;
    }
    syncMatchInline(...args: unknown[]): typeof state.overlayRenderResult {
      state.overlayInlineSync(...args);
      return state.overlayRenderResult;
    }
    destroy(): void {}
  }
}));

import {
  allowsAutomaticPosition,
  EloScopeController,
  shouldRetryMatchBootstrap,
  viewerTeamIdForMatch,
} from "../src/controller";
import { debugLog } from "../src/debug-log";
import { MAIN_SOURCE, PROTOCOL_VERSION } from "../src/protocol";
import { createDefaultSettings, saveSettings } from "../src/settings";

const FORBIDDEN_DEBUG_FIELDS = new Set([
  "args",
  "body",
  "id",
  "matchId",
  "message",
  "nickname",
  "pathname",
  "playerId",
  "request",
  "response",
]);

function expectPrivacySafeDebugEvent(event: Record<string, unknown>, secrets: readonly string[]): void {
  const keys: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, nested] of Object.entries(value)) {
      keys.push(key);
      visit(nested);
    }
  };
  visit(event);
  expect(keys.filter((key) => FORBIDDEN_DEBUG_FIELDS.has(key))).toEqual([]);
  const serialized = JSON.stringify(event);
  for (const secret of secrets) expect(serialized).not.toContain(secret);
}

describe("viewer team resolution", () => {
  it("uses an exact viewer id match even when the nickname differs", () => {
    expect(viewerTeamIdForMatch(state.match, {
      id: "player-a",
      nickname: "Completely different nickname",
    })).toBe("team-a");
  });

  it("does not fall back to a matching nickname", () => {
    expect(viewerTeamIdForMatch(state.match, {
      id: "missing-viewer-id",
      nickname: "Alpha",
    })).toBeUndefined();
  });

  it("returns undefined when the same viewer id occurs in both teams", () => {
    const ambiguousMatch = {
      ...state.match,
      teams: state.match.teams.map((team, index) => index === 0
        ? team
        : {
            ...team,
            players: [{
              ...team.players[0]!,
              id: "player-a",
            }],
          }),
    };

    expect(viewerTeamIdForMatch(ambiguousMatch, {
      id: "player-a",
      nickname: "Alpha",
    })).toBeUndefined();
  });
});

describe("controller lifecycle", () => {
  beforeEach(() => {
    state.mode = "error";
    state.resolvePlayer = undefined;
    state.viewerRequested.mockClear();
    state.deferViewer = false;
    state.viewerResolver = undefined;
    state.playerRequested.mockClear();
    state.matchRequested.mockClear();
    state.matchFailuresRemaining = 0;
    state.recentMatchesRequested.mockClear();
    state.recentMatchesByPlayer.clear();
    state.deferRecentMatches = false;
    state.deferredRecentPlayerIds.clear();
    state.recentMatchesResolvers = [];
    state.mapStatsRequested.mockClear();
    state.deferMapStats = false;
    state.mapStatsRestrictedPlayers.clear();
    state.mapStatsResolvers = [];
    state.automationRun.mockClear();
    state.automationReset.mockClear();
    state.automationResult = { action: null, clicked: false };
    state.positionSend.mockClear();
    state.overlayShowMatch.mockClear();
    state.overlayInlineSync.mockClear();
    state.overlayRenderResult = {
      status: "rendered",
      players: 2,
      teams: 2,
      updated: 2,
    };
    state.overlayShowMatchmakingTier.mockClear();
    state.overlaySyncMatchmakingTier.mockClear();
    state.overlayShowProfileTier.mockClear();
    state.overlaySyncProfileTier.mockClear();
    state.overlayShowProfileStats.mockClear();
    state.overlaySyncProfileStats.mockClear();
    state.domMutation = undefined;
    state.visibleMap = null;
    state.matchViewerId = "player-a";
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

  it("retries only transient match bootstrap failures", () => {
    expect(shouldRetryMatchBootstrap({
      status: "error",
      error: { code: "upstream", message: "not ready", retryable: false },
    })).toBe(true);
    expect(shouldRetryMatchBootstrap({
      status: "error",
      error: { code: "network", message: "offline", retryable: true },
    })).toBe(true);
    expect(shouldRetryMatchBootstrap({ status: "restricted", reason: "rate-limited" })).toBe(true);
    expect(shouldRetryMatchBootstrap({ status: "restricted", reason: "logged-out" })).toBe(false);
    expect(shouldRetryMatchBootstrap({
      status: "ready",
      data: state.match,
      fetchedAt: Date.now(),
    })).toBe(false);
  });

  it("invalidates an in-flight navigation before old automations can run", async () => {
    const settings = createDefaultSettings();
    settings.showExtendedTier = true;
    await saveSettings(settings);
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

  it("loads the signed-in viewer tier on matchmaking and resyncs it after React mutations", async () => {
    const settings = createDefaultSettings();
    settings.showExtendedTier = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "matchmaking";

    await controller.navigate("/ru/matchmaking");

    expect(state.viewerRequested).toHaveBeenCalledOnce();
    expect(state.playerRequested).toHaveBeenCalledOnce();
    expect(state.overlayShowMatchmakingTier).toHaveBeenCalledWith(expect.objectContaining({
      nickname: "Viewer",
      elo: 2_486,
    }));

    state.overlaySyncMatchmakingTier.mockClear();
    state.domMutation?.();
    await vi.waitFor(() => expect(state.overlaySyncMatchmakingTier).toHaveBeenCalledOnce());
    controller.destroy();
  });

  it("does not remount a stale matchmaking tier after an expired reload fails", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-22T12:00:00Z"));
      const settings = createDefaultSettings();
      settings.showExtendedTier = true;
      await saveSettings(settings);
      const controller = new EloScopeController();
      await controller.start();
      state.mode = "matchmaking";
      await controller.navigate("/ru/matchmaking");
      expect(state.overlayShowMatchmakingTier).toHaveBeenCalledOnce();

      vi.setSystemTime(new Date("2026-07-22T12:06:00Z"));
      state.mode = "error";
      state.overlaySyncMatchmakingTier.mockClear();
      await controller.navigate("/ru/matchmaking");
      state.domMutation?.();

      expect(state.overlaySyncMatchmakingTier).not.toHaveBeenCalled();
      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the native room enhancements before all player histories finish loading", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.deferRecentMatches = true;
    const viewerHistory = [recentRow("player-a", "viewer-history-deferred")];
    state.recentMatchesByPlayer.set("player-a", viewerHistory);
    state.overlayShowMatch.mockClear();

    const navigation = controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.recentMatchesRequested).toHaveBeenCalledTimes(2));
    expect(state.overlayShowMatch).toHaveBeenCalledOnce();
    expect(state.overlayShowMatch.mock.calls[0]?.[1]).toEqual(new Map());
    expect(state.overlayShowMatch.mock.calls[0]?.[2]).toEqual(new Map());

    for (const resolve of state.recentMatchesResolvers.splice(0)) resolve(undefined);
    await navigation;
    expect(state.overlayShowMatch).toHaveBeenCalledTimes(2);
    expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).toMatchObject({
      id: "player-a",
      matches: viewerHistory,
    });
    controller.destroy();
  });

  it.each([
    [5, 5, true, 100],
    [100, 5, true, 100],
    [5, 100, true, 100],
    [5, 100, false, 100],
  ] as const)(
    "uses stats=%i, map window=%i, map WR enabled=%s -> request %i",
    async (statsWindow, mapWinRateWindow, showMapWinRates, expectedLimit) => {
      const settings = createDefaultSettings();
      settings.statsWindow = statsWindow;
      settings.mapWinRateWindow = mapWinRateWindow;
      settings.showMapWinRates = showMapWinRates;
      settings.interfaceVisibility.matchRoom = true;
      await saveSettings(settings);
      const controller = new EloScopeController();
      await controller.start();
      state.mode = "match";
      state.recentMatchesRequested.mockClear();

      await controller.navigate(`/ru/cs2/room/${state.match.id}`);

      expect(state.recentMatchesRequested).toHaveBeenCalledTimes(2);
      expect(state.recentMatchesRequested).toHaveBeenCalledWith("player-a", expectedLimit);
      expect(state.recentMatchesRequested).toHaveBeenCalledWith("player-b", expectedLimit);
      controller.destroy();
    },
  );

  it("skips room data requests when every data-dependent match enhancement is disabled", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    settings.showPlayerStats = false;
    settings.showPlayerFormBattery = false;
    settings.showPlayerRoles = false;
    settings.showPlayerEncounters = false;
    settings.showPlayerStreak = false;
    settings.showTeamSummary = false;
    settings.showMapWinRates = false;
    // Selected-map wins are part of the map-win-rate chart, not a separate
    // reason to fetch match-room data.
    settings.showSelectedMapWins = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.viewerRequested.mockClear();

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.recentMatchesRequested).not.toHaveBeenCalled();
    expect(state.mapStatsRequested).not.toHaveBeenCalled();
    expect(state.viewerRequested).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("loads only the data required by the enabled map-win-rate chart", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    settings.showPlayerStats = false;
    settings.showPlayerFormBattery = false;
    settings.showPlayerRoles = false;
    settings.showPlayerEncounters = false;
    settings.showPlayerStreak = false;
    settings.showTeamSummary = false;
    settings.showMapWinRates = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.viewerRequested.mockClear();

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.recentMatchesRequested).toHaveBeenCalledTimes(2);
    expect(state.mapStatsRequested).not.toHaveBeenCalled();
    expect(state.viewerRequested).not.toHaveBeenCalled();
    controller.destroy();
  });

  it("retries a transient bootstrap failure for a newly-created room without caching the error", async () => {
    vi.useFakeTimers();
    try {
      const settings = createDefaultSettings();
      settings.interfaceVisibility.matchRoom = true;
      await saveSettings(settings);
      const controller = new EloScopeController();
      await controller.start();
      state.mode = "match";
      state.matchFailuresRemaining = 1;
      state.matchRequested.mockClear();
      state.overlayShowMatch.mockClear();

      await controller.navigate(`/ru/cs2/room/${state.match.id}`);
      expect(state.matchRequested).toHaveBeenCalledOnce();
      expect(state.overlayShowMatch).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.waitFor(() => expect(state.matchRequested).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => expect(state.overlayShowMatch).toHaveBeenCalled());
      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
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

    expect(state.viewerRequested).toHaveBeenCalledOnce();
    expect(state.recentMatchesRequested).toHaveBeenCalledTimes(2);
    expect(state.overlayShowMatch.mock.calls[0]?.[2]).toEqual(new Map());
    expect(state.overlayShowMatch.mock.calls.at(-1)?.[3]).toBe("team-a");
    expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).toMatchObject({
      id: "player-a",
      matches: [],
    });
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(2));
    expect(state.mapStatsRequested).toHaveBeenCalledWith("player-a");
    expect(state.mapStatsRequested).toHaveBeenCalledWith("player-b");
    await vi.waitFor(() => expect(state.overlayInlineSync).toHaveBeenCalled());
    expect(state.overlayInlineSync.mock.calls.at(-1)?.[3]).toBe("team-a");
    expect(state.overlayInlineSync.mock.calls.at(-1)?.[4]).toMatchObject({
      id: "player-a",
      matches: [],
    });
    const mapStats = state.overlayInlineSync.mock.calls.at(-1)?.[2] as Map<string, Array<{ matches: number }>>;
    expect(mapStats.get("player-a")?.[0]?.matches).toBe(416);
    controller.destroy();
  });

  it("keeps lifetime map aggregates sequential so native profile reads retain capacity", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.deferMapStats = true;

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledOnce());
    expect(state.mapStatsRequested).toHaveBeenLastCalledWith("player-a");

    state.mapStatsResolvers.shift()?.(undefined);
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(2));
    expect(state.mapStatsRequested).toHaveBeenLastCalledWith("player-b");

    state.mapStatsResolvers.shift()?.(undefined);
    await vi.waitFor(() => expect(state.overlayInlineSync).toHaveBeenCalled());
    controller.destroy();
  });

  it("does not cache a rate-limited lifetime response and retries on the next room load", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.mapStatsRestrictedPlayers.add("player-a");

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(1));
    expect(state.mapStatsRequested).toHaveBeenLastCalledWith("player-a");

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(2));
    expect(state.mapStatsRequested).toHaveBeenLastCalledWith("player-a");
    controller.destroy();
  });

  it("loads a bounded viewer history when inspecting a room outside the roster", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.matchViewerId = "viewer-outside-room";
    const outsideHistory = [recentRow("viewer-outside-room", "viewer-outside-history")];
    state.recentMatchesByPlayer.set("viewer-outside-room", outsideHistory);
    state.recentMatchesRequested.mockClear();

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    await vi.waitFor(() => expect(state.recentMatchesRequested).toHaveBeenCalledTimes(3));
    expect(state.recentMatchesRequested).toHaveBeenCalledWith("viewer-outside-room", 100);
    await vi.waitFor(() => {
      expect(state.overlayInlineSync.mock.calls.at(-1)?.[4]).toMatchObject({
        id: "viewer-outside-room",
        matches: outsideHistory,
      });
    });
    controller.destroy();
  });

  it("passes the exact roster viewer history after player rows finish loading", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    const viewerHistory = [recentRow("player-a", "viewer-history")];
    state.recentMatchesByPlayer.set("player-a", viewerHistory);
    state.recentMatchesByPlayer.set("player-b", [recentRow("player-b", "other-history")]);

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    await vi.waitFor(() => {
      expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).toMatchObject({
        id: "player-a",
        matches: viewerHistory,
      });
    });
    controller.destroy();
  });

  it("keeps the full bounded encounter history separate from the 30-row display window", async () => {
    const settings = createDefaultSettings();
    settings.statsWindow = 30;
    settings.mapWinRateWindow = 30;
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";

    const viewerHistory = Array.from({ length: 40 }, (_, index) =>
      recentRow("player-a", index === 35 ? "shared-after-display-window" : `viewer-${index}`));
    const targetHistory = Array.from({ length: 40 }, (_, index) =>
      recentRow("player-b", index === 35 ? "shared-after-display-window" : `target-${index}`));
    state.recentMatchesByPlayer.set("player-a", viewerHistory);
    state.recentMatchesByPlayer.set("player-b", targetHistory);

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    const finalCall = state.overlayShowMatch.mock.calls.at(-1);
    const displayHistories = finalCall?.[1] as Map<string, unknown[]>;
    const viewer = finalCall?.[4] as {
      id: string;
      matches?: readonly unknown[];
      histories?: ReadonlyMap<string, readonly { id: string }[]>;
    };
    expect(displayHistories.get("player-a")).toHaveLength(30);
    expect(displayHistories.get("player-b")).toHaveLength(30);
    expect(displayHistories.get("player-a")?.some((row) =>
      (row as { id?: string }).id === "shared-after-display-window")).toBe(false);
    expect(viewer.matches).toHaveLength(40);
    expect(viewer.histories?.get("player-a")).toHaveLength(40);
    expect(viewer.histories?.get("player-b")).toHaveLength(40);
    expect(viewer.histories?.get("player-a")?.some(({ id }) =>
      id === "shared-after-display-window")).toBe(true);
    expect(viewer.histories?.get("player-b")?.some(({ id }) =>
      id === "shared-after-display-window")).toBe(true);
    controller.destroy();
  });

  it("adds viewer context when player histories resolve before the viewer request", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.deferViewer = true;
    const viewerHistory = [recentRow("player-a", "viewer-history-first")];
    state.recentMatchesByPlayer.set("player-a", viewerHistory);

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).toMatchObject({
      histories: expect.any(Map),
    });
    expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).not.toHaveProperty("id");
    expect(
      (state.overlayShowMatch.mock.calls.at(-1)?.[4] as {
        histories: ReadonlyMap<string, readonly unknown[]>;
      }).histories.get("player-a"),
    ).toEqual(viewerHistory);
    state.viewerResolver?.();
    await vi.waitFor(() => {
      expect(state.overlayInlineSync.mock.calls.at(-1)?.[4]).toMatchObject({
        id: "player-a",
        matches: viewerHistory,
      });
    });
    controller.destroy();
  });

  it("removes the previous viewer context during a same-room account refresh", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    const firstHistory = [recentRow("player-a", "first-viewer-history")];
    const secondHistory = [recentRow("player-b", "second-viewer-history")];
    state.recentMatchesByPlayer.set("player-a", firstHistory);
    state.recentMatchesByPlayer.set("player-b", secondHistory);

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.overlayShowMatch.mock.calls.at(-1)?.[4]).toMatchObject({
      id: "player-a",
      matches: firstHistory,
    }));

    state.matchViewerId = "player-b";
    state.deferViewer = true;
    state.overlayShowMatch.mockClear();
    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.overlayShowMatch).toHaveBeenCalled();
    expect(state.overlayShowMatch.mock.calls[0]?.[4]).not.toHaveProperty("id");
    expect(state.overlayShowMatch.mock.calls[0]?.[4]).not.toHaveProperty("matches");
    state.viewerResolver?.();
    await vi.waitFor(() => expect(state.overlayInlineSync.mock.calls.at(-1)?.[4]).toMatchObject({
      id: "player-b",
      matches: secondHistory,
    }));
    controller.destroy();
  });

  it("drops a deferred outside-viewer history after leaving the room", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    await controller.start();
    state.mode = "match";
    state.matchViewerId = "viewer-outside-room";
    state.recentMatchesByPlayer.set(
      "viewer-outside-room",
      [recentRow("viewer-outside-room", "stale-outside-history")],
    );
    state.deferredRecentPlayerIds.add("viewer-outside-room");

    await controller.navigate(`/ru/cs2/room/${state.match.id}`);
    await vi.waitFor(() => expect(state.recentMatchesResolvers).toHaveLength(1));
    await controller.navigate("/");
    state.overlayInlineSync.mockClear();
    for (const resolve of state.recentMatchesResolvers.splice(0)) resolve(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(state.overlayInlineSync).not.toHaveBeenCalled();
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
    await vi.waitFor(() => expect(state.mapStatsResolvers).toHaveLength(1));
    state.visibleMap = "nuke";
    state.domMutation?.();
    await vi.waitFor(() => {
      const current = state.overlayShowMatch.mock.calls.at(-1)?.[0] as { selectedMap?: string } | undefined;
      expect(current?.selectedMap).toBe("nuke");
    });

    state.mapStatsResolvers.shift()?.(undefined);
    await vi.waitFor(() => expect(state.mapStatsResolvers).toHaveLength(1));
    state.mapStatsResolvers.shift()?.(undefined);
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
      await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(1));

      await controller.navigate("/");
      for (const resolve of state.mapStatsResolvers.splice(0)) resolve(undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(state.mapStatsRequested).toHaveBeenCalledTimes(1);
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

  it.each([
    "/ru/players/FixturePlayer",
    "/ru/players/FixturePlayer/cs2/history",
  ])("does not read profile data for the removed panels when extended tiers are disabled", async (path) => {
    history.replaceState(null, "", "/");
    state.mode = "profile";
    const settings = createDefaultSettings();
    settings.interfaceVisibility.profileStatsBanner = false;
    await saveSettings(settings);
    const controller = new EloScopeController();
    try {
      await controller.start();
      state.playerRequested.mockClear();
      state.overlayShowProfileTier.mockClear();
      history.replaceState(null, "", path);
      await controller.navigate(path);

      expect(state.playerRequested).not.toHaveBeenCalled();
      expect(state.overlayShowProfileTier).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
  });

  it.each([
    ["profile summary", "/ru/players/FixturePlayer", false],
    ["history", "/ru/players/FixturePlayer/cs2/history", false],
    ["profile stats", "/ru/players/FixturePlayer/cs2/stats", true],
  ])("keeps %s tier-only without mounting the removed panels", async (_kind, path, includeRail) => {
    history.replaceState(null, "", "/");
    state.mode = "profile";
    const settings = createDefaultSettings();
    settings.showExtendedTier = true;
    settings.interfaceVisibility.profileStatsBanner = false;
    await saveSettings(settings);
    const controller = new EloScopeController();
    try {
      await controller.start();
      state.playerRequested.mockClear();
      state.recentMatchesRequested.mockClear();
      state.mapStatsRequested.mockClear();
      state.overlayShowProfileTier.mockClear();
      history.replaceState(null, "", path);
      await controller.navigate(path);

      expect(state.playerRequested).toHaveBeenCalledOnce();
      expect(state.recentMatchesRequested).not.toHaveBeenCalled();
      expect(state.mapStatsRequested).not.toHaveBeenCalled();
      expect(state.overlayShowProfileTier).toHaveBeenCalledWith(expect.objectContaining({
        nickname: "FixturePlayer",
        elo: 2_486,
      }), includeRail);

      state.overlaySyncProfileTier.mockClear();
      state.domMutation?.();

      await vi.waitFor(() => expect(state.overlaySyncProfileTier).toHaveBeenCalledWith(
        expect.objectContaining({ nickname: "FixturePlayer", elo: 2_486 }),
        includeRail,
      ));
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
  });

  it("loads and remounts the summary statistics banner independently of extended tiers", async () => {
    history.replaceState(null, "", "/");
    state.mode = "profile";
    const settings = createDefaultSettings();
    settings.showExtendedTier = false;
    settings.interfaceVisibility.profileStatsBanner = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    try {
      await controller.start();
      state.playerRequested.mockClear();
      state.recentMatchesRequested.mockClear();
      state.overlayShowProfileStats.mockClear();
      history.replaceState(null, "", "/ru/players/FixturePlayer/cs2");
      await controller.navigate(location.pathname);

      expect(state.playerRequested).toHaveBeenCalledOnce();
      expect(state.recentMatchesRequested).toHaveBeenCalledWith("profile-1", 30);
      expect(state.overlayShowProfileTier).not.toHaveBeenCalled();
      expect(state.overlayShowProfileStats).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ id: "profile-1", nickname: "FixturePlayer" }),
        { status: "loading" },
      );
      expect(state.overlayShowProfileStats).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: "profile-1" }),
        expect.objectContaining({ status: "ready", data: [] }),
      );

      state.overlaySyncProfileStats.mockClear();
      state.domMutation?.();
      await vi.waitFor(() => expect(state.overlaySyncProfileStats).toHaveBeenCalledOnce());
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
  });

  it.each([
    "/ru/players/FixturePlayer/cs2/stats",
    "/ru/players/FixturePlayer/cs2/history",
  ])("does not load the summary statistics banner on %s", async (path) => {
    history.replaceState(null, "", "/");
    state.mode = "profile";
    const settings = createDefaultSettings();
    settings.showExtendedTier = false;
    settings.interfaceVisibility.profileStatsBanner = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    try {
      await controller.start();
      state.playerRequested.mockClear();
      history.replaceState(null, "", path);
      await controller.navigate(path);

      expect(state.playerRequested).not.toHaveBeenCalled();
      expect(state.recentMatchesRequested).not.toHaveBeenCalled();
      expect(state.overlayShowProfileStats).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
  });

  it("does not remount a profile banner after its deferred match history resolves on another route", async () => {
    history.replaceState(null, "", "/");
    state.mode = "profile";
    state.deferRecentMatches = true;
    const settings = createDefaultSettings();
    settings.showExtendedTier = false;
    settings.interfaceVisibility.profileStatsBanner = true;
    await saveSettings(settings);
    const controller = new EloScopeController();
    try {
      await controller.start();
      history.replaceState(null, "", "/ru/players/FixturePlayer/cs2");
      const profileNavigation = controller.navigate(location.pathname);
      await vi.waitFor(() => expect(state.recentMatchesRequested).toHaveBeenCalledOnce());
      expect(state.overlayShowProfileStats).toHaveBeenCalledOnce();

      history.replaceState(null, "", "/ru/matchmaking");
      await controller.navigate(location.pathname);
      for (const resolve of state.recentMatchesResolvers.splice(0)) resolve({});
      await profileNavigation;

      expect(state.overlayShowProfileStats).toHaveBeenCalledOnce();
      expect(state.overlaySyncProfileStats).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
      history.replaceState(null, "", "/");
    }
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

  it("keeps automatic position sending active while the quick-positions panel is hidden", async () => {
    const settings = createDefaultSettings();
    expect(settings.interfaceVisibility.quickPositionsPanel).toBe(false);
    settings.automations.positions.mirage = {
      enabled: true,
      message: "I play connector",
      mode: "auto"
    };
    await saveSettings(settings);
    state.mode = "match";
    state.visibleMap = "mirage";
    state.match.status = "voting";
    const controller = new EloScopeController();

    await controller.start();
    await controller.navigate(`/ru/cs2/room/${state.match.id}`);

    expect(state.positionSend).toHaveBeenCalledOnce();
    controller.destroy();
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

  it("logs route, loads, render incompatibility, automation and position results without player or match data", async () => {
    const privateMessage = "Private connector message";
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    settings.automations.positions.mirage = {
      enabled: true,
      message: privateMessage,
      mode: "auto",
    };
    await saveSettings(settings);
    state.mode = "match";
    state.visibleMap = "mirage";
    state.match.status = "voting";
    state.automationResult = { action: "readyUp", clicked: true };
    state.overlayRenderResult = {
      status: "incompatible",
      reason: "player-card-contract",
    };
    const record = vi.spyOn(debugLog, "record").mockImplementation(() => undefined);
    const controller = new EloScopeController();

    try {
      await controller.start();
      record.mockClear();
      await controller.navigate(`/ru/cs2/room/${state.match.id}`);
      await vi.waitFor(() => expect(state.mapStatsRequested).toHaveBeenCalledTimes(2));

      const events = record.mock.calls.map(([event]) => event as Record<string, unknown>);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          component: "controller",
          event: "controller.navigate",
          route: "match",
          revision: expect.any(Number),
        }),
        expect.objectContaining({
          component: "controller",
          event: "controller.load",
          route: "match",
          operation: "match",
          status: "ready",
          count: 2,
        }),
        expect.objectContaining({
          component: "controller",
          event: "controller.load",
          route: "match",
          operation: "recentMatches",
          status: "ready",
          count: 2,
          total: 2,
        }),
        expect.objectContaining({
          level: "warn",
          component: "render",
          event: "render.match",
          route: "match",
          status: "incompatible",
          reason: "player-card-contract",
        }),
        expect.objectContaining({
          component: "automation",
          event: "automation.result",
          route: "match",
          action: "readyUp",
          status: "clicked",
        }),
        expect.objectContaining({
          component: "position",
          event: "position.result",
          route: "match",
          mode: "auto",
          status: "prepared",
        }),
      ]));

      const secrets = [
        privateMessage,
        state.match.id,
        ...state.match.teams.flatMap((team) =>
          team.players.flatMap((player) => [player.id, player.nickname])),
      ];
      for (const event of events) expectPrivacySafeDebugEvent(event, secrets);
    } finally {
      controller.destroy();
      record.mockRestore();
    }
  });

  it("logs only aggregate counts for a successful match render", async () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility.matchRoom = true;
    await saveSettings(settings);
    state.mode = "match";
    state.overlayRenderResult = {
      status: "rendered",
      players: 2,
      teams: 2,
      updated: 1,
    };
    const record = vi.spyOn(debugLog, "record").mockImplementation(() => undefined);
    const controller = new EloScopeController();

    try {
      await controller.start();
      record.mockClear();
      await controller.navigate(`/ru/cs2/room/${state.match.id}`);

      const renderEvents = record.mock.calls
        .map(([event]) => event as Record<string, unknown>)
        .filter((event) => event.event === "render.match");
      expect(renderEvents).toContainEqual(expect.objectContaining({
        component: "render",
        route: "match",
        status: "rendered",
        count: 2,
        total: 2,
        updated: 1,
      }));
      for (const event of renderEvents) {
        expectPrivacySafeDebugEvent(event, [
          state.match.id,
          ...state.match.teams.flatMap((team) =>
            team.players.flatMap((player) => [player.id, player.nickname])),
        ]);
      }
    } finally {
      controller.destroy();
      record.mockRestore();
    }
  });
});
