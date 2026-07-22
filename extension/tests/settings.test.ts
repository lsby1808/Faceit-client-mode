import { describe, expect, it } from "vitest";
import { createDefaultSettings, parseSettings } from "../src/settings";

describe("extension settings", () => {
  it("keeps every automation off by default", () => {
    const settings = createDefaultSettings();
    expect(settings.statsWindow).toBe(30);
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.automations).toMatchObject({
      partyAccept: false,
      readyUp: false,
      mapVeto: { enabled: false },
      serverVeto: { enabled: false },
      autoConnect: false,
      copyServerData: false
    });
  });

  it("fails closed for malformed values", () => {
    const settings = parseSettings({
      statsWindow: 17,
      showExtendedTier: "yes",
      automations: { partyAccept: "yes", readyUp: 1, autoConnect: true }
    });
    expect(settings.statsWindow).toBe(30);
    expect(settings.showExtendedTier).toBe(false);
    expect(settings.automations.partyAccept).toBe(false);
    expect(settings.automations.readyUp).toBe(false);
    expect(settings.automations.autoConnect).toBe(true);
  });
});
