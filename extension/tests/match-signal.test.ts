import { describe, expect, it, vi } from "vitest";

import pendingMatchCheckin from "../fixtures/api/pending-match-checkin.json";
import {
  isObservedMatchUrl,
  isValidMatchSignalMessage,
  matchIdFromMatchUrl,
} from "../src/match-signal-hook";
import { isPreMatchAcceptPhase, normalizePendingMatchSignal } from "../src/normalize";
import { MAIN_SOURCE, PROTOCOL_VERSION } from "../src/protocol";

describe("pending match accept preview", () => {
  it("recognizes pre-accept match API URLs", () => {
    expect(isObservedMatchUrl("https://www.faceit.com/api/match/v2/match/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(true);
    expect(matchIdFromMatchUrl("https://www.faceit.com/api/match/v2/match/1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"))
      .toBe("1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(isObservedMatchUrl("https://www.faceit.com/api/users/v1/sessions/me")).toBe(false);
  });

  it("accepts only closed matchSignal envelopes", () => {
    expect(isValidMatchSignalMessage({
      source: MAIN_SOURCE,
      version: PROTOCOL_VERSION,
      type: "matchSignal",
      preview: null,
      sampledAt: Date.now(),
    })).toBe(true);
    expect(isValidMatchSignalMessage({
      source: MAIN_SOURCE,
      version: PROTOCOL_VERSION,
      type: "matchSignal",
      preview: {
        matchId: "1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        phase: "CHECK_IN",
        regions: ["EU", "Frankfurt"],
        mapPool: ["mirage", "nuke"],
      },
      sampledAt: Date.now(),
    })).toBe(true);
    expect(isValidMatchSignalMessage({
      source: MAIN_SOURCE,
      version: PROTOCOL_VERSION,
      type: "matchSignal",
      preview: { matchId: "../sessions/me", phase: "CHECK_IN", regions: [], mapPool: [] },
      sampledAt: Date.now(),
    })).toBe(false);
  });

  it("extracts region, map pool and partial ELO from check-in payloads", () => {
    expect(isPreMatchAcceptPhase("CHECK_IN")).toBe(true);
    expect(isPreMatchAcceptPhase("finished")).toBe(false);

    expect(normalizePendingMatchSignal(pendingMatchCheckin)).toEqual({
      matchId: "1-bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
      phase: "CHECK_IN",
      regions: ["Frankfurt", "Stockholm", "EU"],
      mapPool: ["ancient", "anubis", "dust2", "inferno", "mirage", "nuke", "vertigo"],
      teams: [
        expect.objectContaining({
          id: "faction1",
          name: "team_alpha",
          averageElo: 2500,
          eloKnown: 2,
          eloTotal: 2,
          players: [
            expect.objectContaining({ nickname: "AlphaOne", elo: 2511 }),
            expect.objectContaining({ nickname: "AlphaTwo", elo: 2488 }),
          ],
        }),
        expect.objectContaining({
          id: "faction2",
          name: "team_bravo",
          averageElo: 2645,
          eloKnown: 1,
          eloTotal: 1,
        }),
      ],
    });
  });

  it("returns null when the upstream phase is no longer pre-accept", () => {
    const finished = structuredClone(pendingMatchCheckin) as { payload: Record<string, unknown> };
    finished.payload.state = "FINISHED";
    finished.payload.status = "FINISHED";
    expect(normalizePendingMatchSignal(finished)).toBeNull();
  });
});

describe("match signal hook", () => {
  it("posts sanitized matchSignal messages for observed fetch responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(pendingMatchCheckin), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    const postMessage = vi.spyOn(window, "postMessage");

    const { installMatchSignalHook } = await import("../src/match-signal-hook");
    installMatchSignalHook();

    await fetch("https://www.faceit.com/api/match/v2/match/1-bbbbbbbb-cccc-dddd-eeee-ffffffffffff");
    await new Promise((resolve) => setTimeout(resolve, 0));

    const messages = postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => (message as { type?: unknown }).type === "matchSignal");
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      source: MAIN_SOURCE,
      type: "matchSignal",
      preview: expect.objectContaining({
        phase: "CHECK_IN",
        mapPool: expect.arrayContaining(["mirage", "nuke"]),
      }),
    });
  });
});
