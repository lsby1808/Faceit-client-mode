import type { PositionMessageMode } from "@eloscope/core";
import { findUniqueVisible, isVisible, type DomRoot } from "./dom";

const SENT_KEY = "eloscope:position-sends:v1";
const SENT_LIMIT = 2_000;
const SENT_LOCK = "eloscope:position-ledger:v1";
const CHAT_INPUT = [
  'textarea[data-testid="team-chat-input"]',
  'textarea[data-testid="chat-input"]',
  'input[data-testid="chat-input"]',
  '[data-eloscope-contract="team-chat-input"]',
  '[data-eloscope-contract="chat-input"]'
];
const CHAT_SEND = [
  'button[data-testid="team-chat-send"]',
  'button[data-testid="chat-send"]',
  'button[data-eloscope-contract="team-chat-send"]',
  'button[data-eloscope-contract="chat-send"]'
];
const MATCH_PREFERENCE = '[data-testid="matchPreference"]';
const MAP_VETO_HISTORY = '[data-testid="mapsVetoHistory"]';
const TEAM_LOG_PREFIX = "scrollable-container-team-";

export type PositionSendResult = "sent" | "prepared" | "duplicate" | "chat-unavailable" | "empty";

function cleanMapId(value: string | undefined): string | null {
  if (!value) return null;
  const map = value.normalize("NFKC").replace(/^de_/iu, "").trim().toLowerCase();
  return map.length > 0 && map.length <= 64 && /^[a-z0-9][a-z0-9_. -]*$/u.test(map) ? map : null;
}

