import { describe, expect, it } from "vitest";

import { EloSnapshotStore, SNAPSHOT_KEY } from "../src/snapshots";

const player = { id: "player-1", nickname: "one", game: "cs2", elo: 2_100 };
const match = {
  id: "match-1",
  playerId: player.id,
  game: "cs2",
  mode: "5v5",
  status: "finished",
  finishedAt: "2026-07-22T00:00:00Z",
  result: "win" as const,
  roundsPlayed: 24,
  kills: 20,
  assists: 5,
  deaths: 14,
  damage: 2_000,
  eloBefore: 2_075,
  eloAfter: 2_100,
};

describe("EloSnapshotStore", () => {
  it("accumulates public current ELO without duplicating rapid identical snapshots", async () => {
    const store = new EloSnapshotStore();
    await store.recordPlayer(player, 1_000_000);
    await store.recordPlayer(player, 1_001_000);
    const saved = (await chrome.storage.local.get(SNAPSHOT_KEY))[SNAPSHOT_KEY] as { players: unknown[] };
    expect(saved.players).toHaveLength(1);
  });

  it("persists and restores only reliable match-specific ELO", async () => {
    const store = new EloSnapshotStore();
    await store.rememberMatchElos(player.id, [match], 2_000_000);
    const hydrated = await store.hydrateMatchElos(player.id, [
      { ...match, eloBefore: undefined, eloAfter: undefined },
    ]);
    expect(hydrated[0]?.eloBefore).toBe(2_075);
    expect(hydrated[0]?.eloAfter).toBe(2_100);
  });
});
