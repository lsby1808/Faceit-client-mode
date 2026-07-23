import type {
  AutomationSettings,
  MapId,
  PositionMessageMode,
  StatsWindow
} from "@eloscope/core";
import type { DomRoot } from "./dom";
import { debugLog } from "./debug-log";
import { visibleSelectedMap } from "./positions";
import { requestNativeShellSettings } from "./shell-settings-bridge";
import {
  loadSettings,
  parseSettings,
  saveSettings,
  settingsWithPositionMaps,
  STATS_WINDOWS,
  type ExtensionSettings,
  type ShellSettings
} from "./settings";

export const SETTINGS_PANEL_HOST_ID = "eloscope-settings-root";

const DIALOG_ID = "eloscope-settings-dialog";
const TITLE_ID = "eloscope-settings-title";
const DESCRIPTION_ID = "eloscope-settings-description";

type SettingsSectionId =
  | "general"
  | "match-room"
  | "automations"
  | "positions"
  | "diagnostics";

const SETTINGS_SECTIONS: ReadonlyArray<Readonly<{
  id: SettingsSectionId;
  icon: string;
  title: string;
  description: string;
}>> = [
  {
    id: "general",
    icon: "⌂",
    title: "Общие",
    description: "Данные, профиль и уровни",
  },
  {
    id: "match-room",
    icon: "◎",
    title: "Матч-комната",
    description: "Игроки, команды и карты",
  },
  {
    id: "automations",
    icon: "⚡",
    title: "Автоматизации",
    description: "Ready-up, veto и connect",
  },
  {
    id: "positions",
    icon: "✦",
    title: "Быстрые позиции",
    description: "Сообщения для каждой карты",
  },
  {
    id: "diagnostics",
    icon: "≡",
    title: "Диагностика",
    description: "Локальный журнал действий",
  },
];

