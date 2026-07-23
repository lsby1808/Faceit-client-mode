import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildShellSettingsUrl,
  requestNativeShellSettings
} from "../src/shell-settings-bridge";

const GESTURE = "0123456789abcdef0123456789abcdef0123456789abcdef";

afterEach(() => {
  delete document.documentElement.dataset.eloscopeNativeShell;
});

describe("shell settings bridge", () => {
  it("builds the narrow native settings URL", () => {
    expect(buildShellSettingsUrl({ autostart: true, minimizeToTray: false }, GESTURE))
      .toBe(`eloscope://settings/apply?autostart=1&minimize_to_tray=0#eloscope-gesture=${GESTURE}`);
  });

  it("does not navigate outside EloScope native WebView", () => {
    const navigate = vi.fn();

    expect(requestNativeShellSettings(
      { autostart: true, minimizeToTray: true },
      GESTURE,
      navigate,
    )).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("requires a valid trusted gesture token", () => {
    document.documentElement.dataset.eloscopeNativeShell = "1";
    const navigate = vi.fn();

    expect(requestNativeShellSettings(
      { autostart: true, minimizeToTray: true },
      "wrong",
      navigate,
    )).toBe(false);
    expect(requestNativeShellSettings(
      { autostart: true, minimizeToTray: true },
      undefined,
      navigate,
    )).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates once when native marker and gesture are present", () => {
    document.documentElement.dataset.eloscopeNativeShell = "1";
    const navigate = vi.fn();

    expect(requestNativeShellSettings(
      { autostart: false, minimizeToTray: true },
      GESTURE,
      navigate,
    )).toBe(true);
    expect(navigate).toHaveBeenCalledWith(
      `eloscope://settings/apply?autostart=0&minimize_to_tray=1#eloscope-gesture=${GESTURE}`,
    );
  });
});
