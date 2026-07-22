import { createDefaultSettings, SETTINGS_KEY } from "../src/settings";
import { EloScopeSettingsPanel } from "../src/settings-panel";

const settings = createDefaultSettings();
settings.automations.positions = {
  mirage: { enabled: true, message: "I play A connector", mode: "confirm" },
  nuke: { enabled: false, message: "I can play ramp", mode: "prefill" },
  ancient: { enabled: false, message: "", mode: "confirm" }
};

let stored: unknown = settings;
const localStorageMock = {
  async get(key: string) {
    return { [key]: key === SETTINGS_KEY ? stored : undefined };
  },
  async set(values: Record<string, unknown>) {
    stored = values[SETTINGS_KEY];
  }
};
const fixtureGlobal = globalThis as typeof globalThis & {
  chrome?: { storage?: { local?: typeof localStorageMock } };
};
fixtureGlobal.chrome ??= {};
fixtureGlobal.chrome.storage = { local: localStorageMock };

const panel = new EloScopeSettingsPanel();
panel.mount();
void panel.open();