const PANEL_STYLES = `
:host {
  --es-settings-accent: #ff5b19;
  --es-settings-accent-strong: #ff7138;
  --es-settings-bg: #0d0f12;
  --es-settings-panel: #14171c;
  --es-settings-card: #1a1e24;
  --es-settings-line: rgba(255, 255, 255, .11);
  --es-settings-text: #f5f7fa;
  --es-settings-muted: #a5adb8;
  --es-settings-danger: #ff6d82;
  color: var(--es-settings-text);
  font: 13px/1.45 Inter, "Segoe UI", Arial, sans-serif;
}
* { box-sizing: border-box; }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: wait; opacity: .58; }
.es-settings-launcher {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483638;
  display: grid;
  width: 50px;
  height: 50px;
  padding: 0;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, var(--es-settings-accent-strong), #d63e05);
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 15px;
  box-shadow: 0 12px 34px rgba(0,0,0,.58), inset 0 1px rgba(255,255,255,.16);
  transition: transform .16s ease, box-shadow .16s ease;
}
.es-settings-launcher:hover { transform: translateY(-2px); box-shadow: 0 16px 38px rgba(0,0,0,.68), inset 0 1px rgba(255,255,255,.18); }
.es-settings-launcher:focus-visible,
.es-settings-close:focus-visible,
.es-settings-button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.es-settings-mark { font-size: 20px; font-weight: 950; letter-spacing: -.08em; transform: translateX(-1px); }
.es-settings-cog {
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 12px;
  height: 12px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #b62f00;
  box-shadow: 0 0 0 2px #b62f00;
}
.es-settings-backdrop[hidden] { display: none; }
.es-settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483639;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, .76);
  backdrop-filter: blur(7px);
}
.es-settings-dialog {
  display: grid;
  width: min(1060px, 100%);
  height: min(790px, calc(100vh - 48px));
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  overscroll-behavior: contain;
  color: var(--es-settings-text);
  background:
    radial-gradient(circle at 72% -20%, rgba(255, 91, 25, .11), transparent 36%),
    var(--es-settings-bg);
  border: 1px solid var(--es-settings-line);
  border-radius: 20px;
  box-shadow: 0 28px 90px rgba(0,0,0,.78);
}
.es-settings-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  background: rgba(13,15,18,.94);
  border-bottom: 1px solid var(--es-settings-line);
}
.es-settings-brand { display: grid; width: 42px; height: 42px; flex: 0 0 auto; place-items: center; border-radius: 13px; background: linear-gradient(145deg, #ff7138, #e74809); box-shadow: 0 8px 20px rgba(255,91,25,.24); font-size: 18px; font-weight: 950; }
.es-settings-heading { min-width: 0; flex: 1; }
.es-settings-heading h2 { margin: 0; font-size: 19px; line-height: 1.25; letter-spacing: -.015em; }
.es-settings-heading p { margin: 4px 0 0; color: var(--es-settings-muted); font-size: 12px; }
.es-settings-close {
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  flex: 0 0 auto;
  place-items: center;
  color: var(--es-settings-text);
  background: var(--es-settings-card);
  border: 1px solid var(--es-settings-line);
  border-radius: 10px;
  font-size: 22px;
  line-height: 1;
}
.es-settings-form {
  display: grid;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr) auto auto;
}
.es-settings-workspace {
  display: grid;
  min-height: 0;
  grid-template-columns: 224px minmax(0, 1fr);
}
.es-settings-nav {
  min-width: 0;
  overflow: auto;
  padding: 16px 12px;
  background: rgba(8, 10, 13, .7);
  border-right: 1px solid var(--es-settings-line);
}
.es-settings-nav-title {
  margin: 0 9px 9px;
  color: #777f8b;
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.es-settings-nav-button {
  display: grid;
  width: 100%;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  margin: 3px 0;
  padding: 10px;
  color: #c9cfd7;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 11px;
  transition: color .14s ease, background .14s ease, border-color .14s ease;
}
.es-settings-nav-button:hover {
  color: #fff;
  background: rgba(255, 255, 255, .045);
}
.es-settings-nav-button[aria-selected="true"] {
  color: #fff;
  background: linear-gradient(90deg, rgba(255,91,25,.18), rgba(255,91,25,.055));
  border-color: rgba(255, 91, 25, .32);
}
.es-settings-nav-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  color: #c9cfd7;
  background: #171b20;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 9px;
  font-size: 15px;
  font-weight: 900;
}
.es-settings-nav-button[aria-selected="true"] .es-settings-nav-icon {
  color: #fff;
  background: var(--es-settings-accent);
  border-color: transparent;
}
.es-settings-nav-copy { min-width: 0; }
.es-settings-nav-copy strong,
.es-settings-nav-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.es-settings-nav-copy strong { font-size: 12px; }
.es-settings-nav-copy small { margin-top: 2px; color: #858e9a; font-size: 10px; }
.es-settings-content {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 20px 22px 26px;
}
.es-settings-page[hidden] { display: none; }
.es-settings-page-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0 0 18px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255,255,255,.075);
}
.es-settings-page-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  color: #ff9a6a;
  background: rgba(255,91,25,.1);
  border: 1px solid rgba(255,91,25,.25);
  border-radius: 11px;
  font-size: 18px;
  font-weight: 900;
}
.es-settings-page-copy h3 { margin: 0; color: #fff; font-size: 17px; line-height: 1.25; }
.es-settings-page-copy p { margin: 4px 0 0; color: var(--es-settings-muted); font-size: 11px; }
.es-settings-fieldset { min-width: 0; margin: 0 0 18px; padding: 0; border: 0; }
.es-settings-fieldset:last-child { margin-bottom: 0; }
.es-settings-legend { width: 100%; margin: 0 0 9px; color: #d8dde4; font-size: 10px; font-weight: 850; letter-spacing: .11em; text-transform: uppercase; }
.es-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.es-settings-grid + .es-settings-grid { margin-top: 10px; }
.es-settings-row,
.es-settings-stack,
.es-position-card {
  min-width: 0;
  padding: 13px 14px;
  background: linear-gradient(145deg, rgba(25,29,35,.98), rgba(19,22,27,.98));
  border: 1px solid var(--es-settings-line);
  border-radius: 12px;
}
.es-settings-row { display: flex; min-height: 72px; align-items: center; gap: 14px; }
.es-settings-row--master {
  margin-bottom: 10px;
  background: linear-gradient(110deg, rgba(255,91,25,.15), rgba(24,28,34,.98) 50%);
  border-color: rgba(255,91,25,.38);
}
.es-settings-copy { min-width: 0; flex: 1; }
.es-settings-copy strong { display: block; color: #fff; font-size: 12px; line-height: 1.35; }
.es-settings-copy small,
.es-settings-help { display: block; margin-top: 4px; color: var(--es-settings-muted); font-size: 10.5px; line-height: 1.45; }
.es-settings-control,
.es-settings-text,
.es-settings-textarea {
  width: 100%;
  color: var(--es-settings-text);
  background: #0d0f13;
  border: 1px solid var(--es-settings-line);
  border-radius: 9px;
  padding: 8px 9px;
}
.es-settings-row > .es-settings-control { width: auto; min-width: 122px; }
.es-settings-textarea { min-height: 68px; margin-top: 8px; resize: vertical; }
.es-settings-switch { position: relative; display: inline-flex; width: 44px; height: 25px; flex: 0 0 auto; }
.es-settings-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.es-settings-switch span { width: 100%; border: 1px solid var(--es-settings-line); border-radius: 999px; background: #343a43; transition: background .14s ease; }
.es-settings-switch span::after { content: ""; position: absolute; top: 4px; left: 4px; width: 17px; height: 17px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.42); transition: transform .14s ease; }
.es-settings-switch input:checked + span { background: var(--es-settings-accent); }
.es-settings-switch input:checked + span::after { transform: translateX(19px); }
.es-settings-switch input:focus-visible + span { outline: 2px solid #fff; outline-offset: 2px; }
.es-settings-stack label { display: block; margin-bottom: 6px; color: #fff; font-weight: 750; }
.es-settings-warning { margin: 0 0 10px; padding: 11px 13px; color: #ffd7c4; background: rgba(255,91,25,.08); border: 1px solid rgba(255,91,25,.25); border-radius: 11px; font-size: 10.5px; }
.es-position-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.es-position-card[data-enabled="true"] { border-color: rgba(255,91,25,.55); box-shadow: inset 0 0 0 1px rgba(255,91,25,.12); }
.es-position-head { display: flex; align-items: center; gap: 8px; }
.es-position-name { min-width: 0; flex: 1; overflow: hidden; color: #fff; font-weight: 850; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.es-position-remove { padding: 4px 7px; color: var(--es-settings-muted); background: transparent; border: 1px solid var(--es-settings-line); border-radius: 7px; }
.es-position-controls { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; margin-top: 8px; align-items: center; }
.es-position-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 9px; }
.es-settings-button { padding: 8px 12px; color: var(--es-settings-text); background: var(--es-settings-card); border: 1px solid var(--es-settings-line); border-radius: 9px; font-weight: 750; }
.es-settings-button--primary { color: #fff; background: var(--es-settings-accent); border-color: transparent; }
.es-settings-button--danger { color: var(--es-settings-danger); }
.es-diagnostics-card { display: grid; gap: 10px; }
.es-diagnostics-summary {
  padding: 9px 10px;
  color: #dce4ed;
  background: #0d0f13;
  border: 1px solid var(--es-settings-line);
  border-radius: 9px;
  font-variant-numeric: tabular-nums;
}
.es-diagnostics-summary[data-error="true"] { color: var(--es-settings-danger); }
.es-diagnostics-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.es-diagnostics-status {
  min-height: 17px;
  color: var(--es-settings-muted);
  font-size: 11px;
}
.es-diagnostics-status[data-error="true"] { color: var(--es-settings-danger); }
.es-settings-footer { display: flex; align-items: center; gap: 8px; padding: 13px 18px; background: rgba(13,15,18,.98); border-top: 1px solid var(--es-settings-line); }
.es-settings-status { min-width: 0; flex: 1; color: var(--es-settings-muted); font-size: 11px; }
.es-settings-status[data-error="true"] { color: var(--es-settings-danger); }
.es-settings-disclaimer { margin: 0; padding: 8px 18px; color: #858e9a; background: rgba(8,10,13,.52); border-top: 1px solid rgba(255,255,255,.055); font-size: 9.5px; }
.es-visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 760px) {
  .es-settings-backdrop { padding: 10px; }
  .es-settings-dialog { height: calc(100vh - 20px); border-radius: 14px; }
  .es-settings-workspace { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .es-settings-nav {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 9px 10px;
    border-right: 0;
    border-bottom: 1px solid var(--es-settings-line);
  }
  .es-settings-nav-title { display: none; }
  .es-settings-nav-button {
    width: auto;
    min-width: max-content;
    grid-template-columns: 28px auto;
    margin: 0;
    padding: 7px 9px;
  }
  .es-settings-nav-icon { width: 28px; height: 28px; }
  .es-settings-nav-copy small { display: none; }
  .es-settings-content { padding: 15px 13px 20px; }
  .es-settings-grid, .es-position-list { grid-template-columns: 1fr; }
  .es-settings-header { padding: 13px; }
  .es-settings-footer { padding: 11px 13px; }
  .es-settings-disclaimer { padding-inline: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
`;

