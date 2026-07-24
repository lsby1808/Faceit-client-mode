export const DEBUG_LOG_STORAGE_KEY = "eloscope:debug-log:v1";
export const DEBUG_LOG_MAX_EVENTS = 2000;
export const DEBUG_LOG_MAX_BYTES = 1024 * 1024;
export const DEBUG_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEBUG_LOG_FLUSH_MS = 1000;

const DEBUG_LOG_SCHEMA_VERSION = 1 as const;
const FLUSH_EVENT_THRESHOLD = 25;

export type DebugRouteKind =
  | "logged-out"
  | "matchmaking"
  | "profile"
  | "history"
  | "match"
  | "other";

export type DebugLogSummary = Readonly<{
  eventCount: number;
  oldestAt?: number;
  newestAt?: number;
}>;

const COMPONENTS = [
  "runtime",
  "interaction",
  "settings",
  "controller",
  "bridge",
  "automation",
  "position",
  "render",
] as const;
export type DebugComponent = (typeof COMPONENTS)[number];

const EVENT_CODES = [
  "runtime.start",
  "runtime.ready",
  "runtime.stop",
  "runtime.error",
  "runtime.unhandled-rejection",
  "interaction.click",
  "interaction.change",
  "interaction.submit",
  "settings.open",
  "settings.save",
  "settings.copy",
  "settings.save-file",
  "settings.clear",
  "settings.error",
  "controller.start",
  "controller.ready",
  "controller.destroy",
  "controller.navigate",
  "controller.compatibility",
  "controller.load",
  "controller.retry",
  "controller.map-pool",
  "controller.error",
  "bridge.request",
  "bridge.response",
  "bridge.timeout",
  "bridge.destroy",
  "automation.result",
  "position.result",
  "render.matchmaking",
  "render.match-accept-preview",
  "render.profile",
  "render.match",
] as const;
export type DebugEventCode = (typeof EVENT_CODES)[number];

const LEVELS = ["info", "warn", "error"] as const;
export type DebugLevel = (typeof LEVELS)[number];

const INTERACTION_SOURCES = ["faceit", "eloscope"] as const;
export type DebugInteractionSource = (typeof INTERACTION_SOURCES)[number];

const CONTROLS = [
  "settings-open",
  "settings-close",
  "settings-save",
  "settings-cancel",
  "debug-copy",
  "debug-save",
  "debug-clear",
  "party-accept",
  "ready-up",
  "map-veto",
  "server-veto",
  "server-connect",
  "server-copy",
  "chat-send",
  "player-profile",
  "button",
  "link",
  "checkbox",
  "select",
  "textarea",
  "input",
  "form",
  "other",
] as const;
export type DebugControl = (typeof CONTROLS)[number];

const OPERATIONS = [
  "viewer",
  "player",
  "recentMatches",
  "playerMapStats",
  "match",
  "matchStats",
  "vetoState",
] as const;
export type DebugOperation = (typeof OPERATIONS)[number];

const ACTIONS = [
  "partyAccept",
  "readyUp",
  "mapVeto",
  "serverVeto",
  "connect",
  "copyServerData",
] as const;
export type DebugAction = (typeof ACTIONS)[number];

const MODES = ["confirm", "auto", "prefill"] as const;
export type DebugPositionMode = (typeof MODES)[number];

const STATUSES = [
  "started",
  "ready",
  "loading",
  "rendered",
  "incompatible",
  "success",
  "failure",
  "error",
  "restricted",
  "applied",
  "cached",
  "built-in",
  "unconfigured",
  "unavailable",
  "invalid",
  "expired",
  "clicked",
  "skipped",
  "sent",
  "prepared",
  "duplicate",
  "chat-unavailable",
  "empty",
  "timeout",
  "cancelled",
  "unknown",
] as const;
export type DebugStatus = (typeof STATUSES)[number];

const REASONS = [
  "invalid-match-roster",
  "roster-contract",
  "team-roster-ambiguous",
  "nickname-ambiguous",
  "player-card-contract",
  "player-holder-contract",
  "not-an-unambiguous-match-room",
  "stale-route",
  "rate-limited",
  "disabled",
  "ambiguous",
  "unknown",
] as const;
export type DebugReason = (typeof REASONS)[number];

