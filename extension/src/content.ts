import { EloScopeController } from "./controller";
import type { MapId } from "@eloscope/core";
import { LatestControllerLifecycle } from "./controller-restart";
import { applyOverlayVisibility } from "./interface-visibility";
import { MAIN_SOURCE, PROTOCOL_VERSION, type MainMessage } from "./protocol";
import { loadSettings } from "./settings";
import {
  EloScopeSettingsPanel,
  SETTINGS_PANEL_HOST_ID
} from "./settings-panel";

let currentMapIds: MapId[] = [];

async function applyCurrentVisibility(): Promise<void> {
  const settings = await loadSettings();
  applyOverlayVisibility(settings);
}

async function waitForDocument(): Promise<void> {
  if (document.documentElement) return;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document, { childList: true });
  });
}

const controllerLifecycle = new LatestControllerLifecycle(
  () => new EloScopeController({
      onMapPoolChange: (mapIds) => {
        currentMapIds = [...mapIds];
      }
    }),
  applyCurrentVisibility
);

async function restartController(): Promise<void> {
  return controllerLifecycle.restart();
}

async function start(): Promise<void> {
  if (location.origin !== "https://www.faceit.com") return;
  await waitForDocument();
  if (document.getElementById(SETTINGS_PANEL_HOST_ID)) return;

  const settingsPanel = new EloScopeSettingsPanel({
    mapIds: () => currentMapIds,
    onSaved: (settings) => {
      applyOverlayVisibility(settings);
      void restartController().catch(() => undefined);
    }
  });
  settingsPanel.mount();

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data as Partial<MainMessage>;
    if (
      message.source !== MAIN_SOURCE ||
      message.version !== PROTOCOL_VERSION ||
      message.type !== "route"
    ) return;
    void applyCurrentVisibility();
  });
  window.addEventListener("popstate", () => {
    void applyCurrentVisibility();
  });

  if (!document.getElementById("eloscope-root")) await restartController();
  else await applyCurrentVisibility();
}

void start().catch(() => {
  // Fail closed. The native FACEIT page remains untouched and operational.
});
