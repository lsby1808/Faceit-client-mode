import {
  ISOLATED_SOURCE,
  MAIN_SOURCE,
  PROTOCOL_VERSION,
  isEntityId,
  isNickname,
  isRequestId,
  isStatsWindow,
  type AnyBridgeRequest,
  type BridgeResponse,
  type BridgeResult,
  type ReadOperation,
  type RouteMessage
} from "./protocol";
import { normalizeBridgeData } from "./normalize";

const FACEIT_PAGE_ORIGIN = "https://www.faceit.com";
const FACEIT_API_ORIGIN = "https://api.faceit.com";
const MAX_DEPTH = 9;
const MAX_ARRAY_ITEMS = 250;
const MAX_OBJECT_KEYS = 96;
const MAX_STRING_LENGTH = 4_096;
const BLOCKED_KEY = /(token|authorization|cookie|secret|session|password|jwt|credential)/i;
const MAX_CONCURRENT_READS = 4;
const MAX_READS_PER_MINUTE = 120;
const recentReads: number[] = [];
let activeReads = 0;

type JsonPrimitive = string | number | boolean | null;
export type SafeJson = JsonPrimitive | SafeJson[] | { [key: string]: SafeJson };

function safeString(value: string): string {
  return value.length <= MAX_STRING_LENGTH ? value : value.slice(0, MAX_STRING_LENGTH);
}

/**
 * Creates a size-bounded plain JSON value and removes anything that could carry
 * credentials. The page-world bridge never sends raw Response objects or errors.
 */
