import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEBUG_LOG_FLUSH_MS,
  DEBUG_LOG_MAX_BYTES,
  DEBUG_LOG_MAX_EVENTS,
  DEBUG_LOG_RETENTION_MS,
  DEBUG_LOG_STORAGE_KEY,
  LocalDebugLog,
  type DebugEvent
} from "../src/debug-log";

const NOW = Date.parse("2026-07-23T12:00:00.000Z");
const SESSION = "abcdef123456";

type DebugBundle = {
  schemaVersion: number;
  product: string;
  extensionVersion: string;
  generatedAt: number;
  retention: {
    maxEvents: number;
    maxBytes: number;
    maxAgeMs: number;
  };
  privacy: {
    localOnly: boolean;
    telemetry: boolean;
    redacted: boolean;
    excludes: string[];
  };
  events: DebugEvent[];
};

function storedEvent(
  sequence: number,
  timestamp = NOW,
  fields: Partial<DebugEvent> = {}
): DebugEvent {
  return {
    sequence,
    timestamp,
    session: SESSION,
    level: "info",
    component: "runtime",
    event: "runtime.ready",
    ...fields
  };
}

async function exported(log: LocalDebugLog): Promise<DebugBundle> {
  return JSON.parse(await log.exportText()) as DebugBundle;
}

function setClipboard(
  writeText = vi.fn(async (_text: string): Promise<void> => undefined)
): typeof writeText {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  return writeText;
}

