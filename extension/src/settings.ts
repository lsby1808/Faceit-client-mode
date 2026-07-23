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
  /** Independent recent-match window used by the profile statistics banner. */
  profileStatsWindow: StatsWindow;
  /** Independent recent-match window used for match-room map win rates. */
  mapWinRateWindow: StatsWindow;
  showExtendedTier: boolean;
  /** Shows the native-flow per-player statistics card in a match room. */
  showPlayerStats: boolean;
  /** Shows the recent-form battery beside a player's nickname. */
  showPlayerFormBattery: boolean;
  showPlayerRoles: boolean;
  /** Shows prior teammate/opponent counters and their hover details. */
  showPlayerEncounters: boolean;
  /** Shows the current consecutive win/loss run beside match-room player names. */
  showPlayerStreak: boolean;
  /** Shows each team's average ELO in the match header. */
  showTeamAverageElo: boolean;
  /** Shows the estimated ELO gain/loss beside the team average. */
  showEloStake: boolean;
  /** Shows the compact team chance/form summary above each match-room roster. */
  showTeamSummary: boolean;
  showMapWinRates: boolean;
  /** Shows the two roster-wide win totals inside the selected-map card. */
  showSelectedMapWins: boolean;
  interfaceVisibility: {
    /** @deprecated Profile data panels were retired; kept false for v1 storage compatibility. */
    profile: boolean;
    /** @deprecated History data panels were retired; kept false for v1 storage compatibility. */
    history: boolean;
    /** Compact, native-flow statistics banner on the player profile summary. */
    profileStatsBanner: boolean;
    matchRoom: boolean;
    quickPositionsPanel: boolean;
  };
  shell: ShellSettings;
  automations: AutomationSettings;
};

export type ShellSettings = {
  autostart: boolean;
  minimizeToTray: boolean;
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
    profileStatsWindow: 20,
    mapWinRateWindow: 30,
    showExtendedTier: false,
    showPlayerStats: true,
    showPlayerFormBattery: true,
    showPlayerRoles: true,
    showPlayerEncounters: true,
    showPlayerStreak: true,
    showTeamAverageElo: true,
    showEloStake: true,
    showTeamSummary: true,
    showMapWinRates: true,
    showSelectedMapWins: true,
    interfaceVisibility: {
      profile: false,
      history: false,
      profileStatsBanner: true,
      matchRoom: true,
      quickPositionsPanel: false
    },
    shell: {
      autostart: false,
      minimizeToTray: false
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
  const shell = isRecord(value.shell) ? value.shell : {};

  return {
    statsWindow: isStatsWindow(value.statsWindow) ? value.statsWindow : defaults.statsWindow,
    profileStatsWindow: isStatsWindow(value.profileStatsWindow)
      ? value.profileStatsWindow
      : defaults.profileStatsWindow,
    mapWinRateWindow: isStatsWindow(value.mapWinRateWindow)
      ? value.mapWinRateWindow
      : defaults.mapWinRateWindow,
    showExtendedTier: typeof value.showExtendedTier === "boolean" ? value.showExtendedTier : false,
    showPlayerStats: typeof value.showPlayerStats === "boolean"
      ? value.showPlayerStats
      : defaults.showPlayerStats,
    showPlayerFormBattery: typeof value.showPlayerFormBattery === "boolean"
      ? value.showPlayerFormBattery
      : defaults.showPlayerFormBattery,
    showPlayerRoles: typeof value.showPlayerRoles === "boolean"
      ? value.showPlayerRoles
      : defaults.showPlayerRoles,
    showPlayerEncounters: typeof value.showPlayerEncounters === "boolean"
      ? value.showPlayerEncounters
      : defaults.showPlayerEncounters,
    showPlayerStreak: typeof value.showPlayerStreak === "boolean"
      ? value.showPlayerStreak
      : defaults.showPlayerStreak,
    showTeamAverageElo: typeof value.showTeamAverageElo === "boolean"
      ? value.showTeamAverageElo
      : defaults.showTeamAverageElo,
    showEloStake: typeof value.showEloStake === "boolean"
      ? value.showEloStake
      : defaults.showEloStake,
    showTeamSummary: typeof value.showTeamSummary === "boolean"
      ? value.showTeamSummary
      : defaults.showTeamSummary,
    showMapWinRates: typeof value.showMapWinRates === "boolean"
      ? value.showMapWinRates
      : defaults.showMapWinRates,
    showSelectedMapWins: typeof value.showSelectedMapWins === "boolean"
      ? value.showSelectedMapWins
      : defaults.showSelectedMapWins,
    interfaceVisibility: {
      // Keep the retired keys in the v1 storage shape so older clients fail
      // closed after a downgrade. Legacy true values must never revive panels.
      profile: false,
      history: false,
      profileStatsBanner: typeof interfaceVisibility.profileStatsBanner === "boolean"
        ? interfaceVisibility.profileStatsBanner
        : defaults.interfaceVisibility.profileStatsBanner,
      matchRoom: typeof interfaceVisibility.matchRoom === "boolean"
        ? interfaceVisibility.matchRoom
        : defaults.interfaceVisibility.matchRoom,
      quickPositionsPanel: typeof interfaceVisibility.quickPositionsPanel === "boolean"
        ? interfaceVisibility.quickPositionsPanel
        : defaults.interfaceVisibility.quickPositionsPanel
    },
    shell: {
      autostart: typeof shell.autostart === "boolean"
        ? shell.autostart
        : defaults.shell.autostart,
      minimizeToTray: typeof shell.minimizeToTray === "boolean"
        ? shell.minimizeToTray
        : defaults.shell.minimizeToTray
    },
    automations: canonicalizePositionSettings(value.automations)
  };
}

function needsSettingsMigration(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.interfaceVisibility)) return true;
  const shell = isRecord(value.shell) ? value.shell : {};
  return value.interfaceVisibility.profile !== false
    || value.interfaceVisibility.history !== false
    || typeof value.interfaceVisibility.profileStatsBanner !== "boolean"
    || !isStatsWindow(value.profileStatsWindow)
    || !isStatsWindow(value.mapWinRateWindow)
    || typeof value.showPlayerStats !== "boolean"
    || typeof value.showPlayerFormBattery !== "boolean"
    || typeof value.showPlayerStreak !== "boolean"
    || typeof value.showPlayerEncounters !== "boolean"
    || typeof value.showTeamAverageElo !== "boolean"
    || typeof value.showEloStake !== "boolean"
    || typeof value.showTeamSummary !== "boolean"
    || typeof value.showSelectedMapWins !== "boolean"
    || typeof shell.autostart !== "boolean"
    || typeof shell.minimizeToTray !== "boolean";
}

export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const raw = stored[SETTINGS_KEY];
    const safe = parseSettings(raw);
    if (needsSettingsMigration(raw)) {
      try {
        await chrome.storage.local.set({ [SETTINGS_KEY]: safe });
      } catch {
        // A failed migration write must not discard otherwise valid settings.
      }
    }
    return safe;
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
