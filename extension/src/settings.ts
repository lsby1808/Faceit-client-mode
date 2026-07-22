import {
  createDefaultAutomationSettings,
  parseAutomationSettings,
  type AutomationSettings,
  type MapId,
  type StatsWindow
} from "@eloscope/core";
import { STATS_WINDOWS, isStatsWindow } from "./protocol";

export type ExtensionSettings = {
  statsWindow: StatsWindow;
  showExtendedTier: boolean;
  automations: AutomationSettings;
};

export const SETTINGS_KEY = "eloscope:settings:v1";

export function createDefaultSettings(): ExtensionSettings {
  return {
    statsWindow: 30,
    showExtendedTier: false,
    automations: createDefaultAutomationSettings()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSettings(value: unknown): ExtensionSettings {
  const defaults = createDefaultSettings();
  if (!isRecord(value)) return defaults;

  return {
    statsWindow: isStatsWindow(value.statsWindow) ? value.statsWindow : defaults.statsWindow,
    showExtendedTier: typeof value.showExtendedTier === "boolean" ? value.showExtendedTier : false,
    automations: parseAutomationSettings(value.automations)
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    return parseSettings(stored[SETTINGS_KEY]);
  } catch {
    return createDefaultSettings();
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const safe = parseSettings(settings);
  await chrome.storage.local.set({ [SETTINGS_KEY]: safe });
}

export function positionForMap(settings: ExtensionSettings, map: MapId) {
  return settings.automations.positions[map];
}

export { STATS_WINDOWS };
