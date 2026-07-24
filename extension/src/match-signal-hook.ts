import {
  MAIN_SOURCE,
  PROTOCOL_VERSION,
  type MatchSignalMessage
} from "./protocol";
import { normalizePendingMatchSignal } from "./normalize";

const FACEIT_PAGE_ORIGIN = "https://www.faceit.com";
const MATCH_PATH = /^\/api\/match\/v2\/match\/([^/?#]+)$/u;
const MATCH_ID = /^[1-9]\d*-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;

export function matchIdFromMatchUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url, FACEIT_PAGE_ORIGIN);
    if (parsed.origin !== FACEIT_PAGE_ORIGIN) return undefined;
    const match = MATCH_PATH.exec(parsed.pathname);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function isObservedMatchUrl(url: string): boolean {
  return matchIdFromMatchUrl(url) !== undefined;
}

function postMatchSignal(preview: ReturnType<typeof normalizePendingMatchSignal>): void {
  const message: MatchSignalMessage = {
    source: MAIN_SOURCE,
    version: PROTOCOL_VERSION,
    type: "matchSignal",
    preview,
    sampledAt: Date.now(),
  };
  const targetOrigin = window.location.origin === FACEIT_PAGE_ORIGIN
    ? FACEIT_PAGE_ORIGIN
    : "*";
  window.postMessage(message, targetOrigin);
}

function handleMatchPayload(data: unknown): void {
  postMatchSignal(normalizePendingMatchSignal(data));
}

function readJsonResponse(response: Response, onData: (data: unknown) => void): void {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;
  void response.clone().json().then(onData).catch(() => undefined);
}

export function installMatchSignalHook(): void {
  const scope = window as Window & { __eloscopeMatchSignalHooked?: boolean };
  if (scope.__eloscopeMatchSignalHooked) return;
  scope.__eloscopeMatchSignalHooked = true;

  if (typeof window.fetch !== "function" && typeof globalThis.fetch !== "function") return;

  const fetchSource = typeof globalThis.fetch === "function" ? globalThis.fetch : window.fetch;
  const originalFetch = fetchSource.bind(window);
  const patchedFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const responsePromise = originalFetch(input, init);
    if (isObservedMatchUrl(url)) {
      void responsePromise.then((response) => {
        readJsonResponse(response, handleMatchPayload);
      }).catch(() => undefined);
    }
    return responsePromise;
  }) as typeof window.fetch;
  window.fetch = patchedFetch;
  globalThis.fetch = patchedFetch;

  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;

  xhrProto.open = function patchedOpen(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    this.__eloscopeMatchUrl = typeof url === "string" ? url : url.href;
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };

  xhrProto.send = function patchedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
    const url = this.__eloscopeMatchUrl;
    if (typeof url === "string" && isObservedMatchUrl(url)) {
      this.addEventListener("load", () => {
        try {
          const contentType = this.getResponseHeader("content-type") ?? "";
          if (!contentType.includes("application/json")) return;
          handleMatchPayload(JSON.parse(this.responseText));
        } catch {
          // Ignore malformed upstream payloads.
        }
      });
    }
    return originalSend.call(this, body);
  };
}

declare global {
  interface XMLHttpRequest {
    __eloscopeMatchUrl?: string;
  }
}

export function isValidMatchSignalMessage(value: unknown): value is MatchSignalMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Partial<MatchSignalMessage>;
  if (
    message.source !== MAIN_SOURCE ||
    message.version !== PROTOCOL_VERSION ||
    message.type !== "matchSignal" ||
    !Number.isFinite(message.sampledAt)
  ) {
    return false;
  }
  if (message.preview === null) return true;
  return isPendingMatchPreview(message.preview);
}

function isPendingMatchPreview(value: unknown): value is MatchSignalMessage["preview"] & object {
  if (typeof value !== "object" || value === null) return false;
  const preview = value as Record<string, unknown>;
  if (
    typeof preview.matchId !== "string" ||
    !MATCH_ID.test(preview.matchId) ||
    typeof preview.phase !== "string" ||
    !Array.isArray(preview.regions) ||
    !Array.isArray(preview.mapPool)
  ) {
    return false;
  }
  if (
    preview.regions.length > 32 ||
    preview.mapPool.length > 32 ||
    !preview.regions.every((entry) => typeof entry === "string" && entry.length <= 64) ||
    !preview.mapPool.every((entry) => typeof entry === "string" && entry.length <= 64)
  ) {
    return false;
  }
  if (preview.teams === undefined) return true;
  if (!Array.isArray(preview.teams) || preview.teams.length > 16) return false;
  return preview.teams.every((team) => {
    if (typeof team !== "object" || team === null) return false;
    const record = team as Record<string, unknown>;
    if (typeof record.id !== "string" || !Array.isArray(record.players)) return false;
    return record.players.length <= 32 && record.players.every((player) => {
      if (typeof player !== "object" || player === null) return false;
      const row = player as Record<string, unknown>;
      return typeof row.nickname === "string" && row.nickname.length <= 64;
    });
  });
}
