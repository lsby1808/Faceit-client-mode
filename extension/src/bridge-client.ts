import type { DataState, FaceitReadAdapter, MatchContext, MatchStats, Player, PlayerMapStats, PlayerMatch, StatsWindow, VetoState, Viewer } from "@eloscope/core";
import {
  ISOLATED_SOURCE,
  MAIN_SOURCE,
  PROTOCOL_VERSION,
  createRequestId,
  isBridgeResult,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeResult,
  type MainMessage,
  type ReadArguments,
  type ReadOperation
} from "./protocol";

type Pending = {
  resolve: (result: BridgeResult) => void;
  timer: number;
  operation: ReadOperation;
};

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 4_096;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function isPlayer(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isText(value.id) && isText(value.nickname) && value.game === "cs2" &&
    (value.elo === undefined || isFiniteNumber(value.elo)) &&
    (value.officialLevel === undefined || isFiniteNumber(value.officialLevel));
}

function isPlayerMatch(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isText(value.id) && isText(value.playerId) && isText(value.game) && isText(value.mode) &&
    isText(value.status) && (value.result === "win" || value.result === "loss") &&
    (isText(value.finishedAt) || isFiniteNumber(value.finishedAt)) &&
    [value.roundsPlayed, value.kills, value.assists, value.deaths, value.damage].every(isFiniteNumber);
}

function isMapStats(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.map)) return false;
  return [value.matches, value.wins, value.kills, value.assists, value.deaths, value.roundsPlayed, value.damage]
    .every(isFiniteNumber);
}

function isMatch(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.id) || value.game !== "cs2" || !isText(value.status)) return false;
  if (!Array.isArray(value.mapPool) || value.mapPool.length > 32 || !value.mapPool.every(isText) || !Array.isArray(value.teams)) return false;
  return value.teams.length >= 2 && value.teams.length <= 16 && value.teams.every((team) =>
    isRecord(team) && isText(team.id) && Array.isArray(team.players) &&
      team.players.length > 0 && team.players.length <= 32 && team.players.every(isPlayer));
}

function isMatchStats(value: unknown): boolean {
  if (!isRecord(value) || !isText(value.matchId) || !isFiniteNumber(value.roundsPlayed) || !Array.isArray(value.players)) return false;
  return value.roundsPlayed > 0 && value.players.length > 0 && value.players.length <= 64 && value.players.every((player) =>
    isRecord(player) && isText(player.playerId) && isText(player.teamId) &&
      [player.kills, player.assists, player.deaths, player.damage, player.roundsPlayed].every(isFiniteNumber));
}

function isVeto(value: unknown): boolean {
  return isRecord(value) && isText(value.matchId) && typeof value.active === "boolean" &&
    typeof value.viewerTurn === "boolean" && typeof value.viewerIsCaptain === "boolean" &&
    Array.isArray(value.availableMaps) && value.availableMaps.every(isText) &&
    Array.isArray(value.availableServers) && value.availableServers.every(isText) && Array.isArray(value.history);
}

function isDataForOperation(operation: ReadOperation, value: unknown): boolean {
  switch (operation) {
    case "viewer":
      return isRecord(value) && isText(value.id) && isText(value.nickname);
    case "player":
      return isPlayer(value);
    case "recentMatches":
      return Array.isArray(value) && value.length <= 100 && value.every(isPlayerMatch);
    case "playerMapStats":
      return Array.isArray(value) && value.length <= 64 && value.every(isMapStats);
    case "match":
      return isMatch(value);
    case "matchStats":
      return isMatchStats(value);
    case "vetoState":
      return isVeto(value);
  }
}

function asDataState<T>(result: BridgeResult): DataState<T> {
  if (result.status === "ok") return { status: "ready", data: result.data as T, fetchedAt: result.sampledAt };
  if (result.status === "restricted") return { status: "restricted", reason: result.reason };
  return {
    status: "error",
    error: { code: result.code, message: "FACEIT read failed", retryable: result.code === "network" }
  };
}

export class FaceitBridgeAdapter implements FaceitReadAdapter {
  readonly #pending = new Map<string, Pending>();
  readonly #origin: string;

  constructor(origin = "https://www.faceit.com") {
    this.#origin = origin;
    window.addEventListener("message", this.#onMessage);
  }

  destroy(): void {
    window.removeEventListener("message", this.#onMessage);
    for (const pending of this.#pending.values()) {
      window.clearTimeout(pending.timer);
      pending.resolve({ status: "error", code: "network" });
    }
    this.#pending.clear();
  }

  readonly #onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== this.#origin) return;
    const message = event.data as Partial<MainMessage>;
    if (
      message?.source !== MAIN_SOURCE ||
      message.version !== PROTOCOL_VERSION ||
      message.type !== "response" ||
      typeof (message as Partial<BridgeResponse>).id !== "string"
    ) {
      return;
    }

    const response = message as BridgeResponse;
    const pending = this.#pending.get(response.id);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.#pending.delete(response.id);
    if (!isBridgeResult(response.result)) {
      pending.resolve({ status: "error", code: "upstream-shape" });
      return;
    }
    if (
      response.result.status === "ok" &&
      (!isDataForOperation(pending.operation, response.result.data) ||
        Math.abs(Date.now() - response.result.sampledAt) > 5 * 60_000)
    ) {
      pending.resolve({ status: "error", code: "upstream-shape" });
      return;
    }
    pending.resolve(response.result);
  };

  async #read<K extends ReadOperation>(operation: K, args: ReadArguments[K]): Promise<BridgeResult> {
    const id = createRequestId();
    const request: BridgeRequest<K> = {
      source: ISOLATED_SOURCE,
      version: PROTOCOL_VERSION,
      type: "read",
      id,
      operation,
      args
    };

    const result = new Promise<BridgeResult>((resolve) => {
      const timer = window.setTimeout(() => {
        this.#pending.delete(id);
        resolve({ status: "error", code: "network" });
      }, 12_000);
      this.#pending.set(id, { resolve, timer, operation });
    });
    window.postMessage(request, this.#origin);
    return result;
  }

  async getViewer(): Promise<DataState<Viewer>> {
    return asDataState(await this.#read("viewer", {}));
  }

  async getPlayer(nickname: string): Promise<DataState<Player>> {
    return asDataState(await this.#read("player", { nickname }));
  }

  async getRecentMatches(playerId: string, limit: StatsWindow): Promise<DataState<PlayerMatch[]>> {
    return asDataState(await this.#read("recentMatches", { playerId, limit }));
  }

  async getPlayerMapStats(playerId: string): Promise<DataState<PlayerMapStats[]>> {
    return asDataState(await this.#read("playerMapStats", { playerId }));
  }

  async getMatch(matchId: string): Promise<DataState<MatchContext>> {
    return asDataState(await this.#read("match", { matchId }));
  }

  async getMatchStats(matchId: string): Promise<DataState<MatchStats>> {
    return asDataState(await this.#read("matchStats", { matchId }));
  }

  async getVetoState(matchId: string): Promise<DataState<VetoState>> {
    return asDataState(await this.#read("vetoState", { matchId }));
  }
}