const ERROR_CODES = [
  "startup",
  "controller",
  "storage",
  "clipboard",
  "file-save",
  "unhandled",
  "unknown",
] as const;
export type DebugErrorCode = (typeof ERROR_CODES)[number];

export type DebugEventInput = Readonly<{
  level?: DebugLevel;
  component: DebugComponent;
  event: DebugEventCode;
  route?: DebugRouteKind;
  source?: DebugInteractionSource;
  control?: DebugControl;
  operation?: DebugOperation;
  action?: DebugAction;
  mode?: DebugPositionMode;
  status?: DebugStatus;
  reason?: DebugReason;
  errorCode?: DebugErrorCode;
  trusted?: boolean;
  count?: number;
  total?: number;
  updated?: number;
  durationMs?: number;
  attempt?: number;
  delayMs?: number;
  revision?: number;
}>;

export type DebugEvent = Readonly<{
  sequence: number;
  timestamp: number;
  session: string;
  level: DebugLevel;
  component: DebugComponent;
  event: DebugEventCode;
  route?: DebugRouteKind;
  source?: DebugInteractionSource;
  control?: DebugControl;
  operation?: DebugOperation;
  action?: DebugAction;
  mode?: DebugPositionMode;
  status?: DebugStatus;
  reason?: DebugReason;
  errorCode?: DebugErrorCode;
  trusted?: boolean;
  count?: number;
  total?: number;
  updated?: number;
  durationMs?: number;
  attempt?: number;
  delayMs?: number;
  revision?: number;
}>;

type SanitizedFields = {
  -readonly [Key in keyof Omit<DebugEvent, "sequence" | "timestamp" | "session">]:
    Omit<DebugEvent, "sequence" | "timestamp" | "session">[Key];
};

type StoredDebugLog = Readonly<{
  schemaVersion: typeof DEBUG_LOG_SCHEMA_VERSION;
  events: readonly DebugEvent[];
}>;

type DebugExport = Readonly<{
  schemaVersion: typeof DEBUG_LOG_SCHEMA_VERSION;
  product: "EloScope";
  extensionVersion: string;
  generatedAt: number;
  retention: Readonly<{
    maxEvents: number;
    maxBytes: number;
    maxAgeMs: number;
  }>;
  privacy: Readonly<{
    localOnly: true;
    telemetry: false;
    redacted: true;
    excludes: readonly string[];
  }>;
  events: readonly DebugEvent[];
}>;

type SaveFileHandle = Readonly<{
  createWritable(): Promise<{
    write(data: string): Promise<void>;
    close(): Promise<void>;
  }>;
}>;

type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}) => Promise<SaveFileHandle>;

const asSet = <T extends string>(values: readonly T[]): ReadonlySet<string> => new Set(values);
const COMPONENT_SET = asSet(COMPONENTS);
const EVENT_CODE_SET = asSet(EVENT_CODES);
const LEVEL_SET = asSet(LEVELS);
const ROUTE_SET = asSet<DebugRouteKind>([
  "logged-out",
  "matchmaking",
  "profile",
  "history",
  "match",
  "other",
]);
const SOURCE_SET = asSet(INTERACTION_SOURCES);
const CONTROL_SET = asSet(CONTROLS);
const OPERATION_SET = asSet(OPERATIONS);
const ACTION_SET = asSet(ACTIONS);
const MODE_SET = asSet(MODES);
const STATUS_SET = asSet(STATUSES);
const REASON_SET = asSet(REASONS);
const ERROR_CODE_SET = asSet(ERROR_CODES);

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

function safeEnum<T extends string>(candidate: unknown, allowed: ReadonlySet<string>): T | undefined {
  return typeof candidate === "string" && allowed.has(candidate) ? candidate as T : undefined;
}

function safeInteger(candidate: unknown, maximum = 1_000_000_000): number | undefined {
  if (typeof candidate !== "number" || !Number.isFinite(candidate)) return undefined;
  return Math.max(0, Math.min(maximum, Math.round(candidate)));
}

function safeBoolean(candidate: unknown): boolean | undefined {
  return typeof candidate === "boolean" ? candidate : undefined;
}

