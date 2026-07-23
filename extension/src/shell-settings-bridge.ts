import type { ShellSettings } from "./settings";

const NATIVE_MARKER = "eloscopeNativeShell";
const GESTURE_PATTERN = /^[a-f0-9]{48}$/u;

export type ShellSettingsNavigate = (url: string) => void;

export function buildShellSettingsUrl(settings: ShellSettings, gesture: string): string {
  const autostart = settings.autostart ? "1" : "0";
  const minimizeToTray = settings.minimizeToTray ? "1" : "0";
  return `eloscope://settings/apply?autostart=${autostart}&minimize_to_tray=${minimizeToTray}#eloscope-gesture=${gesture}`;
}

export function requestNativeShellSettings(
  settings: ShellSettings,
  gesture: string | undefined,
  navigate: ShellSettingsNavigate = (url) => window.location.assign(url)
): boolean {
  if (document.documentElement.dataset[NATIVE_MARKER] !== "1") return false;
  if (!gesture || !GESTURE_PATTERN.test(gesture)) return false;

  try {
    navigate(buildShellSettingsUrl(settings, gesture));
    return true;
  } catch {
    return false;
  }
}
