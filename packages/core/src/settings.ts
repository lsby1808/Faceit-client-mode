import type { AutomationSettings, MapId, PositionMessageMode } from "./types.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanIdentifier = (value: unknown, maxLength = 64): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/gu, "")
    .trim();
  return cleaned.length > 0 &&
    cleaned.length <= maxLength &&
    /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/u.test(cleaned)
    ? cleaned
    : undefined;
};

const cleanMapId = (value: unknown): string | undefined => {
  const cleaned = cleanIdentifier(value);
  if (!cleaned || cleaned === "__proto__" || cleaned === "constructor" || cleaned === "prototype") return undefined;
  return cleaned;
};

const cleanOrder = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    const cleaned = cleanIdentifier(candidate);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    output.push(cleaned);
    if (output.length >= 32) break;
  }
  return output;
};

const cleanMessage = (value: unknown): string => {
  if (typeof value !== "string") return "";
  // Chat text is later assigned through textContent/value. Control characters
  // other than line breaks are removed here to keep storage deterministic.
  return value.normalize("NFKC").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/gu, "").slice(0, 280);
};

const cleanMode = (value: unknown): PositionMessageMode =>
  value === "auto" || value === "prefill" || value === "confirm" ? value : "confirm";

export const createDefaultAutomationSettings = (mapPool: readonly MapId[] = []): AutomationSettings => {
  const positions: AutomationSettings["positions"] = {};
  const seen = new Set<string>();
  for (const candidate of mapPool) {
    const map = cleanMapId(candidate);
    if (!map || seen.has(map)) continue;
    seen.add(map);
    positions[map] = { enabled: false, message: "", mode: "confirm" };
  }
  return {
    partyAccept: false,
    readyUp: false,
    mapVeto: { enabled: false, banOrder: [], pickOrder: [] },
    serverVeto: { enabled: false, order: [] },
    autoConnect: false,
    copyServerData: false,
    positions,
  };
};

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

const freezeAutomationSettings = (settings: AutomationSettings): DeepReadonly<AutomationSettings> => {
  Object.freeze(settings.mapVeto.banOrder);
  Object.freeze(settings.mapVeto.pickOrder);
  Object.freeze(settings.mapVeto);
  Object.freeze(settings.serverVeto.order);
  Object.freeze(settings.serverVeto);
  for (const position of Object.values(settings.positions)) Object.freeze(position);
  Object.freeze(settings.positions);
  return Object.freeze(settings) as DeepReadonly<AutomationSettings>;
};

export const DEFAULT_AUTOMATION_SETTINGS = freezeAutomationSettings(
  createDefaultAutomationSettings(),
);

/** Fail-closed parser used for extension storage migrations and hostile page input. */
export const parseAutomationSettings = (
  input: unknown,
  mapPool: readonly MapId[] = [],
): AutomationSettings => {
  const source = isRecord(input) ? input : {};
  const defaults = createDefaultAutomationSettings(mapPool);
  const mapVeto = isRecord(source.mapVeto) ? source.mapVeto : {};
  const serverVeto = isRecord(source.serverVeto) ? source.serverVeto : {};
  const sourcePositions = isRecord(source.positions) ? source.positions : {};
  const positions = { ...defaults.positions };

  for (const [rawMap, rawSettings] of Object.entries(sourcePositions).slice(0, 64)) {
    const map = cleanMapId(rawMap);
    if (!map || !isRecord(rawSettings)) continue;
    positions[map] = {
      enabled: rawSettings.enabled === true,
      message: cleanMessage(rawSettings.message),
      mode: cleanMode(rawSettings.mode),
    };
  }

  return {
    partyAccept: source.partyAccept === true,
    readyUp: source.readyUp === true,
    mapVeto: {
      enabled: mapVeto.enabled === true,
      banOrder: cleanOrder(mapVeto.banOrder),
      pickOrder: cleanOrder(mapVeto.pickOrder),
    },
    serverVeto: {
      enabled: serverVeto.enabled === true,
      order: cleanOrder(serverVeto.order),
    },
    autoConnect: source.autoConnect === true,
    copyServerData: source.copyServerData === true,
    positions,
  };
};
