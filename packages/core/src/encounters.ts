import { canonicalMapId } from "./map-winrates.js";
import { eligibleMatches, toEpochMs } from "./matches.js";
import type { DataState, MatchResult, PlayerMatch } from "./types.js";

export const PLAYER_ENCOUNTER_WINDOW = 100 as const;
export const PLAYER_ENCOUNTER_RECENT_LIMIT = 5 as const;

export type PlayerEncounterKind = "teammate" | "opponent";

export type PlayerEncounterMatch = Readonly<{
  matchId: string;
  finishedAt: number;
  result: MatchResult;
  map?: string;
}>;

export type PlayerEncounterSummary = Readonly<{
  kind: PlayerEncounterKind;
  matches: number;
  wins: number;
  losses: number;
  /** Percentage points in the inclusive 0..100 range. */
  winRate: number;
  /** Newest first, capped by PLAYER_ENCOUNTER_RECENT_LIMIT. */
  recent: readonly PlayerEncounterMatch[];
}>;

export type PlayerEncountersUnavailableReason =
  | "invalid-player"
  | "same-player"
  | "viewer-history-not-ready"
  | "target-history-not-ready"
  | "viewer-history-empty"
  | "target-history-empty";

export type PlayerEncountersResult =
  | Readonly<{
      status: "ready";
      window: typeof PLAYER_ENCOUNTER_WINDOW;
      relations: readonly PlayerEncounterSummary[];
    }>
  | Readonly<{
      status: "unavailable";
      reason: PlayerEncountersUnavailableReason;
    }>;

type MutableSummary = {
  kind: PlayerEncounterKind;
  matches: number;
  wins: number;
  losses: number;
  recent: PlayerEncounterMatch[];
};

const normalizedIdentity = (value: string): string => value.trim();

/**
 * Selects a player's newest unique eligible rows. The identity check prevents
 * a contaminated cache entry from being attributed to the signed-in viewer or
 * another room player.
 */
const newestUniqueMatches = (
  playerId: string,
  matches: readonly PlayerMatch[],
): PlayerMatch[] => {
  const result: PlayerMatch[] = [];
  const seen = new Set<string>();

  for (const match of eligibleMatches(matches)) {
    if (match.playerId !== playerId || seen.has(match.id)) continue;
    seen.add(match.id);
    result.push(match);
    if (result.length === PLAYER_ENCOUNTER_WINDOW) break;
  }

  return result;
};

const readyRows = (
  playerId: string,
  history: DataState<readonly PlayerMatch[]>,
): PlayerMatch[] | undefined =>
  history.status === "ready" ? newestUniqueMatches(playerId, history.data) : undefined;

const encounterDetail = (match: PlayerMatch): PlayerEncounterMatch => {
  const map = match.map === undefined ? undefined : canonicalMapId(match.map);
  return {
    matchId: match.id,
    finishedAt: toEpochMs(match.finishedAt),
    result: match.result,
    ...(map ? { map } : {}),
  };
};

const completeSummary = (summary: MutableSummary): PlayerEncounterSummary => ({
  kind: summary.kind,
  matches: summary.matches,
  wins: summary.wins,
  losses: summary.losses,
  winRate: summary.matches > 0 ? summary.wins / summary.matches * 100 : 0,
  recent: summary.recent,
});

/**
 * Calculates verified meetings found in both players' newest 100 eligible
 * histories. Team equality classifies a teammate; different team ids classify
 * an opponent. Wins and losses are always from the viewer's perspective.
 *
 * A ready result with an empty relations array means that both usable histories
 * were available but contained no verifiable overlap. Loading, restricted,
 * errored and empty usable histories remain explicitly unavailable.
 */
export function buildPlayerEncounters(
  viewerIdInput: string,
  targetIdInput: string,
  viewerHistory: DataState<readonly PlayerMatch[]>,
  targetHistory: DataState<readonly PlayerMatch[]>,
): PlayerEncountersResult {
  const viewerId = normalizedIdentity(viewerIdInput);
  const targetId = normalizedIdentity(targetIdInput);
  if (!viewerId || !targetId) return { status: "unavailable", reason: "invalid-player" };
  if (viewerId === targetId) return { status: "unavailable", reason: "same-player" };

  const viewerRows = readyRows(viewerId, viewerHistory);
  if (!viewerRows) return { status: "unavailable", reason: "viewer-history-not-ready" };
  const targetRows = readyRows(targetId, targetHistory);
  if (!targetRows) return { status: "unavailable", reason: "target-history-not-ready" };
  if (viewerRows.length === 0) return { status: "unavailable", reason: "viewer-history-empty" };
  if (targetRows.length === 0) return { status: "unavailable", reason: "target-history-empty" };

  const targetByMatch = new Map(targetRows.map((match) => [match.id, match] as const));
  const summaries: Record<PlayerEncounterKind, MutableSummary> = {
    teammate: { kind: "teammate", matches: 0, wins: 0, losses: 0, recent: [] },
    opponent: { kind: "opponent", matches: 0, wins: 0, losses: 0, recent: [] },
  };

  for (const viewerMatch of viewerRows) {
    const targetMatch = targetByMatch.get(viewerMatch.id);
    if (!targetMatch) continue;
    // Core can also be called by consumers other than the guarded bridge
    // client, so keep the optional wire field defensive at runtime.
    const viewerTeamId = typeof viewerMatch.teamId === "string" ? viewerMatch.teamId.trim() : "";
    const targetTeamId = typeof targetMatch.teamId === "string" ? targetMatch.teamId.trim() : "";
    if (!viewerTeamId || !targetTeamId) continue;

    const sameTeam = viewerTeamId === targetTeamId;
    // A completed match cannot be a win for one teammate and a loss for the
    // other, nor can both opposing sides win or lose. Treat contradictory
    // upstream rows as unverified instead of manufacturing an encounter.
    if (
      (sameTeam && viewerMatch.result !== targetMatch.result)
      || (!sameTeam && viewerMatch.result === targetMatch.result)
    ) continue;

    const kind: PlayerEncounterKind = sameTeam ? "teammate" : "opponent";
    const summary = summaries[kind];
    summary.matches += 1;
    if (viewerMatch.result === "win") summary.wins += 1;
    else summary.losses += 1;
    if (summary.recent.length < PLAYER_ENCOUNTER_RECENT_LIMIT) {
      summary.recent.push(encounterDetail(viewerMatch));
    }
  }

  return {
    status: "ready",
    window: PLAYER_ENCOUNTER_WINDOW,
    relations: (["teammate", "opponent"] as const)
      .map((kind) => summaries[kind])
      .filter(({ matches }) => matches > 0)
      .map(completeSummary),
  };
}
