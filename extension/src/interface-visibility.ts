import { parseFaceitRoute } from "./routes";
import type { ExtensionSettings } from "./settings";

export function isOverlayVisibleForPath(
  settings: ExtensionSettings,
  pathname: string
): boolean {
  const route = parseFaceitRoute(pathname);
  switch (route.kind) {
    case "profile":
    case "history":
      return false;
    case "match":
      return settings.interfaceVisibility.matchRoom
        || settings.interfaceVisibility.quickPositionsPanel;
    case "matchmaking":
    case "logged-out":
    case "other":
      return true;
  }
}

export function applyOverlayVisibility(
  settings: ExtensionSettings,
  pathname = location.pathname,
  root: ParentNode = document
): void {
  const overlay = root.querySelector<HTMLElement>("#eloscope-root");
  if (!overlay) return;
  overlay.hidden = !isOverlayVisibleForPath(settings, pathname);
}
