import { describe, expect, it } from "vitest";
import {
  applyOverlayVisibility,
  isOverlayVisibleForPath
} from "../src/interface-visibility";
import { createDefaultSettings } from "../src/settings";

describe("interface visibility", () => {
  it("applies independent profile, history and match-room switches", () => {
    const settings = createDefaultSettings();
    settings.interfaceVisibility = {
      profile: false,
      history: true,
      matchRoom: false
    };

    expect(isOverlayVisibleForPath(settings, "/en/players/player")).toBe(false);
    expect(isOverlayVisibleForPath(settings, "/en/players/player/cs2/history")).toBe(true);
    expect(isOverlayVisibleForPath(settings, "/en/cs2/room/11111111-2222-3333-4444-555555555555")).toBe(false);
    expect(isOverlayVisibleForPath(settings, "/en/login")).toBe(true);
  });

  it("hides only the data overlay host and leaves global settings available", () => {
    const overlay = document.createElement("div");
    overlay.id = "eloscope-root";
    const settingsHost = document.createElement("div");
    settingsHost.id = "eloscope-settings-root";
    document.body.append(overlay, settingsHost);

    const settings = createDefaultSettings();
    settings.interfaceVisibility.profile = false;
    applyOverlayVisibility(settings, "/en/players/player");

    expect(overlay.hidden).toBe(true);
    expect(settingsHost.hidden).toBe(false);
  });
});
