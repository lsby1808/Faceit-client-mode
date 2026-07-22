import { isCompletedCs2FiveVFive } from "./matches.js";
import type { PlayerMatch } from "./types.js";

export interface FcrInput {
  playerId: string;
  kills: number;
  assists: number;
  damage: number;
  survivedRounds: number;
  firstKills: number;
}

export interface FcrResult {
  playerId: string;
  /** Weighted score before the final team normalization. */
  rawScore: number;
  /** Integer tenths are the source of truth so displayed team values total 100.0%. */
  scoreTenths: number;
  score: number;
}

export const FCR_WEIGHTS = Object.freeze({
  kills: 0.35,
  assists: 0.1,
  damage: 0.3,
  survival: 0.1,
  firstKills: 0.15,
});

const value = (candidate: number): number => (Number.isFinite(candidate) && candidate > 0 ? candidate : 0);

const allocateTenths = (values: readonly number[]): number[] => {
  if (!values.length) return [];
  const floors = values.map((candidate) => Math.floor(candidate));
  let remaining = 1_000 - floors.reduce((sum, candidate) => sum + candidate, 0);
  const order = values
    .map((candidate, index) => ({ index, remainder: candidate - Math.floor(candidate) }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let position = 0; remaining > 0; position += 1) {
    const entry = order[position % order.length];
    if (!entry) break;
    floors[entry.index] = (floors[entry.index] ?? 0) + 1;
    remaining -= 1;
  }

  return floors;
};

/**
 * Calculates FCR for one team. Each category is first expressed as that
 * player's share of the team total, then combined using 35/10/30/10/15.
 * The final largest-remainder pass makes the displayed tenths add to 1000.
 */
export const calculateTeamFcr = (players: readonly FcrInput[]): FcrResult[] => {
  if (!players.length) return [];

  const totals = players.reduce(
    (sum, player) => ({
      kills: sum.kills + value(player.kills),
      assists: sum.assists + value(player.assists),
      damage: sum.damage + value(player.damage),
      survival: sum.survival + value(player.survivedRounds),
      firstKills: sum.firstKills + value(player.firstKills),
    }),
    { kills: 0, assists: 0, damage: 0, survival: 0, firstKills: 0 },
  );

  const share = (candidate: number, total: number): number => (total > 0 ? value(candidate) / total : 0);
  const rawScores = players.map(
    (player) =>
      share(player.kills, totals.kills) * FCR_WEIGHTS.kills +
      share(player.assists, totals.assists) * FCR_WEIGHTS.assists +
      share(player.damage, totals.damage) * FCR_WEIGHTS.damage +
      share(player.survivedRounds, totals.survival) * FCR_WEIGHTS.survival +
      share(player.firstKills, totals.firstKills) * FCR_WEIGHTS.firstKills,
  );
  const rawTotal = rawScores.reduce((sum, candidate) => sum + candidate, 0);
  const normalizedTenths =
    rawTotal > 0
      ? rawScores.map((candidate) => (candidate / rawTotal) * 1_000)
      : players.map(() => 1_000 / players.length);
  const allocated = allocateTenths(normalizedTenths);

  return players.map((player, index) => {
    const scoreTenths = allocated[index] ?? 0;
    return {
      playerId: player.playerId,
      rawScore: rawScores[index] ?? 0,
      scoreTenths,
      score: scoreTenths / 10,
    };
  });
};

/**
 * Guarded public facade for match-derived FCR. The representative row carries
 * the match eligibility fields and prevents cancelled/2v2/incomplete data from
 * entering a completed-CS2-5v5 calculation.
 */
export const calculateCompletedMatchTeamFcr = (
  representativeMatch: PlayerMatch,
  players: readonly FcrInput[],
): FcrResult[] =>
  isCompletedCs2FiveVFive(representativeMatch) ? calculateTeamFcr(players) : [];

export const formatFcr = (result: Pick<FcrResult, "scoreTenths">): string =>
  `${(result.scoreTenths / 10).toFixed(1)}%`;
