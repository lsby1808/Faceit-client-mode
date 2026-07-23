import {
  buildPlayerEncounters,
  errorState,
  loadingState,
  PLAYER_ENCOUNTER_RECENT_LIMIT,
  PLAYER_ENCOUNTER_WINDOW,
  readyState,
  restrictedState,
  type DataState,
  type PlayerMatch,
} from "../src/index.js";
import { describe, expect, it } from "vitest";

const DAY = 24 * 60 * 60 * 1_000;
const BASE_TIME = Date.parse("2026-07-23T12:00:00.000Z");

function row(
  playerId: string,
  id: string,
  index: number,
  overrides: Partial<PlayerMatch> = {},
): PlayerMatch {
  return {
    id,
    playerId,
    teamId: "faction1",
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: BASE_TIME - index * DAY,
    result: "win",
    map: "de_dust2",
    roundsPlayed: 24,
    kills: 18,
    assists: 5,
    deaths: 14,
    damage: 1_920,
    ...overrides,
  };
}

const ready = (rows: readonly PlayerMatch[]): DataState<readonly PlayerMatch[]> =>
  readyState(rows);

describe("buildPlayerEncounters", () => {
  it("separates teammate and opponent meetings and uses the viewer result for W/L", () => {
    const viewer = [
      row("viewer", "teammate-win", 3, { teamId: "a", result: "win", map: "de_ancient" }),
      row("viewer", "opponent-win-new", 0, { teamId: "a", result: "win", map: "de_mirage" }),
      row("viewer", "teammate-loss", 2, { teamId: "a", result: "loss", map: "de_nuke" }),
      row("viewer", "opponent-win-old", 1, { teamId: "a", result: "win", map: "de_dust2" }),
    ];
    const target = [
      row("target", "teammate-win", 3, { teamId: "a", result: "win" }),
      // Deliberately make the target results unsuitable as the W/L source.
      row("target", "opponent-win-new", 0, { teamId: "b", result: "loss" }),
      row("target", "teammate-loss", 2, { teamId: "a", result: "loss" }),
      row("target", "opponent-win-old", 1, { teamId: "b", result: "loss" }),
    ];

    expect(buildPlayerEncounters("viewer", "target", ready(viewer), ready(target))).toEqual({
      status: "ready",
      window: 100,
      relations: [
        {
          kind: "teammate",
          matches: 2,
          wins: 1,
          losses: 1,
          winRate: 50,
          recent: [
            {
              matchId: "teammate-loss",
              finishedAt: BASE_TIME - 2 * DAY,
              result: "loss",
              map: "nuke",
            },
            {
              matchId: "teammate-win",
              finishedAt: BASE_TIME - 3 * DAY,
              result: "win",
              map: "ancient",
            },
          ],
        },
        {
          kind: "opponent",
          matches: 2,
          wins: 2,
          losses: 0,
          winRate: 100,
          recent: [
            {
              matchId: "opponent-win-new",
              finishedAt: BASE_TIME,
              result: "win",
              map: "mirage",
            },
            {
              matchId: "opponent-win-old",
              finishedAt: BASE_TIME - DAY,
              result: "win",
              map: "dust2",
            },
          ],
        },
      ],
    });
  });

  it("deduplicates before applying the newest-100 window and keeps at most five details", () => {
    const viewer = Array.from({ length: PLAYER_ENCOUNTER_WINDOW + 1 }, (_, index) =>
      row("viewer", `match-${index}`, index));
    const target = Array.from({ length: PLAYER_ENCOUNTER_WINDOW + 1 }, (_, index) =>
      row("target", `match-${index}`, index));

    // The duplicate is deliberately out of transport order and must neither be
    // counted twice nor push the 100th unique match out of the window.
    viewer.unshift({ ...viewer[0]! });
    target.push({ ...target[0]! });

    const result = buildPlayerEncounters("viewer", "target", ready(viewer.reverse()), ready(target.reverse()));
    expect(result).toMatchObject({
      status: "ready",
      window: PLAYER_ENCOUNTER_WINDOW,
      relations: [{
        kind: "teammate",
        matches: PLAYER_ENCOUNTER_WINDOW,
        wins: PLAYER_ENCOUNTER_WINDOW,
        losses: 0,
        winRate: 100,
      }],
    });
    if (result.status !== "ready") throw new Error("expected ready encounter data");
    expect(result.relations[0]?.recent).toHaveLength(PLAYER_ENCOUNTER_RECENT_LIMIT);
    expect(result.relations[0]?.recent.map(({ matchId }) => matchId)).toEqual([
      "match-0",
      "match-1",
      "match-2",
      "match-3",
      "match-4",
    ]);
    expect(result.relations[0]?.recent.some(({ matchId }) => matchId === "match-100")).toBe(false);
  });

  it.each([
    [
      "viewer loading",
      loadingState<readonly PlayerMatch[]>(),
      ready([row("target", "shared", 0)]),
      "viewer-history-not-ready",
    ],
    [
      "viewer error",
      errorState<readonly PlayerMatch[]>("network", "offline", true),
      ready([row("target", "shared", 0)]),
      "viewer-history-not-ready",
    ],
    [
      "target restricted",
      ready([row("viewer", "shared", 0)]),
      restrictedState<readonly PlayerMatch[]>("forbidden"),
      "target-history-not-ready",
    ],
    [
      "viewer empty",
      ready([]),
      ready([row("target", "shared", 0)]),
      "viewer-history-empty",
    ],
    [
      "target has no eligible rows",
      ready([row("viewer", "shared", 0)]),
      ready([row("target", "shared", 0, { status: "ongoing" })]),
      "target-history-empty",
    ],
  ] as const)("returns unavailable when %s", (_label, viewerHistory, targetHistory, reason) => {
    expect(buildPlayerEncounters("viewer", "target", viewerHistory, targetHistory)).toEqual({
      status: "unavailable",
      reason,
    });
  });

  it("requires exact row identity and team ids instead of inventing a relation", () => {
    const viewer = [
      row("viewer", "viewer-only", 3),
      row("different-viewer", "wrong-identity", 0),
      row("viewer", "missing-viewer-team", 1, { teamId: undefined }),
      row("viewer", "missing-target-team", 2),
    ];
    const target = [
      row("target", "target-only", 3),
      row("target", "wrong-identity", 0),
      row("target", "missing-viewer-team", 1),
      row("target", "missing-target-team", 2, { teamId: undefined }),
    ];

    expect(buildPlayerEncounters("viewer", "target", ready(viewer), ready(target))).toEqual({
      status: "ready",
      window: 100,
      relations: [],
    });
  });

  it("fails closed for a malformed runtime team id", () => {
    const malformed = row("viewer", "malformed-team", 0, {
      teamId: 42 as unknown as string,
    });

    expect(() => buildPlayerEncounters(
      "viewer",
      "target",
      ready([malformed]),
      ready([row("target", "malformed-team", 0)]),
    )).not.toThrow();
    expect(buildPlayerEncounters(
      "viewer",
      "target",
      ready([malformed]),
      ready([row("target", "malformed-team", 0)]),
    )).toEqual({
      status: "ready",
      window: 100,
      relations: [],
    });
  });

  it("rejects contradictory results for teammates and opponents", () => {
    const viewer = [
      row("viewer", "teammate-conflict", 0, { teamId: "a", result: "win" }),
      row("viewer", "opponent-conflict", 1, { teamId: "a", result: "loss" }),
    ];
    const target = [
      row("target", "teammate-conflict", 0, { teamId: "a", result: "loss" }),
      row("target", "opponent-conflict", 1, { teamId: "b", result: "loss" }),
    ];

    expect(buildPlayerEncounters("viewer", "target", ready(viewer), ready(target))).toEqual({
      status: "ready",
      window: 100,
      relations: [],
    });
  });

  it("requires a shared match to be inside both independent newest-100 windows", () => {
    const viewerRecent = Array.from({ length: 100 }, (_, index) =>
      row("viewer", `viewer-recent-${index}`, index));
    const targetRecent = Array.from({ length: 100 }, (_, index) =>
      row("target", `target-recent-${index}`, index));

    expect(buildPlayerEncounters(
      "viewer",
      "target",
      ready([row("viewer", "shared-target-too-old", 10), ...viewerRecent]),
      ready([...targetRecent, row("target", "shared-target-too-old", 101)]),
    )).toMatchObject({ status: "ready", relations: [] });

    expect(buildPlayerEncounters(
      "viewer",
      "target",
      ready([...viewerRecent, row("viewer", "shared-viewer-too-old", 101)]),
      ready([row("target", "shared-viewer-too-old", 10), ...targetRecent]),
    )).toMatchObject({ status: "ready", relations: [] });
  });

  it("ignores ineligible shared rows without letting them consume the window", () => {
    const viewer = [
      row("viewer", "ongoing", -2, { status: "ongoing" }),
      row("viewer", "wrong-game", -1, { game: "csgo" }),
      row("viewer", "valid", 0, { result: "loss" }),
    ];
    const target = [
      row("target", "ongoing", -2, { status: "ongoing" }),
      row("target", "wrong-game", -1, { game: "csgo" }),
      row("target", "valid", 0, { result: "loss" }),
    ];

    expect(buildPlayerEncounters("viewer", "target", ready(viewer), ready(target))).toMatchObject({
      status: "ready",
      relations: [{
        kind: "teammate",
        matches: 1,
        wins: 0,
        losses: 1,
        recent: [{ matchId: "valid" }],
      }],
    });
  });

  it("keeps a verified no-overlap sample ready without manufacturing zero badges", () => {
    expect(buildPlayerEncounters(
      "viewer",
      "target",
      ready([row("viewer", "viewer-match", 0)]),
      ready([row("target", "target-match", 0)]),
    )).toEqual({
      status: "ready",
      window: 100,
      relations: [],
    });
  });

  it("rejects finite timestamps outside the JavaScript Date range", () => {
    expect(buildPlayerEncounters(
      "viewer",
      "target",
      ready([row("viewer", "invalid-date", 0, { finishedAt: 9_000_000_000_000_000 })]),
      ready([row("target", "invalid-date", 0, { finishedAt: 9_000_000_000_000_000 })]),
    )).toEqual({
      status: "unavailable",
      reason: "viewer-history-empty",
    });
  });

  it("rejects invalid or self comparisons", () => {
    const history = ready([row("viewer", "match", 0)]);
    expect(buildPlayerEncounters("", "target", history, history)).toEqual({
      status: "unavailable",
      reason: "invalid-player",
    });
    expect(buildPlayerEncounters("viewer", "viewer", history, history)).toEqual({
      status: "unavailable",
      reason: "same-player",
    });
  });
});