export type DiagnosticsPanelPort = {
  getSummary(): Promise<{ eventCount: number; oldestAt?: number; newestAt?: number }>;
  copyToClipboard(): Promise<number>;
  saveToFile(): Promise<"saved" | "copied">;
  clear(): Promise<void>;
};

export type ShellSettingsPanelPort = {
  apply(settings: ShellSettings, gesture?: string): boolean;
};

export type SettingsPanelOptions = {
  onSaved?: (settings: ExtensionSettings) => void | Promise<void>;
  mapIds?: () => readonly MapId[];
  diagnostics?: DiagnosticsPanelPort;
  shell?: ShellSettingsPanelPort;
};

type Focusable = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function describedText(title: string, description: string): HTMLElement {
  const copy = node("span", "es-settings-copy");
  copy.append(node("strong", undefined, title), node("small", undefined, description));
  return copy;
}

function splitOrder(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 32);
}

function uniqueMapIds(values: readonly string[]): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function formatDiagnosticDate(value: number | undefined): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function diagnosticSummaryText(summary: {
  eventCount: number;
  oldestAt?: number;
  newestAt?: number;
}): string {
  const rawEventCount = Math.trunc(summary.eventCount);
  const eventCount = Number.isFinite(rawEventCount) ? Math.max(0, rawEventCount) : 0;
  if (eventCount === 0) return "Событий пока нет";
  const oldest = formatDiagnosticDate(summary.oldestAt);
  const newest = formatDiagnosticDate(summary.newestAt);
  if (oldest && newest) return `${eventCount} событий · ${oldest} — ${newest}`;
  if (newest) return `${eventCount} событий · последнее: ${newest}`;
  return `${eventCount} событий`;
}

export function discoverVisibleMapIds(root: DomRoot = document): MapId[] {
  const maps: string[] = [];
  const selectedMap = visibleSelectedMap(root);
  if (selectedMap) maps.push(selectedMap);
  for (const element of root.querySelectorAll<HTMLElement>("[data-map-id]")) {
    const value = element.dataset.mapId;
    if (value) maps.push(value);
  }
  for (const element of root.querySelectorAll<HTMLElement>('[data-testid^="veto-map-"]')) {
    const value = element.dataset.testid?.slice("veto-map-".length).split("-")[0];
    if (value) maps.push(value);
  }
  return uniqueMapIds(maps);
}

export class EloScopeSettingsPanel {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly launcher: HTMLButtonElement;

  readonly #backdrop: HTMLDivElement;
  readonly #options: SettingsPanelOptions;
  readonly #diagnostics: DiagnosticsPanelPort;
  readonly #shell: ShellSettingsPanelPort;
  #draft: ExtensionSettings | undefined;
  #activeSection: SettingsSectionId = "general";
  #opening = false;
  #saving = false;

