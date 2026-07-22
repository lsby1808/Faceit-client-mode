import { createDefaultAutomationSettings } from "@eloscope/core";
import { describe, expect, it } from "vitest";
import { VisibleDomAutomationRunner } from "../src/automations";
import { BUILT_IN_CAPABILITIES } from "../src/compatibility";
import { loadFixture } from "./fixture";

describe("DOM contract fixtures", () => {
  it.each(["logged-out", "profile", "history", "active-room", "veto", "server-ready", "finished-room"])(
    "loads %s without an accidental click",
    (name) => {
      loadFixture(name);
      const route = name.includes("room") || name === "veto" || name === "server-ready"
        ? ({ kind: "match", matchId: "11111111-2222-3333-4444-555555555555" } as const)
        : ({ kind: "other" } as const);
      const result = new VisibleDomAutomationRunner().run(document, route, createDefaultAutomationSettings(), { ...BUILT_IN_CAPABILITIES });
      expect(result.clicked).toBe(false);
    }
  );
});
