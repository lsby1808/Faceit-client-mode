import { describe, expect, it } from "vitest";

import { calculateCurrentMatchStreak } from "../src/index.js";
import { makeMatch } from "./fixtures.js";

const at = (day: number): string => `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`;

describe("calculateCurrentMatchStreak", () => {
  it("fails closed when there are no eligible completed CS2 5v5 matches", () => {
    expect(calculateCurrentMatchStreak([])).toEqual({
      status: "unknown",
      reason: "no-eligible-matches",
    });
    expect(
      calculateCurrentMatchStreak([
        makeMatch({ status: "ongoing" }),
        makeMatch({ game: "csgo" }),
        makeMatch({ mode: "2v2" }),
      ]),
    ).toEqual({
      status: "unknown",
      reason: "no-eligible-matches",
    });
  });

  it("counts only the uninterrupted series from the newest result", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "old-win", finishedAt: at(16), result: "win" }),
      makeMatch({ id: "first-loss", finishedAt: at(17), result: "loss" }),
      makeMatch({ id: "new-win-2", finishedAt: at(19), result: "win" }),
      makeMatch({ id: "new-win-1", finishedAt: at(20), result: "win" }),
    ]);

    expect(result).toEqual({
      status: "known",
      result: "win",
      count: 2,
    });
  });

  it("reports a current loss streak and sorts unsorted input newest-first", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "newest", finishedAt: at(22), result: "loss" }),
      makeMatch({ id: "old-win", finishedAt: at(19), result: "win" }),
      makeMatch({ id: "middle", finishedAt: at(21), result: "loss" }),
      makeMatch({ id: "older-loss", finishedAt: at(20), result: "loss" }),
    ]);

    expect(result).toEqual({
      status: "known",
      result: "loss",
      count: 3,
    });
  });

  it("ignores ineligible rows without breaking an otherwise continuous series", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "new-win", finishedAt: at(22), result: "win" }),
      makeMatch({ id: "ongoing-loss", finishedAt: at(21), result: "loss", status: "ongoing" }),
      makeMatch({ id: "older-win", finishedAt: at(20), result: "win" }),
      makeMatch({ id: "old-loss", finishedAt: at(19), result: "loss" }),
    ]);

    expect(result).toEqual({
      status: "known",
      result: "win",
      count: 2,
    });
  });

  it("does not let duplicate match rows inflate the streak", () => {
    const duplicate = makeMatch({
      id: "same-match",
      finishedAt: at(22),
      result: "win",
    });
    const result = calculateCurrentMatchStreak([
      duplicate,
      { ...duplicate },
      makeMatch({ id: "older-win", finishedAt: at(21), result: "win" }),
      makeMatch({ id: "old-loss", finishedAt: at(20), result: "loss" }),
    ]);

    expect(result).toEqual({
      status: "known",
      result: "win",
      count: 2,
    });
  });

  it("fails closed when duplicate ids disagree about the result or time", () => {
    const match = makeMatch({
      id: "conflicted",
      finishedAt: at(22),
      result: "win",
    });

    expect(calculateCurrentMatchStreak([
      match,
      { ...match, result: "loss" },
    ])).toEqual({
      status: "unknown",
      reason: "conflicting-duplicates",
    });
    expect(calculateCurrentMatchStreak([
      match,
      { ...match, finishedAt: at(21) },
    ])).toEqual({
      status: "unknown",
      reason: "conflicting-duplicates",
    });
  });

  it("marks a full uninterrupted bounded sample as a lower bound", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "newest", finishedAt: at(22), result: "win" }),
      makeMatch({ id: "older", finishedAt: at(21), result: "win" }),
    ], { sampleLimit: 2 });

    expect(result).toEqual({
      status: "known",
      result: "win",
      count: 2,
      isLowerBound: true,
    });
  });

  it("keeps the count exact when an opposite result terminates a full sample", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "newest", finishedAt: at(22), result: "loss" }),
      makeMatch({ id: "older", finishedAt: at(21), result: "win" }),
    ], { sampleLimit: 2 });

    expect(result).toEqual({
      status: "known",
      result: "loss",
      count: 1,
    });
  });

  it("returns one when the newest eligible match immediately differs from the previous one", () => {
    const result = calculateCurrentMatchStreak([
      makeMatch({ id: "previous", finishedAt: at(21), result: "win" }),
      makeMatch({ id: "newest", finishedAt: at(22), result: "loss" }),
    ]);

    expect(result).toEqual({
      status: "known",
      result: "loss",
      count: 1,
    });
  });
});
