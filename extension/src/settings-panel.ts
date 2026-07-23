import type {
  AutomationSettings,
  MapId,
  PositionMessageMode,
  StatsWindow
} from "@eloscope/core";
import type { DomRoot } from "./dom";
import { visibleSelectedMap } from "./positions";
import {
  loadSettings,
  parseSettings,
  saveSettings,
  settingsWithPositionMaps,
  STATS_WINDOWS,
  type ExtensionSettings
} from "./settings";

export const SETTINGS_PANEL_HOST_ID = "eloscope-settings-root";

const DIALOG_ID = "eloscope-settings-dialog";
const TITLE_ID = "eloscope-settings-title";
const DESCRIPTION_ID = "eloscope-settings-description";

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
  width: min(860px, 100%);
  max-height: min(860px, calc(100vh - 48px));
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--es-settings-text);
  background: var(--es-settings-bg);
  border: 1px solid var(--es-settings-line);
  border-radius: 18px;
  box-shadow: 0 28px 90px rgba(0,0,0,.78);
}
.es-settings-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 17px 18px;
  background: rgba(13,15,18,.97);
  border-bottom: 1px solid var(--es-settings-line);
}
.es-settings-brand { display: grid; width: 37px; height: 37px; flex: 0 0 auto; place-items: center; border-radius: 11px; background: var(--es-settings-accent); font-size: 17px; font-weight: 950; }
.es-settings-heading { min-width: 0; flex: 1; }
.es-settings-heading h2 { margin: 0; font-size: 18px; line-height: 1.25; }
.es-settings-heading p { margin: 3px 0 0; color: var(--es-settings-muted); font-size: 12px; }
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
.es-settings-form { padding: 16px 18px 18px; }
.es-settings-fieldset { min-width: 0; margin: 0 0 14px; padding: 0; border: 0; }
.es-settings-legend { width: 100%; margin: 0 0 8px; color: #fff; font-size: 12px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
.es-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.es-settings-row,
.es-settings-stack,
.es-position-card {
  min-width: 0;
  padding: 12px;
  background: var(--es-settings-panel);
  border: 1px solid var(--es-settings-line);
  border-radius: 12px;
}
.es-settings-row { display: flex; align-items: center; gap: 12px; }
.es-settings-copy { min-width: 0; flex: 1; }
.es-settings-copy strong { display: block; color: #fff; }
.es-settings-copy small,
.es-settings-help { display: block; margin-top: 3px; color: var(--es-settings-muted); font-size: 11px; }
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
.es-settings-row > .es-settings-control { width: auto; min-width: 92px; }
.es-settings-textarea { min-height: 68px; margin-top: 8px; resize: vertical; }
.es-settings-switch { position: relative; display: inline-flex; width: 42px; height: 24px; flex: 0 0 auto; }
.es-settings-switch input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.es-settings-switch span { width: 100%; border: 1px solid var(--es-settings-line); border-radius: 999px; background: #343a43; transition: background .14s ease; }
.es-settings-switch span::after { content: ""; position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .14s ease; }
.es-settings-switch input:checked + span { background: var(--es-settings-accent); }
.es-settings-switch input:checked + span::after { transform: translateX(18px); }
.es-settings-switch input:focus-visible + span { outline: 2px solid #fff; outline-offset: 2px; }
.es-settings-stack label { display: block; margin-bottom: 6px; color: #fff; font-weight: 750; }
.es-settings-warning { margin: 0 0 10px; padding: 10px 12px; color: #ffd7c4; background: rgba(255,91,25,.09); border: 1px solid rgba(255,91,25,.28); border-radius: 11px; font-size: 11px; }
.es-position-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
.es-position-card[data-enabled="true"] { border-color: rgba(255,91,25,.55); box-shadow: inset 0 0 0 1px rgba(255,91,25,.12); }
.es-position-head { display: flex; align-items: center; gap: 8px; }
.es-position-name { min-width: 0; flex: 1; overflow: hidden; color: #fff; font-weight: 850; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
.es-position-remove { padding: 4px 7px; color: var(--es-settings-muted); background: transparent; border: 1px solid var(--es-settings-line); border-radius: 7px; }
.es-position-controls { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; margin-top: 8px; align-items: center; }
.es-position-add { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-top: 9px; }
.es-settings-button { padding: 8px 12px; color: var(--es-settings-text); background: var(--es-settings-card); border: 1px solid var(--es-settings-line); border-radius: 9px; font-weight: 750; }
.es-settings-button--primary { color: #fff; background: var(--es-settings-accent); border-color: transparent; }
.es-settings-footer { position: sticky; bottom: 0; display: flex; align-items: center; gap: 8px; margin: 14px -18px -18px; padding: 13px 18px; background: rgba(13,15,18,.97); border-top: 1px solid var(--es-settings-line); }
.es-settings-status { min-width: 0; flex: 1; color: var(--es-settings-muted); font-size: 11px; }
.es-settings-status[data-error="true"] { color: var(--es-settings-danger); }
.es-settings-disclaimer { margin: 9px 0 0; color: var(--es-settings-muted); font-size: 10px; }
.es-visually-hidden { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 720px) {
  .es-settings-backdrop { padding: 10px; }
  .es-settings-dialog { max-height: calc(100vh - 20px); border-radius: 14px; }
  .es-settings-grid, .es-position-list { grid-template-columns: 1fr; }
  .es-settings-form { padding: 13px; }
  .es-settings-footer { margin-right: -13px; margin-bottom: -13px; margin-left: -13px; padding: 12px 13px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; }
}
`;

type SettingsPanelOptions = {
  onSaved?: (settings: ExtensionSettings) => void | Promise<void>;
  mapIds?: () => readonly MapId[];
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
  #draft: ExtensionSettings | undefined;
  #opening = false;
  #saving = false;

  constructor(options: SettingsPanelOptions = {}) {
    this.#options = options;
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
      "Статистика, безопасные автоматизации и быстрые позиции"
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
    form.append(
      this.#interfaceSection(draft),
      this.#automationSection(draft),
      this.#positionsSection(draft)
    );

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
    const save = node(
      "button",
      "es-settings-button es-settings-button--primary",
      "Сохранить"
    ) as HTMLButtonElement;
    save.type = "submit";
    footer.append(status, cancel, save);
    form.append(disclaimer, footer);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#save(status, cancel, save);
    });

    dialog.append(header, form);
    this.#backdrop.replaceChildren(dialog);
  }

  #interfaceSection(settings: ExtensionSettings): HTMLFieldSetElement {
    const fieldset = this.#fieldset("Интерфейс");
    const grid = node("div", "es-settings-grid");

    const stats = node("select", "es-settings-control") as HTMLSelectElement;
    stats.setAttribute("aria-label", "Окно статистики");
    for (const value of STATS_WINDOWS) {
      const option = node("option") as HTMLOptionElement;
      option.value = String(value);
      option.textContent = `${value} матчей`;
      option.selected = value === settings.statsWindow;
      stats.append(option);
    }
    stats.addEventListener("change", () => {
      if (!this.#draft) return;
      this.#draft = {
        ...this.#draft,
        statsWindow: Number(stats.value) as StatsWindow
      };
    });
    grid.append(this.#controlRow(
      "Окно статистики",
      "5–100 завершённых CS2 5v5 матчей",
      stats
    ));

    grid.append(this.#switchRow(
      "Расширенная шкала 1–20",
      "На matchmaking, в профиле и комнате уровень 11–20 занимает место штатной иконки; официальный level остаётся в подсказке",
      settings.showExtendedTier,
      "show-extended-tier",
      (checked) => {
        if (this.#draft) this.#draft = { ...this.#draft, showExtendedTier: checked };
      }
    ));
    grid.append(this.#switchRow(
      "Роли игроков",
      "Основная роль вместо аватара и все пять оценок при наведении на статистику; расчёт по 20 последним завершённым CS2 5v5",
      settings.showPlayerRoles,
      "show-player-roles",
      (checked) => {
        if (this.#draft) this.#draft = { ...this.#draft, showPlayerRoles: checked };
      }
    ));
    grid.append(this.#switchRow(
      "Сравнение карт",
      "Винрейт обеих команд по картам в комнате матча",
      settings.showMapWinRates,
      "show-map-win-rates",
      (checked) => {
        if (this.#draft) this.#draft = { ...this.#draft, showMapWinRates: checked };
      }
    ));
    grid.append(this.#switchRow(
      "Overlay match room",
      "Команды, форма и быстрые позиции",
      settings.interfaceVisibility.matchRoom,
      "visibility-matchRoom",
      (checked) => {
        if (!this.#draft) return;
        this.#draft = {
          ...this.#draft,
          interfaceVisibility: {
            ...this.#draft.interfaceVisibility,
            matchRoom: checked
          }
        };
      }
    ));
    fieldset.append(grid);
    return fieldset;
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
