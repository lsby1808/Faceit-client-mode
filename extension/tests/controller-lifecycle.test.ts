import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: "error" as "error" | "pending-profile" | "match",
  resolvePlayer: undefined as ((value: unknown) => void) | undefined,
  playerRequested: vi.fn(),
  matchRequested: vi.fn(),
  automationRun: vi.fn(),
  automationReset: vi.fn(),
  positionSend: vi.fn(),
  overlayShowMatch: vi.fn(),
  domMutation: undefined as (() => void) | undefined,
  visibleMap: null as string | null,
  match: {
    id: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    game: "cs2",
    status: "voting",
    mapPool: ["mirage", "nuke"],
    teams: [
      { id: "team-a", players: [] },
      { id: "team-b", players: [] }
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

    getRecentMatches(): Promise<unknown> {
      return Promise.resolve({ status: "ready", data: [], fetchedAt: Date.now() });
    }

    getPlayerMapStats(): Promise<unknown> {
      return Promise.resolve({ status: "ready", data: [], fetchedAt: Date.now() });
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
    showMatch(): void { state.overlayShowMatch(); }
    destroy(): void {}
  }
}));

import { allowsAutomaticPosition, EloScopeController } from "../src/controller";
import { createDefaultSettings, saveSettings } from "../src/settings";

describe("controller lifecycle", () => {
  beforeEach(() => {
    state.mode = "error";
    state.resolvePlayer = undefined;
    state.playerRequested.mockClear();
    state.matchRequested.mockClear();
    state.automationRun.mockClear();
    state.automationReset.mockClear();
    state.positionSend.mockClear();
    state.overlayShowMatch.mockClear();
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
    expect(onMapPoolChange).toHaveBeenLastCalledWith(["mirage", "nuke"]);
    expect(state.automationRun).toHaveBeenCalledOnce();
    expect(state.overlayShowMatch).not.toHaveBeenCalled();

    state.visibleMap = "mirage";
    state.domMutation?.();
    expect(state.automationRun).toHaveBeenCalledTimes(2);
    expect(state.overlayShowMatch).not.toHaveBeenCalled();
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
});