function sanitizeFields(candidate: unknown): SanitizedFields | null {
  if (!isRecord(candidate)) return null;
  const component = safeEnum<DebugComponent>(candidate.component, COMPONENT_SET);
  const event = safeEnum<DebugEventCode>(candidate.event, EVENT_CODE_SET);
  if (!component || !event) return null;

  const output: SanitizedFields = {
    level: safeEnum<DebugLevel>(candidate.level, LEVEL_SET) ?? "info",
    component,
    event,
  };
  const route = safeEnum<DebugRouteKind>(candidate.route, ROUTE_SET);
  const source = safeEnum<DebugInteractionSource>(candidate.source, SOURCE_SET);
  const control = safeEnum<DebugControl>(candidate.control, CONTROL_SET);
  const operation = safeEnum<DebugOperation>(candidate.operation, OPERATION_SET);
  const action = safeEnum<DebugAction>(candidate.action, ACTION_SET);
  const mode = safeEnum<DebugPositionMode>(candidate.mode, MODE_SET);
  const status = safeEnum<DebugStatus>(candidate.status, STATUS_SET);
  const reason = safeEnum<DebugReason>(candidate.reason, REASON_SET);
  const errorCode = safeEnum<DebugErrorCode>(candidate.errorCode, ERROR_CODE_SET);
  const trusted = safeBoolean(candidate.trusted);
  const count = safeInteger(candidate.count);
  const total = safeInteger(candidate.total);
  const updated = safeInteger(candidate.updated);
  const durationMs = safeInteger(candidate.durationMs, 60 * 60 * 1000);
  const attempt = safeInteger(candidate.attempt, 1_000);
  const delayMs = safeInteger(candidate.delayMs, 60 * 60 * 1000);
  const revision = safeInteger(candidate.revision);

  if (route) output.route = route;
  if (source) output.source = source;
  if (control) output.control = control;
  if (operation) output.operation = operation;
  if (action) output.action = action;
  if (mode) output.mode = mode;
  if (status) output.status = status;
  if (reason) output.reason = reason;
  if (errorCode) output.errorCode = errorCode;
  if (trusted !== undefined) output.trusted = trusted;
  if (count !== undefined) output.count = count;
  if (total !== undefined) output.total = total;
  if (updated !== undefined) output.updated = updated;
  if (durationMs !== undefined) output.durationMs = durationMs;
  if (attempt !== undefined) output.attempt = attempt;
  if (delayMs !== undefined) output.delayMs = delayMs;
  if (revision !== undefined) output.revision = revision;
  return output;
}

function sanitizeStoredEntry(candidate: unknown): DebugEvent | null {
  if (!isRecord(candidate)) return null;
  const fields = sanitizeFields(candidate);
  const sequence = safeInteger(candidate.sequence, Number.MAX_SAFE_INTEGER);
  const timestamp = safeInteger(candidate.timestamp, Number.MAX_SAFE_INTEGER);
  const session = typeof candidate.session === "string" && /^[a-f0-9]{12}$/u.test(candidate.session)
    ? candidate.session
    : undefined;
  return fields && sequence !== undefined && timestamp !== undefined && session
    ? { sequence, timestamp, session, ...fields }
    : null;
}