describe("local debug log", () => {
  let clipboardDescriptor: PropertyDescriptor | undefined;
  let pickerDescriptor: PropertyDescriptor | undefined;
  let runtimeDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    pickerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "showSaveFilePicker");
    runtimeDescriptor = Object.getOwnPropertyDescriptor(chrome, "runtime");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
    else Reflect.deleteProperty(navigator, "clipboard");
    if (pickerDescriptor) Object.defineProperty(globalThis, "showSaveFilePicker", pickerDescriptor);
    else Reflect.deleteProperty(globalThis, "showSaveFilePicker");
    if (runtimeDescriptor) Object.defineProperty(chrome, "runtime", runtimeDescriptor);
    else Reflect.deleteProperty(chrome, "runtime");
  });

  it("accepts only the closed schema and drops every raw-data canary", async () => {
    const log = new LocalDebugLog();
    log.record({
      component: "interaction",
      event: "interaction.click",
      level: "not-a-level",
      route: "https://faceit.test/cs2/room/secret-match-id?token=secret-token",
      source: "page-with-secret",
      control: "secret-control",
      status: "secret-status",
      trusted: "yes",
      count: -50,
      total: Number.POSITIVE_INFINITY,
      durationMs: 9_999_999,
      text: "secret-player-name",
      value: "secret-chat-message",
      href: "steam://connect/secret-server",
      id: "secret-player-id",
      token: "secret-session-token",
      nested: { cookie: "secret-cookie" }
    } as unknown);
    log.record({
      component: "secret-component",
      event: "interaction.click",
      token: "another-secret"
    } as unknown);

    const text = await log.exportText();
    const bundle = JSON.parse(text) as DebugBundle;
    expect(bundle.events).toHaveLength(1);
    expect(bundle.events[0]).toEqual({
      sequence: 1,
      timestamp: NOW,
      session: expect.stringMatching(/^[a-f0-9]{12}$/u),
      level: "info",
      component: "interaction",
      event: "interaction.click",
      count: 0,
      durationMs: 3_600_000
    });
    for (const canary of [
      "secret-match-id",
      "secret-token",
      "secret-player-name",
      "secret-chat-message",
      "secret-server",
      "secret-player-id",
      "secret-session-token",
      "secret-cookie",
      "another-secret"
    ]) {
      expect(text).not.toContain(canary);
    }
  });

  it("captures click, change and submit across Shadow DOM without DOM data", async () => {
    const log = new LocalDebugLog();
    await log.start();
    const cleanup = log.installGlobalCapture(() => "match");

    const host = document.createElement("section");
    host.id = "eloscope-root";
    const shadow = host.attachShadow({ mode: "open" });
    const launcher = document.createElement("button");
    launcher.className = "es-settings-launcher";
    launcher.id = "secret-launcher-id";
    launcher.textContent = "secret-button-text";
    launcher.value = "secret-button-value";
    shadow.append(launcher);
    document.body.append(host);

    const input = document.createElement("input");
    input.id = "secret-input-id";
    input.name = "secret-input-name";
    input.value = "secret-input-value";
    document.body.append(input);

    const form = document.createElement("form");
    form.id = "secret-form-id";
    form.action = "https://faceit.test/secret-submit-url?token=secret-query";
    const textarea = document.createElement("textarea");
    textarea.value = "secret-form-value";
    form.append(textarea);
    document.body.append(form);

    const click = new MouseEvent("click", { bubbles: true, composed: true });
    const change = new Event("change", { bubbles: true, composed: true });
    const submit = new Event("submit", { bubbles: true, composed: true });
    Object.defineProperty(click, "isTrusted", { value: false });
    Object.defineProperty(change, "isTrusted", { value: false });
    Object.defineProperty(submit, "isTrusted", { value: false });
    launcher.dispatchEvent(click);
    input.dispatchEvent(change);
    form.dispatchEvent(submit);
    cleanup();
    launcher.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    const text = await log.exportText();
    const bundle = JSON.parse(text) as DebugBundle;
    expect(bundle.events.map(({ event, route, source, control, trusted }) => ({
      event,
      route,
      source,
      control,
      trusted
    }))).toEqual([
      {
        event: "interaction.click",
        route: "match",
        source: "eloscope",
        control: "settings-open",
        trusted: false
      },
      {
        event: "interaction.change",
        route: "match",
        source: "faceit",
        control: "input",
        trusted: false
      },
      {
        event: "interaction.submit",
        route: "match",
        source: "faceit",
        control: "form",
        trusted: false
      }
    ]);
    for (const canary of [
      "secret-launcher-id",
      "secret-button-text",
      "secret-button-value",
      "secret-input-id",
      "secret-input-name",
      "secret-input-value",
      "secret-form-id",
      "secret-submit-url",
      "secret-query",
      "secret-form-value"
    ]) {
      expect(text).not.toContain(canary);
    }
  });

  it("classifies profile-banner Shadow DOM interactions as EloScope", async () => {
    const log = new LocalDebugLog();
    await log.start();
    const cleanup = log.installGlobalCapture(() => "profile");
    const host = document.createElement("section");
    host.setAttribute("data-eloscope-profile-stats", "private-player-id");
    const shadow = host.attachShadow({ mode: "open" });
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.textContent = "Private map label";
    shadow.append(tab);
    document.body.append(host);

    tab.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    cleanup();

    const bundle = JSON.parse(await log.exportText()) as DebugBundle;
    expect(bundle.events).toContainEqual(expect.objectContaining({
      event: "interaction.click",
      route: "profile",
      source: "eloscope",
      control: "button",
    }));
    expect(JSON.stringify(bundle)).not.toContain("private-player-id");
    expect(JSON.stringify(bundle)).not.toContain("Private map label");
  });

  it("keeps the newest 2000 events in the count-bounded ring", async () => {
    const log = new LocalDebugLog();
    for (let index = 1; index <= DEBUG_LOG_MAX_EVENTS + 5; index += 1) {
      log.record({
        component: "runtime",
        event: "runtime.ready",
        count: index
      });
    }

    const bundle = await exported(log);
    expect(bundle.events).toHaveLength(DEBUG_LOG_MAX_EVENTS);
    expect(bundle.events[0]).toMatchObject({ sequence: 6, count: 6 });
    expect(bundle.events.at(-1)).toMatchObject({
      sequence: DEBUG_LOG_MAX_EVENTS + 5,
      count: DEBUG_LOG_MAX_EVENTS + 5
    });
  });

  it("prunes below 1 MiB even before the event-count bound", async () => {
    const log = new LocalDebugLog();
    for (let index = 1; index <= DEBUG_LOG_MAX_EVENTS; index += 1) {
      log.record({
        level: "error",
        component: "interaction",
        event: "runtime.unhandled-rejection",
        route: "matchmaking",
        source: "eloscope",
        control: "settings-cancel",
        operation: "playerMapStats",
        action: "copyServerData",
        mode: "confirm",
        status: "chat-unavailable",
        reason: "not-an-unambiguous-match-room",
        errorCode: "clipboard",
        trusted: true,
        count: 1_000_000_000,
        total: 1_000_000_000,
        updated: 1_000_000_000,
        durationMs: 3_600_000,
        attempt: 1_000,
        delayMs: 3_600_000,
        revision: 1_000_000_000
      });
    }

    const bundle = await exported(log);
    const bytes = bundle.events.reduce(
      (total, event) => total + new TextEncoder().encode(JSON.stringify(event)).byteLength,
      0
    );
    expect(bundle.events.length).toBeLessThan(DEBUG_LOG_MAX_EVENTS);
    expect(bundle.events[0]?.sequence).toBeGreaterThan(1);
    expect(bytes).toBeLessThanOrEqual(DEBUG_LOG_MAX_BYTES);
  });

  it("expires events older than seven days and keeps the exact cutoff", async () => {
    await chrome.storage.local.set({
      [DEBUG_LOG_STORAGE_KEY]: {
        schemaVersion: 1,
        events: [
          storedEvent(1, NOW - DEBUG_LOG_RETENTION_MS - 1),
          storedEvent(2, NOW - DEBUG_LOG_RETENTION_MS),
          storedEvent(3, NOW)
        ]
      }
    });

    const bundle = await exported(new LocalDebugLog());
    expect(bundle.events.map((event) => event.sequence)).toEqual([2, 3]);
  });

  it.each([
    ["a primitive", "corrupt"],
    ["an unknown schema", { schemaVersion: 999, events: [storedEvent(1)] }],
    ["a non-array event collection", { schemaVersion: 1, events: "corrupt" }]
  ])("fails open for corrupted storage: %s", async (_label, corrupted) => {
    await chrome.storage.local.set({ [DEBUG_LOG_STORAGE_KEY]: corrupted });
    const log = new LocalDebugLog();

    await expect(log.start()).resolves.toBeUndefined();
    await expect(log.getSummary()).resolves.toEqual({ eventCount: 0 });
    log.record({ component: "runtime", event: "runtime.ready" });
    await expect(log.flush()).resolves.toBeUndefined();
    await expect(exported(log)).resolves.toMatchObject({
      events: [{ component: "runtime", event: "runtime.ready" }]
    });
  });

  it("rewrites sanitized storage after dropping invalid and expired entries", async () => {
    await chrome.storage.local.set({
      [DEBUG_LOG_STORAGE_KEY]: {
        schemaVersion: 1,
        events: [
          storedEvent(1, NOW - DEBUG_LOG_RETENTION_MS - 1),
          {
            sequence: 2,
            timestamp: NOW,
            session: "not-a-session",
            component: "runtime",
            event: "runtime.ready",
            rawToken: "secret-invalid-token"
          },
          {
            ...storedEvent(3),
            rawToken: "secret-valid-token",
            pageText: "secret-page-text"
          }
        ]
      }
    });
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const log = new LocalDebugLog();

    await log.start();
    await log.flush();

    expect(setSpy).toHaveBeenCalledOnce();
    const stored = (await chrome.storage.local.get(DEBUG_LOG_STORAGE_KEY))[DEBUG_LOG_STORAGE_KEY];
    expect(stored).toEqual({
      schemaVersion: 1,
      events: [storedEvent(3)]
    });
    expect(JSON.stringify(stored)).not.toContain("secret-");
  });

  it("batches writes by timer and flushes immediately at 25 pending events", async () => {
    const log = new LocalDebugLog();
    await log.start();
    const setSpy = vi.spyOn(chrome.storage.local, "set");

    for (let index = 0; index < 24; index += 1) {
      log.record({ component: "runtime", event: "runtime.ready" });
    }
    expect(setSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBUG_LOG_FLUSH_MS - 1);
    expect(setSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(setSpy).toHaveBeenCalledOnce();

    setSpy.mockClear();
    for (let index = 0; index < 25; index += 1) {
      log.record({ component: "runtime", event: "runtime.ready" });
    }
    await log.flush();
    expect(setSpy).toHaveBeenCalledOnce();
    const stored = (await chrome.storage.local.get(DEBUG_LOG_STORAGE_KEY))[DEBUG_LOG_STORAGE_KEY] as {
      events: DebugEvent[];
    };
    expect(stored.events).toHaveLength(49);
  });

  it("never breaks the page on a quota write failure and can retry later", async () => {
    const log = new LocalDebugLog();
    await log.start();
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    setSpy.mockRejectedValueOnce(new Error("QUOTA_BYTES quota secret"));

    log.record({ component: "runtime", event: "runtime.ready", count: 1 });
    await expect(log.flush()).resolves.toBeUndefined();

    log.record({ component: "runtime", event: "runtime.ready", count: 2 });
    await expect(log.flush()).resolves.toBeUndefined();
    expect(setSpy).toHaveBeenCalledTimes(2);
    const stored = (await chrome.storage.local.get(DEBUG_LOG_STORAGE_KEY))[DEBUG_LOG_STORAGE_KEY] as {
      events: DebugEvent[];
    };
    expect(stored.events.map((event) => event.count)).toEqual([1, 2]);
    expect(JSON.stringify(stored)).not.toContain("quota secret");
  });

  it("reports summary and exports versioned, local-only redacted JSON", async () => {
    Object.defineProperty(chrome, "runtime", {
      configurable: true,
      value: { getManifest: () => ({ version: "0.1.17" }) }
    });
    const log = new LocalDebugLog();
    await log.start();
    log.record({ component: "runtime", event: "runtime.start" });
    vi.advanceTimersByTime(1234);
    log.record({ component: "runtime", event: "runtime.ready" });

    await expect(log.getSummary()).resolves.toEqual({
      eventCount: 2,
      oldestAt: NOW,
      newestAt: NOW + 1234
    });
    const text = await log.exportText();
    const bundle = JSON.parse(text) as DebugBundle;
    expect(text.endsWith("\n")).toBe(true);
    expect(bundle).toMatchObject({
      schemaVersion: 1,
      product: "EloScope",
      extensionVersion: "0.1.17",
      generatedAt: NOW + 1234,
      retention: {
        maxEvents: DEBUG_LOG_MAX_EVENTS,
        maxBytes: DEBUG_LOG_MAX_BYTES,
        maxAgeMs: DEBUG_LOG_RETENTION_MS
      },
      privacy: {
        localOnly: true,
        telemetry: false,
        redacted: true
      }
    });
    expect(bundle.privacy.excludes).toEqual(expect.arrayContaining([
      expect.stringMatching(/URLs/u),
      expect.stringMatching(/tokens/u),
      expect.stringMatching(/input values/u),
      expect.stringMatching(/player IDs/u),
      expect.stringMatching(/chat messages/u)
    ]));
  });

  it("copies, saves, falls back to clipboard, and clears persisted diagnostics", async () => {
    const clipboard = setClipboard();
    const log = new LocalDebugLog();
    await log.start();
    log.record({ component: "settings", event: "settings.open" });

    await expect(log.copyToClipboard()).resolves.toBe(1);
    expect(clipboard).toHaveBeenCalledOnce();
    expect(JSON.parse(clipboard.mock.calls[0]?.[0] ?? "{}")).toMatchObject({
      product: "EloScope",
      events: [{ event: "settings.open" }]
    });

    const write = vi.fn(async (_data: string) => undefined);
    const close = vi.fn(async () => undefined);
    const picker = vi.fn(async () => ({
      createWritable: async () => ({ write, close })
    }));
    Object.defineProperty(globalThis, "showSaveFilePicker", {
      configurable: true,
      value: picker
    });
    await expect(log.saveToFile()).resolves.toBe("saved");
    expect(picker).toHaveBeenCalledWith({
      suggestedName: "eloscope-debug-2026-07-23T12-00-00-000Z.json",
      types: [{
        description: "EloScope debug JSON",
        accept: { "application/json": [".json"] }
      }]
    });
    expect(write).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();

    picker.mockRejectedValueOnce(new Error("picker unavailable secret"));
    await expect(log.saveToFile()).resolves.toBe("copied");
    expect(clipboard).toHaveBeenCalledTimes(2);

    await log.clear();
    await expect(log.getSummary()).resolves.toEqual({ eventCount: 0 });
    await expect(chrome.storage.local.get(DEBUG_LOG_STORAGE_KEY)).resolves.toEqual({
      [DEBUG_LOG_STORAGE_KEY]: { schemaVersion: 1, events: [] }
    });
  });

  it("throws only generic errors when clipboard and save fallback are unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    const log = new LocalDebugLog();
    log.record({ component: "runtime", event: "runtime.ready" });

    await expect(log.copyToClipboard()).rejects.toThrow("clipboard-unavailable");
    await expect(log.saveToFile()).rejects.toThrow("export-unavailable");
  });

  it("records global errors and rejections without messages, stacks, reasons or URLs", async () => {
    const log = new LocalDebugLog();
    await log.start();
    const cleanup = log.installGlobalCapture(() => "profile");
    const errorSecret = "secret-error-message";
    const stackSecret = "secret-stack-and-token";
    const rejectionSecret = "secret-rejection-reason";
    const fileSecret = "https://faceit.test/secret-source.js?token=secret";

    const error = new Error(errorSecret);
    error.stack = stackSecret;
    window.dispatchEvent(new ErrorEvent("error", {
      message: errorSecret,
      filename: fileSecret,
      error
    }));
    const rejection = new Event("unhandledrejection");
    Object.defineProperty(rejection, "reason", {
      value: { message: rejectionSecret, token: "secret-rejection-token" }
    });
    window.dispatchEvent(rejection);
    cleanup();

    const text = await log.exportText();
    const bundle = JSON.parse(text) as DebugBundle;
    expect(bundle.events.map((event) => event)).toEqual([
      expect.objectContaining({
        level: "error",
        component: "runtime",
        event: "runtime.error",
        route: "profile",
        errorCode: "unhandled"
      }),
      expect.objectContaining({
        level: "error",
        component: "runtime",
        event: "runtime.unhandled-rejection",
        route: "profile",
        errorCode: "unhandled"
      })
    ]);
    for (const canary of [
      errorSecret,
      stackSecret,
      rejectionSecret,
      fileSecret,
      "secret-rejection-token"
    ]) {
      expect(text).not.toContain(canary);
    }
  });
});
