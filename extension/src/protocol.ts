import type { StatsWindow } from "@eloscope/core";

export const PROTOCOL_VERSION = 1 as const;
export const ISOLATED_SOURCE = "eloscope:isolated" as const;
export const MAIN_SOURCE = "eloscope:main" as const;

export type ReadOperation =
  | "viewer"
  | "player"
  | "recentMatches"
  | "playerMapStats"
  | "match"
  | "matchStats"
  | "vetoState";

export type ReadArguments = {
  viewer: Record<string, never>;
  player: { nickname: string };
  recentMatches: { playerId: string; limit: StatsWindow };
  playerMapStats: { playerId: string };
  match: { matchId: string };
  matchStats: { matchId: string };
  vetoState: { matchId: string };
};

export type BridgeRequest<K extends ReadOperation = ReadOperation> = {
  source: typeof ISOLATED_SOURCE;
  version: typeof PROTOCOL_VERSION;
  type: "read";
  id: string;
  operation: K;
  args: ReadArguments[K];
};

export type AnyBridgeRequest = {
  [K in ReadOperation]: BridgeRequest<K>;
}[ReadOperation];

export type BridgeResult =
  | { status: "ok"; data: unknown; sampledAt: number }
  | { status: "restricted"; reason: "logged-out" | "forbidden" | "rate-limited" }
  | { status: "error"; code: "invalid-request" | "network" | "upstream" | "upstream-shape" | "unsupported" };

export function isBridgeResult(value: unknown): value is BridgeResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Partial<BridgeResult>;
  if (result.status === "ok") {
    return Number.isFinite(result.sampledAt) && result.data !== undefined;
  }
  if (result.status === "restricted") {
    return result.reason === "logged-out" || result.reason === "forbidden" || result.reason === "rate-limited";
  }
  return result.status === "error" && [
    "invalid-request",
    "network",
    "upstream",
    "upstream-shape",
    "unsupported",
  ].includes(String(result.code));
}

export type BridgeResponse = {
  source: typeof MAIN_SOURCE;
  version: typeof PROTOCOL_VERSION;
  type: "response";
  id: string;
  result: BridgeResult;
};

export type RouteMessage = {
  source: typeof MAIN_SOURCE;
  version: typeof PROTOCOL_VERSION;
  type: "route";
  pathname: string;
};

export type MainMessage = BridgeResponse | RouteMessage;

export const STATS_WINDOWS = [5, 10, 20, 30, 50, 100] as const;

const REQUEST_ID = /^[a-f0-9]{24,64}$/;
const ENTITY_ID = /^[a-f0-9-]{20,64}$/i;
const NICKNAME = /^[\p{L}\p{N}_.-]{1,64}$/u;

export function isRequestId(value: unknown): value is string {
  return typeof value === "string" && REQUEST_ID.test(value);
}

export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && ENTITY_ID.test(value);
}

export function isNickname(value: unknown): value is string {
  return typeof value === "string" && NICKNAME.test(value);
}

export function isStatsWindow(value: unknown): value is StatsWindow {
  return typeof value === "number" && (STATS_WINDOWS as readonly number[]).includes(value);
}

export function createRequestId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
