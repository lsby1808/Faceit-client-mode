import { describe, expect, it, vi } from "vitest";
import {
  createDefaultSettings,
  loadSettings,
  parseSettings,
  saveSettings,
  SETTINGS_KEY,
  settingsWithPositionMaps
} from "../src/settings";

describe("extension settings", () => {
  it("keeps every automation off by default", () => {
    const settings = createDefaultSettings();
    expect(settings.statsWindow).toBe(30);
    expect(settings.profileStatsWindow).toBe(20);
    expect(settings.mapWinRateWindow).toBe(30);
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.showPlayerStats).toBe(true);
    expect(settings.showPlayerFormBattery).toBe(true);
    expect(settings.showPlayerRoles).toBe(true);
    expect(settings.showPlayerEncounters).toBe(true);
    expect(settings.showPlayerStreak).toBe(true);
    expect(settings.showTeamAverageElo).toBe(true);
    expect(settings.showEloStake).toBe(true);
    expect(settings.showMatchAcceptPreview).toBe(true);
    expect(settings.showTeamSummary).toBe(true);
    expect(settings.showMapWinRates).toBe(true);
    expect(settings.showSelectedMapWins).toBe(true);
    expect(settings.interfaceVisibility).toEqual({
      profile: false,
      history: false,
      profileStatsBanner: true,
      matchRoom: true,
      quickPositionsPanel: false
    });
    expect(settings.shell).toEqual({
      autostart: false,
      minimizeToTray: false
    });
    expect(settings.automations).toMatchObject({
      partyAccept: false,
      readyUp: false,
      mapVeto: { enabled: false },
      serverVeto: { enabled: false },
      autoConnect: false,
      copyServerData: false
    });
  });

  it("fails closed for malformed values", () => {
    const settings = parseSettings({
      statsWindow: 17,
      profileStatsWindow: 17,
      mapWinRateWindow: 17,
      showExtendedTier: "yes",
      showPlayerStats: "yes",
      showPlayerFormBattery: "yes",
      showPlayerRoles: "yes",
      showPlayerEncounters: "yes",
      showPlayerStreak: "yes",
      showTeamAverageElo: "yes",
      showEloStake: "yes",
      showTeamSummary: "yes",
      showMapWinRates: "yes",
      showSelectedMapWins: "yes",
      interfaceVisibility: { profile: false, history: "no", matchRoom: true },
      shell: { autostart: "yes", minimizeToTray: 1 },
      automations: { partyAccept: "yes", readyUp: 1, autoConnect: true }
    });
    expect(settings.statsWindow).toBe(30);
    expect(settings.profileStatsWindow).toBe(20);
    expect(settings.mapWinRateWindow).toBe(30);
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.showPlayerStats).toBe(true);
    expect(settings.showPlayerFormBattery).toBe(true);
    expect(settings.showPlayerRoles).toBe(true);
    expect(settings.showPlayerEncounters).toBe(true);
    expect(settings.showPlayerStreak).toBe(true);
    expect(settings.showTeamAverageElo).toBe(true);
    expect(settings.showEloStake).toBe(true);
    expect(settings.showTeamSummary).toBe(true);
    expect(settings.showMapWinRates).toBe(true);
    expect(settings.showSelectedMapWins).toBe(true);
    expect(settings.interfaceVisibility).toEqual({
      profile: false,
      history: false,
      profileStatsBanner: true,
      matchRoom: true,
      quickPositionsPanel: false
    });
    expect(settings.shell).toEqual({
      autostart: false,
      minimizeToTray: false
    });
    expect(settings.automations.partyAccept).toBe(false);
    expect(settings.automations.readyUp).toBe(false);
    expect(settings.automations.autoConnect).toBe(true);
  });

  it("migrates legacy settings to enabled visual enhancements and preserves explicit opt-outs", () => {
    expect(parseSettings({ statsWindow: 50 }).showPlayerRoles).toBe(true);
    expect(parseSettings({ showPlayerStats: false }).showPlayerStats).toBe(false);
    expect(parseSettings({ showPlayerFormBattery: false }).showPlayerFormBattery).toBe(false);
    expect(parseSettings({ showPlayerRoles: false }).showPlayerRoles).toBe(false);
    expect(parseSettings({ showPlayerEncounters: false }).showPlayerEncounters).toBe(false);
    expect(parseSettings({ statsWindow: 50 }).showPlayerStreak).toBe(true);
    expect(parseSettings({ showPlayerStreak: false }).showPlayerStreak).toBe(false);
    expect(parseSettings({ showTeamAverageElo: false }).showTeamAverageElo).toBe(false);
    expect(parseSettings({ showEloStake: false }).showEloStake).toBe(false);
    expect(parseSettings({ statsWindow: 50 }).showTeamSummary).toBe(true);
    expect(parseSettings({ showTeamSummary: false }).showTeamSummary).toBe(false);
    expect(parseSettings({ statsWindow: 50 }).showMapWinRates).toBe(true);
    expect(parseSettings({ showMapWinRates: false }).showMapWinRates).toBe(false);
    expect(parseSettings({ showSelectedMapWins: false }).showSelectedMapWins).toBe(false);
  });

  it("migrates a missing or invalid map WR window to 30 exactly once", async () => {
    const legacy = {
      ...createDefaultSettings(),
      mapWinRateWindow: 17
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      statsWindow: 30,
      mapWinRateWindow: 30
    });
    expect(setSpy).toHaveBeenCalledOnce();

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("adds the default map WR window to legacy settings where the key is absent", async () => {
    const legacy = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacy.mapWinRateWindow;
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({ mapWinRateWindow: 30 });
    expect(setSpy).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: { mapWinRateWindow: 30 }
    });
  });

  it("adds the enabled streak indicator to legacy settings exactly once", async () => {
    const legacy = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacy.showPlayerStreak;
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({ showPlayerStreak: true });
    expect(setSpy).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: { showPlayerStreak: true }
    });

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("adds the enabled team summary to legacy settings exactly once", async () => {
    const legacy = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacy.showTeamSummary;
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({ showTeamSummary: true });
    expect(setSpy).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: { showTeamSummary: true }
    });

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("adds newly configurable match-room features to legacy settings exactly once", async () => {
    const legacy = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    delete legacy.profileStatsWindow;
    delete legacy.showPlayerStats;
    delete legacy.showPlayerFormBattery;
    delete legacy.showPlayerEncounters;
    delete legacy.showTeamAverageElo;
    delete legacy.showEloStake;
    delete legacy.showSelectedMapWins;
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      profileStatsWindow: 20,
      showPlayerStats: true,
      showPlayerFormBattery: true,
      showPlayerEncounters: true,
      showTeamAverageElo: true,
      showEloStake: true,
      showSelectedMapWins: true,
    });
    expect(setSpy).toHaveBeenCalledOnce();

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("preserves an explicit disabled team summary while migrating another legacy key", async () => {
    const legacy = createDefaultSettings() as Partial<ReturnType<typeof createDefaultSettings>>;
    legacy.showTeamSummary = false;
    delete legacy.showPlayerStreak;
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });

    await expect(loadSettings()).resolves.toMatchObject({
      showTeamSummary: false,
      showPlayerStreak: true,
    });
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: {
        showTeamSummary: false,
        showPlayerStreak: true,
      },
    });
  });

  it("keeps profile, map WR and general statistics windows independent", () => {
    expect(parseSettings({
      statsWindow: 100,
      profileStatsWindow: 20,
      mapWinRateWindow: 5
    })).toMatchObject({
      statsWindow: 100,
      profileStatsWindow: 20,
      mapWinRateWindow: 5
    });
  });

  it("migrates legacy profile and history overlays to false exactly once", async () => {
    const legacy = {
      ...createDefaultSettings(),
      interfaceVisibility: { profile: true, history: true, matchRoom: false }
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      interfaceVisibility: {
        profile: false,
        history: false,
        profileStatsBanner: true,
        matchRoom: false,
        quickPositionsPanel: false
      }
    });
    expect(setSpy).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: {
        interfaceVisibility: {
          profile: false,
          history: false,
          profileStatsBanner: true,
          matchRoom: false,
          quickPositionsPanel: false
        }
      }
    });

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("persists retired overlay defaults once when settings are absent", async () => {
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      interfaceVisibility: {
        profile: false,
        history: false,
        profileStatsBanner: true,
        matchRoom: true,
        quickPositionsPanel: false
      }
    });
    expect(setSpy).toHaveBeenCalledOnce();

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("adds a sanitized dynamic map pool without mutating the source", () => {
    const source = createDefaultSettings();
    const result = settingsWithPositionMaps(source, ["Mirage", "nuke", "__proto__", "Mirage"]);
    expect(Object.keys(source.automations.positions)).toEqual([]);
    expect(Object.keys(result.automations.positions)).toEqual(["mirage", "nuke"]);
    expect(result.automations.positions.mirage).toEqual({
      enabled: false,
      message: "",
      mode: "confirm"
    });
  });

  it("migrates and merges legacy map spellings into one canonical storage key", () => {
    const settings = parseSettings({
      automations: {
        positions: {
          Mirage: { enabled: true, message: "legacy upper", mode: "auto" },
          de_mirage: { enabled: false, message: "legacy prefix", mode: "prefill" },
          mirage: { enabled: false, message: "canonical", mode: "confirm" }
        }
      }
    });

    expect(Object.keys(settings.automations.positions)).toEqual(["mirage"]);
    expect(settings.automations.positions.mirage).toEqual({
      enabled: false,
      message: "canonical",
      mode: "confirm"
    });
  });

  it("fails closed when conflicting legacy map spellings have no canonical record", () => {
    const settings = parseSettings({
      automations: {
        positions: {
          Mirage: { enabled: true, message: "legacy upper", mode: "auto" },
          de_mirage: { enabled: false, message: "legacy prefix", mode: "prefill" }
        }
      }
    });

    expect(settings.automations.positions.mirage).toEqual({
      enabled: false,
      message: "legacy upper",
      mode: "confirm"
    });
  });

  it("persists the complete settings object with one storage write", async () => {
    const settings = settingsWithPositionMaps(createDefaultSettings(), ["mirage"]);
    settings.statsWindow = 50;
    settings.profileStatsWindow = 10;
    settings.mapWinRateWindow = 100;
    settings.showExtendedTier = true;
    settings.showPlayerStats = false;
    settings.showPlayerFormBattery = false;
    settings.showPlayerRoles = false;
    settings.showPlayerEncounters = false;
    settings.showPlayerStreak = false;
    settings.showTeamAverageElo = false;
    settings.showEloStake = false;
    settings.showTeamSummary = false;
    settings.showMapWinRates = false;
    settings.showSelectedMapWins = false;
    settings.interfaceVisibility.matchRoom = false;
    settings.interfaceVisibility.quickPositionsPanel = true;
    settings.automations.positions.mirage = {
      enabled: true,
      message: "I play connector",
      mode: "prefill"
    };

    await saveSettings(settings);
    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
