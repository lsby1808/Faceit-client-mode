import { EloScopeController } from "./controller";
import type { MapId } from "@eloscope/core";
import { LatestControllerLifecycle } from "./controller-restart";
import { debugLog } from "./debug-log";
import { applyOverlayVisibility } from "./interface-visibility";
import { MAIN_SOURCE, PROTOCOL_VERSION, type MainMessage } from "./protocol";
import { parseFaceitRoute } from "./routes";
import { loadSettings } from "./settings";
import {
  EloScopeSettingsPanel,
  SETTINGS_PANEL_HOST_ID
} from "./settings-panel";

let currentMapIds: MapId[] = [];
let stopDebugCapture: (() => void) | undefined;

function currentRouteKind() {
  return parseFaceitRoute(location.pathname).kind;
}

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
  await debugLog.start();
  debugLog.record({
    component: "runtime",
    event: "runtime.start",
    route: currentRouteKind(),
    status: "started",
  });
  stopDebugCapture ??= debugLog.installGlobalCapture(currentRouteKind);
  await waitForDocument();
  if (document.getElementById(SETTINGS_PANEL_HOST_ID)) return;

  const settingsPanel = new EloScopeSettingsPanel({
    mapIds: () => currentMapIds,
    onSaved: (settings) => {
      debugLog.record({
        component: "settings",
        event: "settings.save",
        route: currentRouteKind(),
        status: "success",
      });
      applyOverlayVisibility(settings);
      void restartController().catch(() => {
        debugLog.record({
          level: "error",
          component: "controller",
          event: "controller.error",
          route: currentRouteKind(),
          errorCode: "controller",
        });
      });
    }
  });
  settingsPanel.mount();
  void settingsPanel.promptForLanguageIfNeeded().catch(() => {
    debugLog.record({
      level: "warn",
      component: "settings",
      event: "settings.error",
      route: currentRouteKind(),
      status: "error",
    });
  });

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
  debugLog.record({
    component: "runtime",
    event: "runtime.ready",
    route: currentRouteKind(),
    status: "ready",
  });
}

window.addEventListener("pagehide", () => {
  debugLog.record({
    component: "runtime",
    event: "runtime.stop",
    route: currentRouteKind(),
  });
  stopDebugCapture?.();
  stopDebugCapture = undefined;
  void debugLog.flush();
}, { once: true });

void start().catch(() => {
  debugLog.record({
    level: "error",
    component: "runtime",
    event: "runtime.error",
    route: currentRouteKind(),
    errorCode: "startup",
  });
  void debugLog.flush();
  // Fail closed. The native FACEIT page remains untouched and operational.
});
