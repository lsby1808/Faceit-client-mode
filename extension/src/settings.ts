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
  showPlayerRoles: boolean;
  interfaceVisibility: {
    profile: boolean;
    history: boolean;
    matchRoom: boolean;
  };
  automations: AutomationSettings;
};

export const SETTINGS_KEY = "eloscope:settings:v1";

type PositionSettings = AutomationSettings["positions"][string];

/**
 * FACEIT responses use lowercase map ids without the historical `de_` prefix.
 * Keep extension storage in that same canonical form so legacy/manual keys keep
 * working with the live match model.
 */
export function canonicalPositionMapId(value: unknown): MapId | undefined {
  if (typeof value !== "string") return undefined;
  const canonical = value
    .normalize("NFKC")
    .trim()
    .replace(/^de_/iu, "")
    .toLowerCase();
  if (
    !canonical ||
    canonical.length > 64 ||
    canonical === "__proto__" ||
    canonical === "constructor" ||
    canonical === "prototype" ||
    !/^[a-z0-9][a-z0-9 ._-]*$/u.test(canonical)
  ) return undefined;
  return canonical;
}

function canonicalizePositionSettings(
  input: unknown,
  mapPool: readonly MapId[] = []
): AutomationSettings {
  const parsed = parseAutomationSettings(input);
  const positions: AutomationSettings["positions"] = {};
  const merged = new Map<MapId, { exact: boolean; value: PositionSettings }>();

  for (const [rawMap, position] of Object.entries(parsed.positions)) {
    const map = canonicalPositionMapId(rawMap);
    if (!map) continue;
    const exact = rawMap === map;
    const previous = merged.get(map);
    if (!previous) {
      merged.set(map, { exact, value: { ...position } });
      continue;
    }

    // A canonical record is the user's newest authoritative choice. Never OR
    // a legacy enabled=true into an explicitly disabled canonical auto-send.
    if (exact) {
      merged.set(map, { exact: true, value: { ...position } });
      continue;
    }
    if (previous.exact) continue;

    // Multiple legacy spellings have no authoritative entry. Merge them once
    // so migration does not silently discard a useful pre-existing message.
    const preferred = previous.value;
    const fallback = position;
    const messageSource = preferred.message ? preferred : fallback.message ? fallback : undefined;
    merged.set(map, {
      exact: false,
      value: {
        // Conflicting legacy spellings are ambiguous. Keep automation opt-in:
        // every migrated record must agree that it was enabled, and a mode
        // disagreement falls back to the one-click confirmation path.
        enabled: previous.value.enabled && position.enabled,
        message: messageSource?.message ?? "",
        mode: preferred.mode === fallback.mode ? preferred.mode : "confirm"
      }
    });
  }

  for (const candidate of mapPool) {
    const map = canonicalPositionMapId(candidate);
    if (map && !merged.has(map)) {
      merged.set(map, {
        exact: true,
        value: { enabled: false, message: "", mode: "confirm" }
      });
    }
  }
  for (const [map, entry] of merged) positions[map] = entry.value;
  return { ...parsed, positions };
}

export function createDefaultSettings(): ExtensionSettings {
  return {
    statsWindow: 30,
    showExtendedTier: false,
    showPlayerRoles: true,
    interfaceVisibility: {
      profile: true,
      history: true,
      matchRoom: true
    },
    automations: createDefaultAutomationSettings()
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSettings(value: unknown): ExtensionSettings {
  const defaults = createDefaultSettings();
  if (!isRecord(value)) return defaults;

  const interfaceVisibility = isRecord(value.interfaceVisibility)
    ? value.interfaceVisibility
    : {};

  return {
    statsWindow: isStatsWindow(value.statsWindow) ? value.statsWindow : defaults.statsWindow,
    showExtendedTier: typeof value.showExtendedTier === "boolean" ? value.showExtendedTier : false,
    showPlayerRoles: typeof value.showPlayerRoles === "boolean"
      ? value.showPlayerRoles
      : defaults.showPlayerRoles,
    interfaceVisibility: {
      profile: typeof interfaceVisibility.profile === "boolean"
        ? interfaceVisibility.profile
        : defaults.interfaceVisibility.profile,
      history: typeof interfaceVisibility.history === "boolean"
        ? interfaceVisibility.history
        : defaults.interfaceVisibility.history,
      matchRoom: typeof interfaceVisibility.matchRoom === "boolean"
        ? interfaceVisibility.matchRoom
        : defaults.interfaceVisibility.matchRoom
    },
    automations: canonicalizePositionSettings(value.automations)
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

/**
 * Adds the currently visible FACEIT map pool without mutating the source
 * settings. Unknown/hostile ids are rejected by the core fail-closed parser.
 */
export function settingsWithPositionMaps(
  settings: ExtensionSettings,
  mapPool: readonly MapId[]
): ExtensionSettings {
  const safe = parseSettings(settings);
  return {
    ...safe,
    automations: canonicalizePositionSettings(safe.automations, mapPool)
  };
}

export function positionForMap(settings: ExtensionSettings, map: MapId) {
  const canonical = canonicalPositionMapId(map);
  return canonical ? settings.automations.positions[canonical] : undefined;
}

export { STATS_WINDOWS };