function currentFaceitSelectedMap(root: DomRoot): HTMLElement | null {
  let preferences: NodeListOf<Element>;
  try {
    preferences = root.querySelectorAll(MATCH_PREFERENCE);
  } catch {
    return null;
  }
  const candidates = [...preferences].filter((element): element is HTMLElement =>
    isVisible(element) && Boolean(element.previousElementSibling?.querySelector(MAP_VETO_HISTORY))
  );
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

export function visibleSelectedMap(root: DomRoot): string | null {
  const declared = findUniqueVisible(root, [
    '[data-testid="selected-map"][data-map-id]',
    '[data-testid="map-voting-result"][data-map]',
    '[data-eloscope-contract="selected-map"][data-map-id]',
  ]);
  const declaredMap = cleanMapId(declared?.dataset.mapId ?? declared?.dataset.map);
  const faceitMap = cleanMapId(currentFaceitSelectedMap(root)?.textContent ?? undefined);
  if (declaredMap && faceitMap && declaredMap !== faceitMap) return null;
  return declaredMap ?? faceitMap;
}

export function isSelectedMapVisible(root: DomRoot, map: string): boolean {
  return visibleSelectedMap(root)?.toLowerCase() === map.toLowerCase();
}

async function digestKey(matchId: string, map: string, message: string): Promise<string> {
  const data = new TextEncoder().encode(`${matchId}\u0000${map}\u0000${message}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

type ChatTarget = {
  input: HTMLInputElement | HTMLTextAreaElement;
  scope: DomRoot;
  enterToSend: boolean;
};

type CurrentChatResolution = { observed: boolean; target: ChatTarget | null };

function faceitTeamChat(root: DomRoot, matchId: string): CurrentChatResolution {
  if (!/^[A-Za-z0-9-]{1,128}$/u.test(matchId)) return { observed: true, target: null };
  let logs: NodeListOf<Element>;
  try {
    logs = root.querySelectorAll('[id^="scrollable-container-"]');
  } catch {
    return { observed: true, target: null };
  }
  if (logs.length === 0) return { observed: false, target: null };
  const prefix = `${TEAM_LOG_PREFIX}${matchId}_`;
  const matching = [...logs].filter((element): element is HTMLElement => element instanceof HTMLElement && element.id.startsWith(prefix));
  if (matching.length !== 1) return { observed: true, target: null };

  let scope: HTMLElement | null = matching[0]?.parentElement ?? null;
  while (scope) {
    const inputs = [...scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'textarea[enterkeyhint="send"][aria-multiline="true"], input[enterkeyhint="send"]'
    )].filter(isVisible);
    if (inputs.length > 1) return { observed: true, target: null };
    const input = inputs[0];
    if (input) {
      const enterToSend = input.getAttribute("enterkeyhint")?.toLowerCase() === "send";
      return { observed: true, target: { input, scope, enterToSend } };
    }
    if (scope === root) break;
    scope = scope.parentElement;
  }
  return { observed: true, target: null };
}

function visibleTeamChat(root: DomRoot, matchId: string): ChatTarget | null {
  const current = faceitTeamChat(root, matchId);
  const declared = findUniqueVisible(root, CHAT_INPUT);
  if (declared && !(declared instanceof HTMLInputElement || declared instanceof HTMLTextAreaElement)) return null;
  if (current.observed) {
    if (!current.target || (declared && current.target.input !== declared)) return null;
    return current.target;
  }
  if (!declared) return null;
  const explicitScope = declared.closest<HTMLElement>(
    '[data-testid="team-chat"], [data-eloscope-contract="team-chat"]'
  );
  return {
    input: declared,
    scope: explicitScope ?? root,
    enterToSend: declared.getAttribute("enterkeyhint")?.toLowerCase() === "send"
  };
}

async function sendWithVisibleEnter(input: HTMLInputElement | HTMLTextAreaElement): Promise<boolean> {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    composed: true
  });
  input.dispatchEvent(event);
  input.dispatchEvent(new KeyboardEvent("keyup", {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    composed: true
  }));
  await Promise.resolve();
  if (input.value.length === 0) return true;
  if (typeof requestAnimationFrame !== "function") return false;
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return input.value.length === 0;
}

export class PositionSendLedger {
  readonly #memory = new Set<string>();
  readonly #reserved = new Set<string>();

  async has(key: string): Promise<boolean> {
    if (this.#memory.has(key)) return true;
    try {
      const stored = await chrome.storage.local.get(SENT_KEY);
      return Array.isArray(stored[SENT_KEY]) && stored[SENT_KEY].includes(key);
    } catch {
      return false;
    }
  }

  async reserve(key: string): Promise<boolean> {
    if (this.#memory.has(key) || this.#reserved.has(key)) return false;
    this.#reserved.add(key);
    try {
      const stored = await chrome.storage.local.get(SENT_KEY);
      const old = Array.isArray(stored[SENT_KEY])
        ? stored[SENT_KEY].filter((item): item is string => typeof item === "string")
        : [];
      if (old.includes(key)) {
        this.#memory.add(key);
        this.#reserved.delete(key);
        return false;
      }
      const next = [...old, key].slice(-SENT_LIMIT);
      // Persist a durable pending marker before any chat mutation/click. A
      // crash after this point remains fail-closed and deduplicated.
      await chrome.storage.local.set({ [SENT_KEY]: next });
      this.#memory.add(key);
      return true;
    } catch (error) {
      this.#reserved.delete(key);
      throw error;
    }
  }

  async release(key: string): Promise<void> {
    this.#reserved.delete(key);
    try {
      const stored = await chrome.storage.local.get(SENT_KEY);
      const old = Array.isArray(stored[SENT_KEY])
        ? stored[SENT_KEY].filter((item): item is string => typeof item === "string")
        : [];
      await chrome.storage.local.set({
        [SENT_KEY]: old.filter((item) => item !== key)
      });
      this.#memory.delete(key);
    } catch {
      // If durable cleanup cannot be confirmed, keep the in-memory pending
      // marker too. A false duplicate is safer than a second chat send.
      this.#memory.add(key);
    }
  }

  async commit(key: string): Promise<void> {
    this.#reserved.delete(key);
    this.#memory.add(key);
  }
}

export class QuickPositionSender {
  constructor(private readonly ledger = new PositionSendLedger()) {}

  async send(
    root: DomRoot,
    matchId: string,
    map: string,
    message: string,
    mode: PositionMessageMode,
    signal?: AbortSignal
  ): Promise<PositionSendResult> {
    const clean = message.trim().slice(0, 280);
    if (!clean) return "empty";
    const key = await digestKey(matchId, map, clean);
    if (signal?.aborted) return "chat-unavailable";

    if (mode === "prefill") return this.#prepare(root, matchId, clean, signal);

    const locks = typeof navigator.locks?.request === "function" ? navigator.locks : null;
    if (!locks) return this.#prepare(root, matchId, clean, signal);

    try {
      return await locks.request(
        SENT_LOCK,
        { mode: "exclusive", ...(signal ? { signal } : {}) },
        () => this.#sendLocked(root, matchId, clean, key, signal)
      );
    } catch {
      return signal?.aborted
        ? "chat-unavailable"
        : this.#prepare(root, matchId, clean, signal);
    }
  }

  #prepare(
    root: DomRoot,
    matchId: string,
    clean: string,
    signal?: AbortSignal
  ): PositionSendResult {
    if (signal?.aborted) return "chat-unavailable";
    const chat = visibleTeamChat(root, matchId);
    if (!chat) return "chat-unavailable";
    if (signal?.aborted) return "chat-unavailable";
    setInputValue(chat.input, clean);
    chat.input.focus();
    return "prepared";
  }

  async #sendLocked(
    root: DomRoot,
    matchId: string,
    clean: string,
    key: string,
    signal?: AbortSignal
  ): Promise<PositionSendResult> {
    let reserved = false;
    let attemptedSend = false;
    try {
      if (signal?.aborted) return "chat-unavailable";
      const chat = visibleTeamChat(root, matchId);
      if (!chat) return "chat-unavailable";
      const { input } = chat;

      reserved = await this.ledger.reserve(key);
      if (signal?.aborted) {
        if (reserved) await this.ledger.release(key);
        return "chat-unavailable";
      }
      if (!reserved) return "duplicate";

      if (signal?.aborted) {
        await this.ledger.release(key);
        return "chat-unavailable";
      }
      setInputValue(input, clean);
      input.focus();
      await Promise.resolve();

      if (signal?.aborted) {
        await this.ledger.release(key);
        return "prepared";
      }

      const send = findUniqueVisible(chat.scope, CHAT_SEND);
      if (!(send instanceof HTMLButtonElement) && !chat.enterToSend) {
        await this.ledger.release(key);
        return "prepared";
      }
      if (signal?.aborted) {
        await this.ledger.release(key);
        return "prepared";
      }
      attemptedSend = true;
      const sent = send instanceof HTMLButtonElement
        ? (send.click(), true)
        : await sendWithVisibleEnter(input);
      if (!sent) {
        // Enter was dispatched, so the outcome is ambiguous. Retain the
        // durable pending marker and never risk a second send.
        await this.ledger.commit(key);
        return "prepared";
      }
      await this.ledger.commit(key);
      return "sent";
    } catch {
      if (reserved && !attemptedSend) await this.ledger.release(key);
      if (signal?.aborted) return "chat-unavailable";
      return this.#prepare(root, matchId, clean, signal);
    }
  }
}
