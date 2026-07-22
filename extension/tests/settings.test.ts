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
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.showPlayerRoles).toBe(true);
    expect(settings.showMapWinRates).toBe(true);
    expect(settings.interfaceVisibility).toEqual({
      profile: false,
      history: false,
      matchRoom: true
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
      showExtendedTier: "yes",
      showPlayerRoles: "yes",
      showMapWinRates: "yes",
      interfaceVisibility: { profile: false, history: "no", matchRoom: true },
      automations: { partyAccept: "yes", readyUp: 1, autoConnect: true }
    });
    expect(settings.statsWindow).toBe(30);
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.showPlayerRoles).toBe(true);
    expect(settings.showMapWinRates).toBe(true);
    expect(settings.interfaceVisibility).toEqual({
      profile: false,
      history: false,
      matchRoom: true
    });
    expect(settings.automations.partyAccept).toBe(false);
    expect(settings.automations.readyUp).toBe(false);
    expect(settings.automations.autoConnect).toBe(true);
  });

  it("migrates legacy settings to enabled visual enhancements and preserves explicit opt-outs", () => {
    expect(parseSettings({ statsWindow: 50 }).showPlayerRoles).toBe(true);
    expect(parseSettings({ showPlayerRoles: false }).showPlayerRoles).toBe(false);
    expect(parseSettings({ statsWindow: 50 }).showMapWinRates).toBe(true);
    expect(parseSettings({ showMapWinRates: false }).showMapWinRates).toBe(false);
  });

  it("migrates legacy profile and history overlays to false exactly once", async () => {
    const legacy = {
      ...createDefaultSettings(),
      interfaceVisibility: { profile: true, history: true, matchRoom: false }
    };
    await chrome.storage.local.set({ [SETTINGS_KEY]: legacy });
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      interfaceVisibility: { profile: false, history: false, matchRoom: false }
    });
    expect(setSpy).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(SETTINGS_KEY)).resolves.toMatchObject({
      [SETTINGS_KEY]: {
        interfaceVisibility: { profile: false, history: false, matchRoom: false }
      }
    });

    setSpy.mockClear();
    await loadSettings();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("persists retired overlay defaults once when settings are absent", async () => {
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    await expect(loadSettings()).resolves.toMatchObject({
      interfaceVisibility: { profile: false, history: false, matchRoom: true }
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
    settings.showExtendedTier = true;
    settings.showPlayerRoles = false;
    settings.showMapWinRates = false;
    settings.interfaceVisibility.matchRoom = false;
    settings.automations.positions.mirage = {
      enabled: true,
      message: "I play connector",
      mode: "prefill"
    };

    await saveSettings(settings);
    await expect(loadSettings()).resolves.toEqual(settings);
  });
});