  constructor(options: SettingsPanelOptions = {}) {
    this.#options = options;
    this.#diagnostics = options.diagnostics ?? debugLog;
    this.#shell = options.shell ?? { apply: requestNativeShellSettings };
    this.host = node("div");
    this.host.id = SETTINGS_PANEL_HOST_ID;
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = node("style");
    style.textContent = PANEL_STYLES;
    this.launcher = node("button", "es-settings-launcher") as HTMLButtonElement;
    this.launcher.type = "button";
    this.launcher.title = "Настройки EloScope";
    this.launcher.setAttribute("aria-label", "Открыть настройки EloScope");
    this.launcher.setAttribute("aria-haspopup", "dialog");
    this.launcher.setAttribute("aria-controls", DIALOG_ID);
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.append(
      node("span", "es-settings-mark", "E"),
      node("span", "es-settings-cog")
    );
    this.launcher.lastElementChild?.setAttribute("aria-hidden", "true");

    this.#backdrop = node("div", "es-settings-backdrop") as HTMLDivElement;
    this.#backdrop.hidden = true;
    this.#backdrop.addEventListener("click", (event) => {
      if (event.target === this.#backdrop && !this.#saving) this.close();
    });
    this.launcher.addEventListener("click", () => {
      void this.open();
    });
    this.host.addEventListener("keydown", this.#onKeyDown);
    this.shadow.append(style, this.launcher, this.#backdrop);
  }

  mount(target: HTMLElement = document.documentElement): void {
    if (this.host.isConnected) return;
    if (document.getElementById(SETTINGS_PANEL_HOST_ID)) return;
    target.append(this.host);
  }

  destroy(): void {
    this.host.removeEventListener("keydown", this.#onKeyDown);
    this.host.remove();
  }

  get isOpen(): boolean {
    return !this.#backdrop.hidden;
  }

  async open(): Promise<void> {
    if (this.#opening || this.isOpen) return;
    this.#opening = true;
    this.launcher.disabled = true;
    try {
      const loaded = await loadSettings();
      const suppliedMaps = this.#options.mapIds?.();
      this.#draft = settingsWithPositionMaps(
        loaded,
        suppliedMaps?.length ? suppliedMaps : discoverVisibleMapIds()
      );
      this.#renderDialog();
      this.#backdrop.hidden = false;
      this.launcher.tabIndex = -1;
      this.launcher.setAttribute("aria-expanded", "true");
      const dialog = this.shadow.getElementById(DIALOG_ID) as HTMLElement | null;
      dialog?.focus();
    } finally {
      this.#opening = false;
      this.launcher.disabled = false;
    }
  }

  close(): void {
    if (!this.isOpen || this.#saving) return;
    this.#backdrop.hidden = true;
    this.#backdrop.replaceChildren();
    this.launcher.tabIndex = 0;
    this.launcher.setAttribute("aria-expanded", "false");
    this.launcher.focus();
  }

  #renderDialog(): void {
    const draft = this.#draft;
    if (!draft) return;

    const dialog = node("section", "es-settings-dialog");
    dialog.id = DIALOG_ID;
    dialog.tabIndex = -1;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", TITLE_ID);
    dialog.setAttribute("aria-describedby", DESCRIPTION_ID);

    const header = node("header", "es-settings-header");
    const brand = node("span", "es-settings-brand", "E");
    brand.setAttribute("aria-hidden", "true");
    const heading = node("div", "es-settings-heading");
    const title = node("h2", undefined, "Настройки EloScope");
    title.id = TITLE_ID;
    const description = node(
      "p",
      undefined,
      "Настройте интерфейс под себя — от карточек игроков до безопасных автоматизаций"
    );
    description.id = DESCRIPTION_ID;
    heading.append(title, description);
    const close = node("button", "es-settings-close", "×") as HTMLButtonElement;
    close.type = "button";
    close.title = "Закрыть";
    close.setAttribute("aria-label", "Закрыть настройки");
    close.addEventListener("click", () => this.close());
    header.append(brand, heading, close);

    const form = node("form", "es-settings-form") as HTMLFormElement;
    form.noValidate = true;
    const workspace = node("div", "es-settings-workspace");
    const navigation = node("nav", "es-settings-nav");
    navigation.setAttribute("aria-label", "Разделы настроек");
    navigation.setAttribute("role", "tablist");
    navigation.append(node("p", "es-settings-nav-title", "Разделы"));
    const content = node("div", "es-settings-content");
    const pages = new Map<SettingsSectionId, HTMLElement>([
      ["general", this.#settingsPage(
        "general",
        this.#generalSection(draft),
      )],
      ["match-room", this.#settingsPage(
        "match-room",
        this.#matchRoomSection(draft),
      )],
      ["automations", this.#settingsPage(
        "automations",
        this.#automationSection(draft),
      )],
      ["positions", this.#settingsPage(
        "positions",
        this.#positionsSection(draft),
      )],
      ["diagnostics", this.#settingsPage(
        "diagnostics",
        this.#diagnosticsSection(),
      )],
    ]);
    for (const section of SETTINGS_SECTIONS) {
      const button = node("button", "es-settings-nav-button") as HTMLButtonElement;
      button.type = "button";
      button.id = `eloscope-settings-tab-${section.id}`;
      button.dataset.section = section.id;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", `eloscope-settings-page-${section.id}`);
      button.setAttribute("aria-selected", String(section.id === this.#activeSection));
      const icon = node("span", "es-settings-nav-icon", section.icon);
      icon.setAttribute("aria-hidden", "true");
      const copy = node("span", "es-settings-nav-copy");
      copy.append(
        node("strong", undefined, section.title),
        node("small", undefined, section.description),
      );
      button.append(icon, copy);
      button.addEventListener("click", () => this.#activateSection(section.id));
      navigation.append(button);
      const page = pages.get(section.id);
      if (page) content.append(page);
    }
    workspace.append(navigation, content);
    form.append(workspace);

    const disclaimer = node(
      "p",
      "es-settings-disclaimer",
      "Все автоматизации выключены по умолчанию и используют только однозначные видимые элементы FACEIT. EloScope — независимый продукт."
    );
    const footer = node("footer", "es-settings-footer");
    const status = node("div", "es-settings-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const cancel = node("button", "es-settings-button", "Отмена") as HTMLButtonElement;
    cancel.type = "button";
    cancel.addEventListener("click", () => this.close());
    const reset = node("button", "es-settings-button", "По умолчанию") as HTMLButtonElement;
    reset.type = "button";
    reset.dataset.testid = "settings-reset";
    reset.addEventListener("click", () => {
      this.#draft = settingsWithPositionMaps(
        parseSettings(undefined),
        this.#options.mapIds?.() ?? discoverVisibleMapIds(),
      );
      this.#renderDialog();
      this.shadow
        .querySelector<HTMLButtonElement>('[data-testid="settings-reset"]')
        ?.focus();
    });
    const save = node(
      "button",
      "es-settings-button es-settings-button--primary",
      "Сохранить"
    ) as HTMLButtonElement;
    save.type = "submit";
    save.dataset.eloscopeSettingsSave = "true";
    footer.append(status, reset, cancel, save);
    form.append(disclaimer, footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#save(status, cancel, save);
    });

    dialog.append(header, form);
    this.#backdrop.replaceChildren(dialog);
  }

  #settingsPage(id: SettingsSectionId, ...children: HTMLElement[]): HTMLElement {
    const section = SETTINGS_SECTIONS.find((entry) => entry.id === id);
    if (!section) throw new Error(`Unknown settings section: ${id}`);
    const page = node("section", "es-settings-page");
    page.id = `eloscope-settings-page-${id}`;
    page.dataset.section = id;
    page.hidden = id !== this.#activeSection;
    page.setAttribute("role", "tabpanel");
    page.setAttribute("aria-labelledby", `eloscope-settings-tab-${id}`);
    const head = node("header", "es-settings-page-head");
    const icon = node("span", "es-settings-page-icon", section.icon);
    icon.setAttribute("aria-hidden", "true");
    const copy = node("div", "es-settings-page-copy");
    copy.append(
      node("h3", undefined, section.title),
      node("p", undefined, section.description),
    );
    head.append(icon, copy);
    page.append(head, ...children);
    return page;
  }

  #activateSection(id: SettingsSectionId): void {
    this.#activeSection = id;
    this.shadow.querySelectorAll<HTMLButtonElement>(".es-settings-nav-button").forEach((button) => {
      const selected = button.dataset.section === id;
      button.setAttribute("aria-selected", String(selected));
    });
    this.shadow.querySelectorAll<HTMLElement>(".es-settings-page").forEach((page) => {
      page.hidden = page.dataset.section !== id;
    });
    this.shadow.querySelector<HTMLElement>(".es-settings-content")?.scrollTo({ top: 0 });
  }

  #windowSelect(
    label: string,
    current: StatsWindow,
    onChange: (value: StatsWindow) => void,
  ): HTMLSelectElement {
    const select = node("select", "es-settings-control") as HTMLSelectElement;
    select.setAttribute("aria-label", label);
    for (const value of STATS_WINDOWS) {
      const option = node("option") as HTMLOptionElement;
      option.value = String(value);
      option.textContent = `${value} матчей`;
      option.selected = value === current;
      select.append(option);
    }
    select.value = String(current);
    select.addEventListener("change", () => onChange(Number(select.value) as StatsWindow));
    return select;
  }

  #generalSection(settings: ExtensionSettings): HTMLElement {
    const wrapper = node("div");
    const app = this.#fieldset("Приложение Windows");
    const appGrid = node("div", "es-settings-grid");
    appGrid.append(
      this.#switchRow(
        "Запускать вместе с Windows",
        "Добавляет EloScope в автозапуск Windows. Если трей включён, клиент стартует свернутым.",
        settings.shell.autostart,
        "shell-autostart",
        (checked) => {
          if (!this.#draft) return;
          this.#draft = {
            ...this.#draft,
            shell: { ...this.#draft.shell, autostart: checked }
          };
        },
      ),
      this.#switchRow(
        "Сворачивать в системный трей",
        "Кнопки свернуть и закрыть будут прятать окно. Полный выход доступен из меню трея.",
        settings.shell.minimizeToTray,
        "shell-minimize-to-tray",
        (checked) => {
          if (!this.#draft) return;
          this.#draft = {
            ...this.#draft,
            shell: { ...this.#draft.shell, minimizeToTray: checked }
          };
        },
      ),
    );
    app.append(appGrid);

    const profile = this.#fieldset("Профиль и уровни");
    const grid = node("div", "es-settings-grid");
    grid.append(this.#controlRow(
      "Окно статистики профиля",
      "Количество последних завершённых CS2 5v5 матчей в баннере профиля",
      this.#windowSelect("Окно статистики профиля", settings.profileStatsWindow, (value) => {
        if (this.#draft) this.#draft = { ...this.#draft, profileStatsWindow: value };
      }),
    ));
    grid.append(this.#switchRow(
      "Статистика в профиле",
      "Встроенный баннер с обзором, боевыми показателями, картами и ролью игрока",
      settings.interfaceVisibility.profileStatsBanner,
      "visibility-profileStatsBanner",
      (checked) => {
        if (!this.#draft) return;
        this.#draft = {
          ...this.#draft,
          interfaceVisibility: {
            ...this.#draft.interfaceVisibility,
            profileStatsBanner: checked,
          },
        };
      },
    ));
    grid.append(this.#switchRow(
      "Расширенная шкала 1–20",
      "Уровни 11–20 заменяют штатную иконку в matchmaking, профиле и матч-комнате; официальный level остаётся в подсказке",
      settings.showExtendedTier,
      "show-extended-tier",
      (checked) => {
        if (this.#draft) this.#draft = { ...this.#draft, showExtendedTier: checked };
      },
    ));
    profile.append(grid);
    wrapper.append(app, profile);
    return wrapper;
  }

  #matchRoomSection(settings: ExtensionSettings): HTMLElement {
    const wrapper = node("div");
    const master = this.#switchRow(
      "Расширения матч-комнаты",
      "Главный переключатель карточек игроков, командной аналитики и сравнения карт",
      settings.interfaceVisibility.matchRoom,
      "visibility-matchRoom",
      (checked) => {
        if (!this.#draft) return;
        this.#draft = {
          ...this.#draft,
          interfaceVisibility: {
            ...this.#draft.interfaceVisibility,
            matchRoom: checked,
          },
        };
      },
    );
    master.classList.add("es-settings-row--master");
    wrapper.append(master);

    const players = this.#fieldset("Игроки");
    const playerGrid = node("div", "es-settings-grid");
    playerGrid.append(this.#controlRow(
      "Окно статистики игроков",
      "Выборка для WR, AVG KILLS, K/D, K/R, ADR и командной формы",
      this.#windowSelect("Окно статистики", settings.statsWindow, (value) => {
        if (this.#draft) this.#draft = { ...this.#draft, statsWindow: value };
      }),
    ));
    playerGrid.append(
      this.#switchRow(
        "Расширенная статистика",
        "Карточка MATCHES, WR, AVG KILLS, K/D, K/R и ADR под каждым игроком",
        settings.showPlayerStats,
        "show-player-stats",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showPlayerStats: checked };
        },
      ),
      this.#switchRow(
        "Батарейка формы",
        "Текущая игровая форма рядом с ником и подробный расчёт при наведении",
        settings.showPlayerFormBattery,
        "show-player-form-battery",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showPlayerFormBattery: checked };
        },
      ),
      this.#switchRow(
        "Роли игроков",
        "Роль вместо аватара и пять оценок при наведении; расчёт по 20 матчам",
        settings.showPlayerRoles,
        "show-player-roles",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showPlayerRoles: checked };
        },
      ),
      this.#switchRow(
        "Встречи с игроками",
        "Сколько раз играли вместе или против, результаты и последние встречи в подсказке",
        settings.showPlayerEncounters,
        "show-player-encounters",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showPlayerEncounters: checked };
        },
      ),
      this.#switchRow(
        "Серии побед и поражений",
        "Текущая зелёная или красная серия рядом с ником игрока",
        settings.showPlayerStreak,
        "show-player-streak",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showPlayerStreak: checked };
        },
      ),
    );
    players.append(playerGrid);

    const teams = this.#fieldset("Команды и карты");
    const teamGrid = node("div", "es-settings-grid");
    teamGrid.append(
      this.#switchRow(
        "Средний ELO команд",
        "AVG ELO каждого состава по краям заголовка матч-комнаты",
        settings.showTeamAverageElo,
        "show-team-average-elo",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showTeamAverageElo: checked };
        },
      ),
      this.#switchRow(
        "Прогноз изменения ELO",
        "Ожидаемые +ELO / −ELO рядом с AVG ELO по предматчевой вероятности FACEIT",
        settings.showEloStake,
        "show-elo-stake",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showEloStake: checked };
        },
      ),
      this.#switchRow(
        "Сводка команд",
        "Шансы, общая форма, FIREPOWER, AVG KILLS и K/D над составами",
        settings.showTeamSummary,
        "show-team-summary",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showTeamSummary: checked };
        },
      ),
      this.#switchRow(
        "Сравнение карт",
        "Винрейт обеих команд по каждой карте под кнопкой подключения",
        settings.showMapWinRates,
        "show-map-win-rates",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showMapWinRates: checked };
        },
      ),
      this.#switchRow(
        "Победы на выбранной карте",
        "Суммарное количество побед всех пяти игроков каждой команды в карточке карты",
        settings.showSelectedMapWins,
        "show-selected-map-wins",
        (checked) => {
          if (this.#draft) this.#draft = { ...this.#draft, showSelectedMapWins: checked };
        },
      ),
      this.#controlRow(
        "Окно WR по картам",
        "Количество последних матчей каждого игрока для расчёта сравнения карт",
        this.#windowSelect("Окно WR по картам", settings.mapWinRateWindow, (value) => {
          if (this.#draft) this.#draft = { ...this.#draft, mapWinRateWindow: value };
        }),
      ),
    );
    teams.append(teamGrid);
    wrapper.append(players, teams);
    return wrapper;
  }

  #automationSection(settings: ExtensionSettings): HTMLFieldSetElement {
    const fieldset = this.#fieldset("Автоматизации");
    fieldset.append(node(
      "p",
      "es-settings-warning",
      "Включайте только нужные действия. При несовместимой или неоднозначной разметке EloScope ничего не нажимает."
    ));
    const grid = node("div", "es-settings-grid");
    const booleanRows: Array<{
      key: keyof Pick<AutomationSettings, "partyAccept" | "readyUp" | "autoConnect" | "copyServerData">;
      title: string;
      description: string;
    }> = [
      { key: "partyAccept", title: "Принимать party invites", description: "Только однозначная видимая кнопка" },
      { key: "readyUp", title: "Ready-up", description: "Подтверждает готовность в текущей комнате" },
      { key: "autoConnect", title: "Подключаться к серверу", description: "Только видимая steam://connect ссылка" },
      { key: "copyServerData", title: "Копировать connect", description: "Нажимает видимую кнопку FACEIT" }
    ];
    for (const row of booleanRows) {
      grid.append(this.#switchRow(
        row.title,
        row.description,
        settings.automations[row.key],
        `automation-${row.key}`,
        (checked) => this.#updateAutomation({ [row.key]: checked })
      ));
    }
    grid.append(
      this.#switchRow(
        "Veto карт",
        "Проверяет ход капитана и фазу ban/pick",
        settings.automations.mapVeto.enabled,
        "automation-map-veto",
        (checked) => {
          if (!this.#draft) return;
          this.#draft = {
            ...this.#draft,
            automations: {
              ...this.#draft.automations,
              mapVeto: { ...this.#draft.automations.mapVeto, enabled: checked }
            }
          };
        }
      ),
      this.#switchRow(
        "Veto серверов",
        "Выбирает первое доступное расположение",
        settings.automations.serverVeto.enabled,
        "automation-server-veto",
        (checked) => {
          if (!this.#draft) return;
          this.#draft = {
            ...this.#draft,
            automations: {
              ...this.#draft.automations,
              serverVeto: { ...this.#draft.automations.serverVeto, enabled: checked }
            }
          };
        }
      )
    );
    fieldset.append(grid);

    const orders = node("div", "es-settings-grid");
    orders.append(
      this.#orderControl(
        "Порядок ban карт",
        "mirage, ancient, nuke",
        settings.automations.mapVeto.banOrder,
        "map-ban-order",
        (order) => this.#updateMapVetoOrder("banOrder", order)
      ),
      this.#orderControl(
        "Порядок pick карт",
        "mirage, ancient, nuke",
        settings.automations.mapVeto.pickOrder,
        "map-pick-order",
        (order) => this.#updateMapVetoOrder("pickOrder", order)
      ),
      this.#orderControl(
        "Порядок серверов",
        "warsaw, frankfurt, dallas",
        settings.automations.serverVeto.order,
        "server-order",
        (order) => {
          if (!this.#draft) return;
          this.#draft = {
            ...this.#draft,
            automations: {
              ...this.#draft.automations,
              serverVeto: { ...this.#draft.automations.serverVeto, order }
            }
          };
        }
      )
    );
    fieldset.append(orders);
    return fieldset;
  }

  #positionsSection(settings: ExtensionSettings): HTMLFieldSetElement {
    const fieldset = this.#fieldset("Быстрые позиции");
    const visibility = this.#switchRow(
      "Панель быстрых позиций",
      "Показывать закреплённую панель сообщений в матч-комнате независимо от статистических карточек",
      settings.interfaceVisibility.quickPositionsPanel,
      "visibility-quickPositionsPanel",
      (checked) => {
        if (!this.#draft) return;
        this.#draft = {
          ...this.#draft,
          interfaceVisibility: {
            ...this.#draft.interfaceVisibility,
            quickPositionsPanel: checked,
          },
        };
      },
    );
    visibility.classList.add("es-settings-row--master");
    fieldset.append(visibility);
    fieldset.append(node(
      "p",
      "es-settings-warning",
      "По умолчанию требуется подтверждение. Auto отправляет одно сообщение только для выбранной карты и матча."
    ));
    const list = node("div", "es-position-list");
    list.dataset.testid = "position-list";
    for (const [map, position] of Object.entries(settings.automations.positions)) {
      list.append(this.#positionCard(map, position));
    }
    if (list.childElementCount === 0) {
      const empty = node(
        "div",
        "es-settings-row",
        "Карты появятся из текущего map pool. Их также можно добавить вручную."
      );
      empty.dataset.testid = "positions-empty";
      list.append(empty);
    }
    fieldset.append(list);

    const add = node("div", "es-position-add");
    const input = node("input", "es-settings-text") as HTMLInputElement;
    input.type = "text";
    input.maxLength = 64;
    input.placeholder = "Добавить карту, например train";
    input.setAttribute("aria-label", "Добавить карту для быстрых позиций");
    input.dataset.testid = "add-map-input";
    const button = node("button", "es-settings-button", "Добавить") as HTMLButtonElement;
    button.type = "button";
    button.dataset.testid = "add-map";
    button.addEventListener("click", () => {
      if (!this.#draft) return;
      const previousMaps = Object.keys(this.#draft.automations.positions);
      const next = settingsWithPositionMaps(this.#draft, [input.value]);
      const nextMaps = Object.keys(next.automations.positions);
      if (nextMaps.length === previousMaps.length) {
        input.setCustomValidity("Введите корректное название карты");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      this.#draft = next;
      this.#renderDialog();
      const nextInput = this.shadow.querySelector<HTMLElement>('[data-testid="add-map-input"]');
      nextInput?.focus();
    });
    add.append(input, button);
    fieldset.append(add);
    return fieldset;
  }

  #positionCard(
    map: string,
    position: { enabled: boolean; message: string; mode: PositionMessageMode }
  ): HTMLElement {
    const card = node("article", "es-position-card");
    card.dataset.map = map;
    card.dataset.enabled = String(position.enabled);
    const head = node("div", "es-position-head");
    const name = node("span", "es-position-name", map);
    const enabled = this.#switch(
      position.enabled,
      `position-${map}-enabled`,
      `Включить быстрые позиции для ${map}`,
      (checked) => {
        this.#updatePosition(map, { enabled: checked });
        card.dataset.enabled = String(checked);
      }
    );
    const remove = node("button", "es-position-remove", "Удалить") as HTMLButtonElement;
    remove.type = "button";
    remove.setAttribute("aria-label", `Удалить настройки карты ${map}`);
    remove.addEventListener("click", () => {
      if (!this.#draft) return;
      const removedIndex = Object.keys(this.#draft.automations.positions).indexOf(map);
      const positions = { ...this.#draft.automations.positions };
      delete positions[map];
      this.#draft = {
        ...this.#draft,
        automations: { ...this.#draft.automations, positions }
      };
      this.#renderDialog();
      const remainingRemoveButtons = [
        ...this.shadow.querySelectorAll<HTMLButtonElement>(".es-position-remove")
      ];
      const nextIndex = Math.max(0, Math.min(removedIndex, remainingRemoveButtons.length - 1));
      const focusTarget = remainingRemoveButtons[nextIndex]
        ?? this.shadow.querySelector<HTMLElement>('[data-testid="add-map-input"]')
        ?? this.shadow.getElementById(DIALOG_ID);
      focusTarget?.focus();
    });
    head.append(name, enabled, remove);

    const textarea = node("textarea", "es-settings-textarea") as HTMLTextAreaElement;
    textarea.maxLength = 280;
    textarea.value = position.message;
    textarea.placeholder = "I can play A connector";
    textarea.setAttribute("aria-label", `Сообщение для карты ${map}`);
    textarea.addEventListener("input", () => this.#updatePosition(map, { message: textarea.value }));

    const controls = node("div", "es-position-controls");
    const label = node("label", undefined, "Режим отправки");
    label.htmlFor = `eloscope-position-mode-${map}`;
    const mode = node("select", "es-settings-control") as HTMLSelectElement;
    mode.id = `eloscope-position-mode-${map}`;
    const modes: Array<[PositionMessageMode, string]> = [
      ["confirm", "Подтверждение"],
      ["prefill", "Заполнить чат"],
      ["auto", "Auto-send"]
    ];
    for (const [value, text] of modes) {
      const option = node("option") as HTMLOptionElement;
      option.value = value;
      option.textContent = text;
      option.selected = value === position.mode;
      mode.append(option);
    }
    mode.addEventListener("change", () => {
      this.#updatePosition(map, { mode: mode.value as PositionMessageMode });
    });
    controls.append(label, mode);
    card.append(head, textarea, controls);
    return card;
  }

  #diagnosticsSection(): HTMLFieldSetElement {
    const fieldset = this.#fieldset("Диагностика");
    const card = node("div", "es-settings-stack es-diagnostics-card");
    const copy = describedText(
      "Локальный журнал действий",
      "Включён всегда. Лог хранится локально до 7 дней, автоматически очищается и обезличивается: чувствительные значения и токены удаляются."
    );
    const summary = node("div", "es-diagnostics-summary", "Загружаю сводку…");
    summary.dataset.testid = "debug-log-summary";
    summary.setAttribute("role", "status");
    summary.setAttribute("aria-live", "polite");

    const copyButton = node(
      "button",
      "es-settings-button",
      "Копировать лог"
    ) as HTMLButtonElement;
    copyButton.type = "button";
    copyButton.dataset.testid = "debug-log-copy";
    const saveButton = node(
      "button",
      "es-settings-button",
      "Сохранить файл"
    ) as HTMLButtonElement;
    saveButton.type = "button";
    saveButton.dataset.testid = "debug-log-save";
    const clearButton = node(
      "button",
      "es-settings-button es-settings-button--danger",
      "Очистить"
    ) as HTMLButtonElement;
    clearButton.type = "button";
    clearButton.dataset.testid = "debug-log-clear";
    const buttons = [copyButton, saveButton, clearButton];

    const actions = node("div", "es-diagnostics-actions");
    actions.append(...buttons);
    const status = node("div", "es-diagnostics-status");
    status.dataset.testid = "debug-log-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    copyButton.addEventListener("click", () => {
      void this.#runDiagnosticAction(
        status,
        buttons,
        "Копирую журнал…",
        "Не удалось скопировать журнал",
        async () => {
          const rawEventCount = Math.trunc(await this.#diagnostics.copyToClipboard());
          const eventCount = Number.isFinite(rawEventCount) ? Math.max(0, rawEventCount) : 0;
          return `Скопировано событий: ${eventCount}`;
        }
      );
    });
    saveButton.addEventListener("click", () => {
      void this.#runDiagnosticAction(
        status,
        buttons,
        "Сохраняю журнал…",
        "Не удалось сохранить журнал",
        async () => {
          const result = await this.#diagnostics.saveToFile();
          return result === "saved"
            ? "Файл диагностики сохранён"
            : "Сохранение файла недоступно — журнал скопирован";
        }
      );
    });
    clearButton.addEventListener("click", () => {
      void this.#runDiagnosticAction(
        status,
        buttons,
        "Очищаю журнал…",
        "Не удалось очистить журнал",
        async () => {
          await this.#diagnostics.clear();
          summary.dataset.error = "false";
          summary.textContent = "Событий пока нет";
          return "Журнал очищен";
        }
      );
    });

    card.append(copy, summary, actions, status);
    fieldset.append(card);
    void this.#loadDiagnosticSummary(summary);
    return fieldset;
  }

  async #loadDiagnosticSummary(summary: HTMLElement): Promise<void> {
    try {
      const value = await this.#diagnostics.getSummary();
      summary.dataset.error = "false";
      summary.textContent = diagnosticSummaryText(value);
    } catch {
      summary.dataset.error = "true";
      summary.textContent = "Не удалось загрузить сводку журнала";
    }
  }

  async #runDiagnosticAction(
    status: HTMLElement,
    buttons: readonly HTMLButtonElement[],
    pendingText: string,
    failureText: string,
    action: () => Promise<string>
  ): Promise<void> {
    for (const button of buttons) button.disabled = true;
    status.dataset.error = "false";
    status.textContent = pendingText;
    try {
      status.textContent = await action();
    } catch {
      status.dataset.error = "true";
      status.textContent = failureText;
    } finally {
      for (const button of buttons) button.disabled = false;
    }
  }

  #fieldset(title: string): HTMLFieldSetElement {
    const fieldset = node("fieldset", "es-settings-fieldset") as HTMLFieldSetElement;
    fieldset.append(node("legend", "es-settings-legend", title));
    return fieldset;
  }

  #controlRow(title: string, description: string, control: HTMLElement): HTMLElement {
    const row = node("div", "es-settings-row");
    row.append(describedText(title, description), control);
    return row;
  }

  #switchRow(
    title: string,
    description: string,
    checked: boolean,
    id: string,
    onChange: (checked: boolean) => void
  ): HTMLElement {
    return this.#controlRow(
      title,
      description,
      this.#switch(checked, id, title, onChange)
    );
  }

  #switch(
    checked: boolean,
    id: string,
    label: string,
    onChange: (checked: boolean) => void
  ): HTMLLabelElement {
    const wrapper = node("label", "es-settings-switch") as HTMLLabelElement;
    const input = node("input") as HTMLInputElement;
    input.type = "checkbox";
    input.id = `eloscope-${id}`;
    input.checked = checked;
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () => onChange(input.checked));
    const visual = node("span");
    visual.setAttribute("aria-hidden", "true");
    wrapper.append(input, visual);
    return wrapper;
  }

  #orderControl(
    title: string,
    placeholder: string,
    current: readonly string[],
    testId: string,
    onChange: (order: string[]) => void
  ): HTMLElement {
    const stack = node("div", "es-settings-stack");
    const id = `eloscope-${testId}`;
    const label = node("label", undefined, title);
    label.htmlFor = id;
    const input = node("input", "es-settings-text") as HTMLInputElement;
    input.id = id;
    input.type = "text";
    input.value = current.join(", ");
    input.placeholder = placeholder;
    input.dataset.testid = testId;
    input.addEventListener("input", () => onChange(splitOrder(input.value)));
    stack.append(label, input, node("small", "es-settings-help", "Через запятую, первое доступное значение"));
    return stack;
  }

  #updateAutomation(patch: Partial<AutomationSettings>): void {
    if (!this.#draft) return;
    this.#draft = {
      ...this.#draft,
      automations: { ...this.#draft.automations, ...patch }
    };
  }

  #updateMapVetoOrder(key: "banOrder" | "pickOrder", order: string[]): void {
    if (!this.#draft) return;
    this.#draft = {
      ...this.#draft,
      automations: {
        ...this.#draft.automations,
        mapVeto: { ...this.#draft.automations.mapVeto, [key]: order }
      }
    };
  }

  #updatePosition(
    map: string,
    patch: Partial<{ enabled: boolean; message: string; mode: PositionMessageMode }>
  ): void {
    if (!this.#draft) return;
    const current = this.#draft.automations.positions[map];
    if (!current) return;
    this.#draft = {
      ...this.#draft,
      automations: {
        ...this.#draft.automations,
        positions: {
          ...this.#draft.automations.positions,
          [map]: { ...current, ...patch }
        }
      }
    };
  }

  async #save(
    status: HTMLElement,
    cancel: HTMLButtonElement,
    save: HTMLButtonElement
  ): Promise<void> {
    if (this.#saving || !this.#draft) return;
    this.#saving = true;
    cancel.disabled = true;
    save.disabled = true;
    status.dataset.error = "false";
    status.textContent = "Сохраняю…";
    try {
      const safe = parseSettings(this.#draft);
      await saveSettings(safe);
      const gesture = save.dataset.eloscopeSettingsGesture;
      delete save.dataset.eloscopeSettingsGesture;
      this.#shell.apply(safe.shell, gesture);
      await this.#options.onSaved?.(safe);
      this.#draft = safe;
      status.textContent = "Сохранено";
      this.#saving = false;
      cancel.disabled = false;
      save.disabled = false;
      this.close();
    } catch {
      status.dataset.error = "true";
      status.textContent = "Не удалось сохранить настройки";
      this.#saving = false;
      cancel.disabled = false;
      save.disabled = false;
      save.focus();
    }
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = this.shadow.getElementById(DIALOG_ID);
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<Focusable>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    )].filter((element) => !element.closest("[hidden]"));
    if (focusable.length === 0) return;
    const active = this.shadow.activeElement;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };
}
