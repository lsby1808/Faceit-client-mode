import type { PlayerMatch } from "../src/index.js";

export const makeMatch = (overrides: Partial<PlayerMatch> = {}): PlayerMatch => ({
  id: overrides.id ?? crypto.randomUUID(),
  playerId: overrides.playerId ?? "player-1",
  game: overrides.game ?? "cs2",
  mode: overrides.mode ?? "5v5",
  status: overrides.status ?? "finished",
  finishedAt: overrides.finishedAt ?? "2026-07-20T12:00:00.000Z",
  result: overrides.result ?? "win",
  map: overrides.map ?? "de_mirage",
  roundsPlayed: overrides.roundsPlayed ?? 20,
  kills: overrides.kills ?? 14,
  assists: overrides.assists ?? 5,
  deaths: overrides.deaths ?? 14,
  damage: overrides.damage ?? 1_500,
  headshots: overrides.headshots ?? 7,
  firstKills: overrides.firstKills ?? 2,
  survivedRounds: overrides.survivedRounds ?? 6,
  ...(overrides.teamId === undefined ? {} : { teamId: overrides.teamId }),
  ...(overrides.eloBefore === undefined ? {} : { eloBefore: overrides.eloBefore }),
  ...(overrides.eloAfter === undefined ? {} : { eloAfter: overrides.eloAfter }),
  ...(overrides.teamAverageElo === undefined ? {} : { teamAverageElo: overrides.teamAverageElo }),
  ...(overrides.opponentAverageElo === undefined
    ? {}
    : { opponentAverageElo: overrides.opponentAverageElo }),
  ...(overrides.fcr === undefined ? {} : { fcr: overrides.fcr }),
});
