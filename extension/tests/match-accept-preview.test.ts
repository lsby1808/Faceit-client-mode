import { describe, expect, it } from "vitest";

import pendingMatchCheckin from "../fixtures/api/pending-match-checkin.json";
import type { PendingMatchPreview } from "@eloscope/core";
import { MatchAcceptPreviewRenderer } from "../src/match-accept-preview";
import { OVERLAY_STYLES } from "../src/styles";

function preview(): PendingMatchPreview {
  return {
    matchId: "1-bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
    phase: "CHECK_IN",
    regions: ["EU", "Frankfurt"],
    mapPool: ["mirage", "nuke"],
    teams: [
      {
        id: "left",
        name: "Alpha",
        averageElo: 2500,
        eloKnown: 2,
        eloTotal: 5,
        players: [
          { nickname: "One", elo: 2511 },
          { nickname: "Two", elo: 2488 },
        ],
      },
    ],
  };
}

describe("MatchAcceptPreviewRenderer", () => {
  it("renders region, map pool and partial team ELO", () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = OVERLAY_STYLES;
    const shell = document.createElement("div");
    shell.className = "es-shell";
    shadow.append(style, shell);
    document.body.append(host);

    const renderer = new MatchAcceptPreviewRenderer(shadow);
    expect(renderer.render(preview())).toBe(true);

    const card = shadow.querySelector(".es-match-accept-card");
    expect(card?.textContent).toContain("Frankfurt");
    expect(card?.textContent).toContain("Mirage");
    expect(card?.textContent).toContain("avg 2500");
    expect(card?.textContent).toContain("One · 2511");

    renderer.cleanup();
    expect(shadow.querySelector(".es-match-accept-card")).toBeNull();
    renderer.destroy();
    host.remove();
  });

  it("ignores finished upstream payloads at normalize time", async () => {
    const { normalizePendingMatchSignal } = await import("../src/normalize");
    const finished = structuredClone(pendingMatchCheckin) as { payload: Record<string, unknown> };
    finished.payload.state = "ONGOING";
    finished.payload.status = "ONGOING";
    expect(normalizePendingMatchSignal(finished)).toBeNull();
  });
});