function sessionId(): string {
  const bytes = new Uint8Array(6);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function entryBytes(entry: DebugEvent): number {
  return new TextEncoder().encode(JSON.stringify(entry)).byteLength;
}

function isEloScopePath(path: readonly EventTarget[]): boolean {
  return path.some((candidate) =>
    candidate instanceof Element && (
      candidate.matches("#eloscope-root, #eloscope-settings-root")
      || candidate.matches("[data-eloscope-profile-stats]")
      || Array.from(candidate.attributes).some(({ name }) =>
        name.startsWith("data-eloscope-inline-"))
      || candidate.matches('[class^="es-"], [class*=" es-"]')
    ));
}

function interactiveElement(path: readonly EventTarget[]): Element | undefined {
  return path.find((candidate): candidate is Element =>
    candidate instanceof Element
    && candidate.matches("button, a, input, select, textarea, form, [role='button']"));
}

function classifyControl(path: readonly EventTarget[], source: DebugInteractionSource): DebugControl {
  const candidates = path.filter((candidate): candidate is Element => candidate instanceof Element);
  const contains = (selector: string): boolean => candidates.some((candidate) => candidate.matches(selector));

  if (
    contains('[class*="Avatar__AvatarHolder"]')
    && contains('[aria-label="avatar"]')
  ) return "player-profile";

  if (source === "eloscope") {
    if (contains(".es-settings-launcher")) return "settings-open";
    if (contains(".es-settings-close")) return "settings-close";
    if (contains('[data-testid="debug-log-copy"]')) return "debug-copy";
    if (contains('[data-testid="debug-log-save"]')) return "debug-save";
    if (contains('[data-testid="debug-log-clear"]')) return "debug-clear";
    if (contains('button[type="submit"]')) return "settings-save";
  } else {
    if (contains('[data-testid="party-invite-accept"]')) return "party-accept";
    if (contains('[data-testid="match-ready-button"]')) return "ready-up";
    if (contains('[data-testid="veto-action"], [data-testid^="veto-map-"]')) return "map-veto";
    if (contains('[data-testid="server-veto"], [data-testid^="veto-server-"]')) return "server-veto";
    if (contains('[data-testid="connect-to-server"]')) return "server-connect";
    if (contains('[data-testid="copy-server-connection"]')) return "server-copy";
    if (contains('[data-testid="team-chat-send"], [data-testid="chat-send"]')) return "chat-send";
  }

  const interactive = interactiveElement(path);
  if (interactive instanceof HTMLButtonElement || interactive?.getAttribute("role") === "button") return "button";
  if (interactive instanceof HTMLAnchorElement) return "link";
  if (interactive instanceof HTMLSelectElement) return "select";
  if (interactive instanceof HTMLTextAreaElement) return "textarea";
  if (interactive instanceof HTMLInputElement) {
    return interactive.matches('input[type="checkbox"], input[type="radio"]') ? "checkbox" : "input";
  }
  if (interactive instanceof HTMLFormElement) return "form";
  return "other";
}

function extensionVersion(): string {
  try {
    const manifest = chrome.runtime?.getManifest?.();
    return typeof manifest?.version === "string" && /^\d+(?:\.\d+){2,3}$/u.test(manifest.version)
      ? manifest.version
      : "unknown";
  } catch {
    return "unknown";
  }
}

function fileName(timestamp: number): string {
  return `eloscope-debug-${new Date(timestamp).toISOString().replace(/[:.]/gu, "-")}.json`;
}

export class LocalDebugLog {
  readonly #session = sessionId();
  #events: DebugEvent[] = [];
  #eventBytes: number[] = [];
  #totalBytes = 0;
  #nextSequence = 1;
  #dirtyEvents = 0;
  #flushTimer: number | undefined;
  #started = false;
  #loadPromise: Promise<void> | undefined;
  #writeChain: Promise<void> = Promise.resolve();
  #captureCleanup: (() => void) | undefined;

  async start(): Promise<void> {
    if (this.#started) return;
    if (this.#loadPromise) return this.#loadPromise;
    this.#loadPromise = this.#load();
    return this.#loadPromise;
  }

  async #load(): Promise<void> {
    const current = [...this.#events];
    let storedEvents: DebugEvent[] = [];
    let storedEntryCount = 0;
    let rewriteStoredValue = false;
    try {
      const stored = await chrome.storage.local.get(DEBUG_LOG_STORAGE_KEY);
      const raw = stored[DEBUG_LOG_STORAGE_KEY];
      if (isRecord(raw) && raw.schemaVersion === DEBUG_LOG_SCHEMA_VERSION && Array.isArray(raw.events)) {
        storedEntryCount = raw.events.length;
        storedEvents = raw.events
          .map(sanitizeStoredEntry)
          .filter((entry): entry is DebugEvent => entry !== null);
        rewriteStoredValue = storedEntryCount !== storedEvents.length;
      } else if (raw !== undefined) {
        rewriteStoredValue = true;
      }
    } catch {
      storedEvents = [];
    }
    this.#events = [...storedEvents, ...current];
    this.#nextSequence = Math.max(0, ...this.#events.map((entry) => entry.sequence)) + 1;
    const countBeforePrune = this.#events.length;
    this.#recalculateAndPrune();
    this.#started = true;
    if (
      current.length > 0
      || rewriteStoredValue
      || countBeforePrune !== this.#events.length
    ) {
      this.#dirtyEvents = Math.max(1, this.#dirtyEvents);
      this.#scheduleFlush();
    }
  }

  record(input: DebugEventInput | unknown): void {
    const fields = sanitizeFields(input);
    if (!fields) return;
    const entry: DebugEvent = {
      sequence: this.#nextSequence,
      timestamp: Date.now(),
      session: this.#session,
      ...fields,
    };
    this.#nextSequence += 1;
    this.#events.push(entry);
    const bytes = entryBytes(entry);
    this.#eventBytes.push(bytes);
    this.#totalBytes += bytes;
    this.#dirtyEvents += 1;
    this.#prune(Date.now());
    if (!this.#started) return;
    if (this.#dirtyEvents >= FLUSH_EVENT_THRESHOLD) void this.flush();
    else this.#scheduleFlush();
  }

  installGlobalCapture(
    routeResolver: () => DebugRouteKind,
    root: Document = document,
    windowTarget: Window = window,
  ): () => void {
    this.#captureCleanup?.();
    const currentRoute = (): DebugRouteKind => {
      try {
        const route = routeResolver();
        return ROUTE_SET.has(route) ? route : "other";
      } catch {
        return "other";
      }
    };
    const capture = (domEvent: Event): void => {
      const path = domEvent.composedPath();
      const source: DebugInteractionSource = isEloScopePath(path) ? "eloscope" : "faceit";
      const code: DebugEventCode = domEvent.type === "click"
        ? "interaction.click"
        : domEvent.type === "change"
          ? "interaction.change"
          : "interaction.submit";
      this.record({
        component: "interaction",
        event: code,
        route: currentRoute(),
        source,
        control: classifyControl(path, source),
        trusted: domEvent.isTrusted,
      });
    };
    const runtimeError = (): void => {
      this.record({
        level: "error",
        component: "runtime",
        event: "runtime.error",
        route: currentRoute(),
        errorCode: "unhandled",
      });
    };
    const unhandledRejection = (): void => {
      this.record({
        level: "error",
        component: "runtime",
        event: "runtime.unhandled-rejection",
        route: currentRoute(),
        errorCode: "unhandled",
      });
    };
    const flushWhenHidden = (): void => {
      if (root.visibilityState === "hidden") void this.flush();
    };
    const flushBeforeClose = (): void => {
      void this.flush();
    };

    root.addEventListener("click", capture, true);
    root.addEventListener("change", capture, true);
    root.addEventListener("submit", capture, true);
    root.addEventListener("visibilitychange", flushWhenHidden);
    windowTarget.addEventListener("error", runtimeError);
    windowTarget.addEventListener("unhandledrejection", unhandledRejection);
    windowTarget.addEventListener("pagehide", flushBeforeClose);
    const cleanup = (): void => {
      root.removeEventListener("click", capture, true);
      root.removeEventListener("change", capture, true);
      root.removeEventListener("submit", capture, true);
      root.removeEventListener("visibilitychange", flushWhenHidden);
      windowTarget.removeEventListener("error", runtimeError);
      windowTarget.removeEventListener("unhandledrejection", unhandledRejection);
      windowTarget.removeEventListener("pagehide", flushBeforeClose);
      if (this.#captureCleanup === cleanup) this.#captureCleanup = undefined;
    };
    this.#captureCleanup = cleanup;
    return cleanup;
  }

  async flush(): Promise<void> {
    await this.start();
    if (this.#flushTimer !== undefined) {
      window.clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    this.#prune(Date.now());
    if (this.#dirtyEvents === 0) return this.#writeChain;
    this.#dirtyEvents = 0;
    const payload: StoredDebugLog = {
      schemaVersion: DEBUG_LOG_SCHEMA_VERSION,
      events: [...this.#events],
    };
    this.#writeChain = this.#writeChain.then(async () => {
      try {
        await chrome.storage.local.set({ [DEBUG_LOG_STORAGE_KEY]: payload });
      } catch {
        // A diagnostic write must never affect FACEIT or recurse into logging.
      }
    });
    return this.#writeChain;
  }

  async getSummary(): Promise<DebugLogSummary> {
    await this.start();
    this.#prune(Date.now());
    const oldestAt = this.#events[0]?.timestamp;
    const newestAt = this.#events.at(-1)?.timestamp;
    return {
      eventCount: this.#events.length,
      ...(oldestAt === undefined ? {} : { oldestAt }),
      ...(newestAt === undefined ? {} : { newestAt }),
    };
  }

  async exportText(): Promise<string> {
    await this.start();
    this.#prune(Date.now());
    const generatedAt = Date.now();
    const bundle: DebugExport = {
      schemaVersion: DEBUG_LOG_SCHEMA_VERSION,
      product: "EloScope",
      extensionVersion: extensionVersion(),
      generatedAt,
      retention: {
        maxEvents: DEBUG_LOG_MAX_EVENTS,
        maxBytes: DEBUG_LOG_MAX_BYTES,
        maxAgeMs: DEBUG_LOG_RETENTION_MS,
      },
      privacy: {
        localOnly: true,
        telemetry: false,
        redacted: true,
        excludes: [
          "URLs and query parameters",
          "cookies, tokens and credentials",
          "input values and page text",
          "usernames, player IDs and match IDs",
          "chat messages and server connection data",
        ],
      },
      events: [...this.#events],
    };
    return `${JSON.stringify(bundle, null, 2)}\n`;
  }

  async copyToClipboard(): Promise<number> {
    const text = await this.exportText();
    if (typeof navigator.clipboard?.writeText !== "function") throw new Error("clipboard-unavailable");
    await navigator.clipboard.writeText(text);
    return this.#events.length;
  }

  async saveToFile(): Promise<"saved" | "copied"> {
    const text = await this.exportText();
    const picker = (globalThis as typeof globalThis & {
      showSaveFilePicker?: SaveFilePicker;
    }).showSaveFilePicker;
    if (typeof picker === "function") {
      try {
        const generatedAt = Date.now();
        const handle = await picker.call(globalThis, {
          suggestedName: fileName(generatedAt),
          types: [{
            description: "EloScope debug JSON",
            accept: { "application/json": [".json"] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        return "saved";
      } catch {
        // WebView2 may not expose the picker. Clipboard remains the safe fallback.
      }
    }
    if (typeof navigator.clipboard?.writeText !== "function") throw new Error("export-unavailable");
    await navigator.clipboard.writeText(text);
    return "copied";
  }

  async clear(): Promise<void> {
    await this.start();
    if (this.#flushTimer !== undefined) {
      window.clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    this.#events = [];
    this.#eventBytes = [];
    this.#totalBytes = 0;
    this.#dirtyEvents = 0;
    const clearAttempt = this.#writeChain.then(async () => {
      await chrome.storage.local.set({
        [DEBUG_LOG_STORAGE_KEY]: {
          schemaVersion: DEBUG_LOG_SCHEMA_VERSION,
          events: [],
        } satisfies StoredDebugLog,
      });
    });
    this.#writeChain = clearAttempt.catch(() => undefined);
    await clearAttempt;
  }

  stop(): void {
    this.#captureCleanup?.();
    this.#captureCleanup = undefined;
    if (this.#flushTimer !== undefined) {
      window.clearTimeout(this.#flushTimer);
      this.#flushTimer = undefined;
    }
    if (this.#started && this.#dirtyEvents > 0) void this.flush();
  }

  #scheduleFlush(): void {
    if (this.#flushTimer !== undefined) return;
    this.#flushTimer = window.setTimeout(() => {
      this.#flushTimer = undefined;
      void this.flush();
    }, DEBUG_LOG_FLUSH_MS);
  }

  #recalculateAndPrune(): void {
    this.#eventBytes = this.#events.map(entryBytes);
    this.#totalBytes = this.#eventBytes.reduce((sum, bytes) => sum + bytes, 0);
    this.#prune(Date.now());
  }

  #prune(now: number): void {
    const cutoff = now - DEBUG_LOG_RETENTION_MS;
    while (
      this.#events.length > 0
      && (
        (this.#events[0]?.timestamp ?? 0) < cutoff
        || this.#events.length > DEBUG_LOG_MAX_EVENTS
        || this.#totalBytes > DEBUG_LOG_MAX_BYTES
      )
    ) {
      this.#events.shift();
      this.#totalBytes -= this.#eventBytes.shift() ?? 0;
    }
  }
}

export const debugLog = new LocalDebugLog();
