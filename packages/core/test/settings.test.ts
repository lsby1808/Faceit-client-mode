import { describe, expect, it } from "vitest";

import {
  createDefaultAutomationSettings,
  DEFAULT_AUTOMATION_SETTINGS,
  parseAutomationSettings,
} from "../src/index.js";

describe("automation settings", () => {
  it("keeps every potentially mutating automation off by default", () => {
    expect(DEFAULT_AUTOMATION_SETTINGS).toEqual({
      partyAccept: false,
      readyUp: false,
      mapVeto: { enabled: false, banOrder: [], pickOrder: [] },
      serverVeto: { enabled: false, order: [] },
      autoConnect: false,
      copyServerData: false,
      positions: {},
    });
    expect(createDefaultAutomationSettings(["de_mirage"]).positions.de_mirage).toEqual({
      enabled: false,
      message: "",
      mode: "confirm",
    });
  });

  it("deep-freezes the exported default singleton", () => {
    expect(Object.isFrozen(DEFAULT_AUTOMATION_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AUTOMATION_SETTINGS.mapVeto)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AUTOMATION_SETTINGS.mapVeto.banOrder)).toBe(true);
    expect(Object.isFrozen(DEFAULT_AUTOMATION_SETTINGS.positions)).toBe(true);
  });

  it("parses persisted input fail-closed and removes duplicates/control characters", () => {
    const parsed = parseAutomationSettings(
      {
        partyAccept: "true",
        readyUp: true,
        autoConnect: 1,
        copyServerData: true,
        mapVeto: {
          enabled: true,
          banOrder: ["de_mirage", "de_mirage", 1, "de_nuke"],
          pickOrder: null,
        },
        serverVeto: { enabled: "yes", order: ["Warsaw", "Warsaw", "London"] },
        positions: {
          de_mirage: { enabled: true, message: "Window\u0000 smoke", mode: "auto" },
          de_nuke: { enabled: "yes", message: 42, mode: "dangerous" },
        },
      },
      ["de_ancient"],
    );

    expect(parsed.partyAccept).toBe(false);
    expect(parsed.readyUp).toBe(true);
    expect(parsed.autoConnect).toBe(false);
    expect(parsed.copyServerData).toBe(true);
    expect(parsed.mapVeto).toEqual({ enabled: true, banOrder: ["de_mirage", "de_nuke"], pickOrder: [] });
    expect(parsed.serverVeto).toEqual({ enabled: false, order: ["Warsaw", "London"] });
    expect(parsed.positions.de_mirage).toEqual({ enabled: true, message: "Window smoke", mode: "auto" });
    expect(parsed.positions.de_nuke).toEqual({ enabled: false, message: "", mode: "confirm" });
    expect(parsed.positions.de_ancient).toEqual({ enabled: false, message: "", mode: "confirm" });
  });

  it("does not trust non-object storage values", () => {
    expect(parseAutomationSettings("all-on")).toEqual(createDefaultAutomationSettings());
  });
});
