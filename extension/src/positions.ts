import type { PositionMessageMode } from "@eloscope/core";
import { findUniqueVisible, type DomRoot } from "./dom";

const SENT_KEY = "eloscope:position-sends:v1";
const SENT_LIMIT = 2_000;
const CHAT_INPUT = [
  'textarea[data-testid="chat-input"]',
  'input[data-testid="chat-input"]',
  '[data-eloscope-contract="chat-input"]'
];
const CHAT_SEND = [
  'button[data-testid="chat-send"]',
  'button[data-eloscope-contract="chat-send"]'
];

export type PositionSendResult = "sent" | "prepared" | "duplicate" | "chat-unavailable" | "empty";

export function visibleSelectedMap(root: DomRoot): string | null {
  const target = findUniqueVisible(root, [
    '[data-testid="selected-map"][data-map-id]',
    '[data-testid="map-voting-result"][data-map]',
    '[data-eloscope-contract="selected-map"][data-map-id]',
  ]);
  const map = target?.dataset.mapId ?? target?.dataset.map;
  return map && /^[A-Za-z0-9_. -]{1,64}$/u.test(map) ? map : null;
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
    if (await this.has(key)) {
      this.#reserved.delete(key);
      return false;
    }
    return true;
  }

  release(key: string): void {
    this.#reserved.delete(key);
  }

  async commit(key: string): Promise<void> {
    this.#reserved.delete(key);
    this.#memory.add(key);
    try {
      const stored = await chrome.storage.local.get(SENT_KEY);
      const old = Array.isArray(stored[SENT_KEY]) ? stored[SENT_KEY].filter((item): item is string => typeof item === "string") : [];
      const next = [...old.filter((item) => item !== key), key].slice(-SENT_LIMIT);
      await chrome.storage.local.set({ [SENT_KEY]: next });
    } catch {
      // Memory dedupe remains active when extension storage is unavailable.
    }
  }
}

export class QuickPositionSender {
  constructor(private readonly ledger = new PositionSendLedger()) {}

  async send(
    root: DomRoot,
    matchId: string,
    map: string,
    message: string,
    mode: PositionMessageMode
  ): Promise<PositionSendResult> {
    const clean = message.trim().slice(0, 280);
    if (!clean) return "empty";
    const key = await digestKey(matchId, map, clean);

    const input = findUniqueVisible(root, CHAT_INPUT);
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return "chat-unavailable";
    setInputValue(input, clean);
    input.focus();
    if (mode === "prefill") return "prepared";

    if (!(await this.ledger.reserve(key))) return "duplicate";

    const send = findUniqueVisible(root, CHAT_SEND);
    if (!(send instanceof HTMLButtonElement)) {
      this.ledger.release(key);
      return "prepared";
    }
    try {
      send.click();
      await this.ledger.commit(key);
      return "sent";
    } catch {
      this.ledger.release(key);
      return "prepared";
    }
  }
}