export function sanitizeForBridge(value: unknown, depth = 0): SafeJson | undefined {
  if (depth > MAX_DEPTH) return undefined;
  if (value === null) return null;
  if (typeof value === "string") return safeString(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  if (Array.isArray(value)) {
    const result: SafeJson[] = [];
    for (const item of value.slice(0, MAX_ARRAY_ITEMS)) {
      const safe = sanitizeForBridge(item, depth + 1);
      if (safe !== undefined) result.push(safe);
    }
    return result;
  }

  if (typeof value !== "object") return undefined;
  const result: Record<string, SafeJson> = {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  for (const [key, item] of entries) {
    if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(key) || BLOCKED_KEY.test(key)) continue;
    const safe = sanitizeForBridge(item, depth + 1);
    if (safe !== undefined) result[key] = safe;
  }
  return result;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperation(value: unknown): value is ReadOperation {
  return ["viewer", "player", "recentMatches", "playerMapStats", "match", "matchStats", "vetoState"].includes(
    String(value)
  );
}

export function isValidBridgeRequest(value: unknown): value is AnyBridgeRequest {
  if (!isObject(value)) return false;
  if (
    value.source !== ISOLATED_SOURCE ||
    value.version !== PROTOCOL_VERSION ||
    value.type !== "read" ||
    !isRequestId(value.id) ||
    !isOperation(value.operation) ||
    !isObject(value.args)
  ) {
    return false;
  }

  switch (value.operation) {
    case "viewer":
      return Object.keys(value.args).length === 0;
    case "player":
      return isNickname(value.args.nickname) && Object.keys(value.args).length === 1;
    case "recentMatches":
      return (
        isEntityId(value.args.playerId) &&
        isStatsWindow(value.args.limit) &&
        Object.keys(value.args).length === 2
      );
    case "playerMapStats":
      return isEntityId(value.args.playerId) && Object.keys(value.args).length === 1;
    case "match":
    case "matchStats":
    case "vetoState":
      return isEntityId(value.args.matchId) && Object.keys(value.args).length === 1;
  }
}

function endpointFor(request: AnyBridgeRequest): URL | null {
  switch (request.operation) {
    case "viewer":
      return new URL("/users/v1/sessions/me", FACEIT_API_ORIGIN);
    case "player":
      return new URL(`/users/v1/nicknames/${encodeURIComponent(request.args.nickname)}`, FACEIT_API_ORIGIN);
    case "recentMatches": {
      const url = new URL(
        `/match-history/v5/players/${encodeURIComponent(request.args.playerId)}/history`,
        FACEIT_API_ORIGIN
      );
      url.searchParams.set("game", "cs2");
      url.searchParams.set("offset", "0");
      url.searchParams.set("limit", String(request.args.limit));
      return url;
    }
    case "playerMapStats":
      return new URL(
        `/stats/v1/stats/users/${encodeURIComponent(request.args.playerId)}/games/cs2`,
        FACEIT_API_ORIGIN
      );
    case "match":
      return new URL(`/match/v2/match/${encodeURIComponent(request.args.matchId)}`, FACEIT_API_ORIGIN);
    case "matchStats":
      return new URL(`/stats/v1/stats/matches/${encodeURIComponent(request.args.matchId)}`, FACEIT_API_ORIGIN);
    case "vetoState":
      return new URL(`/democracy/v1/match/${encodeURIComponent(request.args.matchId)}/history`, FACEIT_API_ORIGIN);
  }
}

function transientSessionToken(): string | undefined {
  // FACEIT owns these stores. EloScope only reads the value for this single GET;
  // it is never copied to extension storage, messages, logs, or an error object.
  const cookieValue = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="))
    ?.slice(2);

  let value = cookieValue;
  if (!value) {
    try {
      value = window.localStorage.getItem("token") ?? window.sessionStorage.getItem("token") ?? undefined;
    } catch {
      value = undefined;
    }
  }
  if (!value) return undefined;

  const normalized = value.replace(/^Bearer\s+/i, "").replace(/^"|"$/g, "").trim();
  return normalized.length >= 16 && normalized.length <= 8_192 ? normalized : undefined;
}

async function executeRead(request: AnyBridgeRequest): Promise<BridgeResult> {
  const endpoint = endpointFor(request);
  if (!endpoint || endpoint.origin !== FACEIT_API_ORIGIN || endpoint.protocol !== "https:") {
    return { status: "error", code: "unsupported" };
  }

  const token = transientSessionToken();
  const headers = new Headers({ Accept: "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "strict-origin-when-cross-origin"
    });

    if (response.status === 401) return { status: "restricted", reason: "logged-out" };
    if (response.status === 403) return { status: "restricted", reason: "forbidden" };
    if (response.status === 429) return { status: "restricted", reason: "rate-limited" };
    if (!response.ok) return { status: "error", code: "upstream" };

    const normalized = normalizeBridgeData(request, await response.json());
    if (normalized === null || normalized === undefined) return { status: "error", code: "upstream-shape" };
    const safe = sanitizeForBridge(normalized);
    if (safe === undefined) return { status: "error", code: "upstream" };
    return { status: "ok", data: safe, sampledAt: Date.now() };
  } catch {
    return { status: "error", code: "network" };
  }
}

function postRoute(): void {
  const message: RouteMessage = {
    source: MAIN_SOURCE,
    version: PROTOCOL_VERSION,
    type: "route",
    pathname: location.pathname
  };
  window.postMessage(message, FACEIT_PAGE_ORIGIN);
}

function installRouteObserver(): void {
  const historyObject = window.history;
  for (const methodName of ["pushState", "replaceState"] as const) {
    type HistoryMethod = (data: unknown, unused: string, url?: string | URL | null) => void;
    const original = historyObject[methodName].bind(historyObject) as HistoryMethod;
    historyObject[methodName] = ((data: unknown, unused: string, url?: string | URL | null) => {
      original(data, unused, url);
      queueMicrotask(postRoute);
    }) as HistoryMethod;
  }
  window.addEventListener("popstate", postRoute, { passive: true });
  postRoute();
}

function installBridge(): void {
  if (location.origin !== FACEIT_PAGE_ORIGIN) return;

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== FACEIT_PAGE_ORIGIN) return;
    if (!isValidBridgeRequest(event.data)) return;

    const request = event.data;
    const now = Date.now();
    while (recentReads.length && (recentReads[0] ?? now) < now - 60_000) recentReads.shift();
    const throttled = activeReads >= MAX_CONCURRENT_READS || recentReads.length >= MAX_READS_PER_MINUTE;
    if (!throttled) {
      activeReads += 1;
      recentReads.push(now);
    }
    const operation = throttled
      ? Promise.resolve<BridgeResult>({ status: "restricted", reason: "rate-limited" })
      : executeRead(request).finally(() => { activeReads = Math.max(0, activeReads - 1); });
    void operation.then((result) => {
      const response: BridgeResponse = {
        source: MAIN_SOURCE,
        version: PROTOCOL_VERSION,
        type: "response",
        id: request.id,
        result
      };
      window.postMessage(response, FACEIT_PAGE_ORIGIN);
    });
  });

  installRouteObserver();
}

installBridge();
