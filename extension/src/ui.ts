import {
  type DataState,
  type MatchContext,
  type Player,
  type PlayerMapStats,
  type PlayerMatch,
  type StatsWindow
} from "@eloscope/core";
import type { CompatibilityStatus } from "./compatibility";
import { InlineMatchRenderer, type InlineMatchRenderResult } from "./inline-match";
import { NativeTierSurfaceRenderer } from "./native-tier-surfaces";
import { ProfileStatsBannerRenderer } from "./profile-stats-banner";
import type { ExtensionSettings } from "./settings";
import { canonicalPositionMapId, positionForMap, STATS_WINDOWS } from "./settings";
import { isSelectedMapVisible, type PositionSendResult } from "./positions";
import { OVERLAY_STYLES } from "./styles";

type ElementOptions = {
  className?: string;
  text?: string;
  title?: string;
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, options: ElementOptions = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  return node;
}

function append(parent: ParentNode, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (typeof child === "string") parent.append(document.createTextNode(child));
    else if (child) parent.append(child);
  }
}

function createWindowSelect(current: StatsWindow, onChange: (value: StatsWindow) => void): HTMLSelectElement {
  const select = element("select", { className: "es-window", title: "Окно статистики" });
  for (const value of STATS_WINDOWS) {
    const option = element("option", { text: `${value} матчей` });
    option.value = String(value);
    option.selected = value === current;
    select.append(option);
  }
  select.addEventListener("change", () => onChange(Number(select.value) as StatsWindow));
  return select;
}

export type OverlayCallbacks = {
  onSettingsChange: (settings: ExtensionSettings) => void | Promise<void>;
  onStatsWindow: (window: StatsWindow) => void;
  onPositionSend: (map: string, message: string, mode: "confirm" | "auto" | "prefill") => Promise<PositionSendResult>;
};

export type MatchViewerContext = Readonly<{
  id: string;
  matches?: readonly PlayerMatch[];
  histories?: ReadonlyMap<string, readonly PlayerMatch[]>;
}>;

export class EloScopeOverlay {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly #shell: HTMLElement;
  readonly #positions: HTMLElement;
  readonly #inlineMatch = new InlineMatchRenderer();
  readonly #nativeTiers = new NativeTierSurfaceRenderer();
  readonly #profileStats = new ProfileStatsBannerRenderer();
  #settings: ExtensionSettings;
  #nativeTierSurface: "profile" | "matchmaking" | undefined;

  constructor(settings: ExtensionSettings, private readonly callbacks: OverlayCallbacks) {
    this.#settings = settings;
    this.host = element("div");
    this.host.id = "eloscope-root";
    this.host.dataset.version = "1";
    this.shadow = this.host.attachShadow({ mode: "closed" });
    const style = element("style");
    style.textContent = OVERLAY_STYLES;
    this.shadow.append(style);

    this.#shell = element("div", { className: "es-shell" });
    this.#positions = element("section", { className: "es-positions" });
    this.#positions.hidden = true;
    this.#shell.append(this.#positions);
    this.shadow.append(this.#shell);
    (document.documentElement ?? document).append(this.host);
  }

  destroy(): void {
    this.#inlineMatch.destroy();
    this.#nativeTiers.destroy();
    this.#profileStats.destroy();
    this.host.remove();
  }

  updateSettings(settings: ExtensionSettings): void {
    this.#settings = settings;
    if (!settings.showExtendedTier) this.#nativeTiers.cleanup();
    if (!settings.interfaceVisibility.profileStatsBanner) this.#profileStats.cleanup();
    if (!settings.interfaceVisibility.quickPositionsPanel) this.#hidePositions();
  }

  setCompatibility(status: CompatibilityStatus): void {
    this.host.dataset.compatibility = status;
  }

  hideRoutePanels(): void {
    this.#inlineMatch.cleanup();
    this.#nativeTiers.cleanup();
    this.#profileStats.cleanup();
    this.#nativeTierSurface = undefined;
    this.#hidePositions();
  }

  showMatchmakingTier(player: Player): number {
    this.#inlineMatch.cleanup();
    this.#nativeTiers.cleanup();
    this.#profileStats.cleanup();
    this.#hidePositions();
    this.#nativeTierSurface = "matchmaking";
    return this.#nativeTiers.syncMatchmaking(player, this.#settings.showExtendedTier);
  }

  syncMatchmakingTier(player: Player): number {
    this.#nativeTierSurface = "matchmaking";
    return this.#nativeTiers.syncMatchmaking(player, this.#settings.showExtendedTier);
  }

  showProfileTier(player: Player, includeProgressRail: boolean): number {
    if (this.#nativeTierSurface !== "profile") this.#nativeTiers.cleanup();
    return this.syncProfileTier(player, includeProgressRail);
  }

  syncProfileTier(player: Player, includeProgressRail: boolean): number {
    this.#nativeTierSurface = "profile";
    return this.#nativeTiers.syncProfile(
      player,
      this.#settings.showExtendedTier,
      includeProgressRail,
    );
  }

  showProfileStats(player: Player, matches: DataState<PlayerMatch[]>): boolean {
    return this.#profileStats.render(player, matches);
  }

  syncProfileStats(): boolean {
    return this.#profileStats.sync();
  }

  hideProfileStats(): void {
    this.#profileStats.cleanup();
  }

  showMatch(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]> = new Map(),
    viewerTeamId?: string,
    viewer?: MatchViewerContext,
  ): InlineMatchRenderResult {
    this.#nativeTiers.cleanup();
    this.#profileStats.cleanup();
    this.#nativeTierSurface = undefined;
    const result = this.syncMatchInline(match, playerMatches, playerMapStats, viewerTeamId, viewer);
    if (this.#settings.interfaceVisibility.quickPositionsPanel) this.showPositions(match);
    else this.#hidePositions();
    return result;
  }

  syncMatchInline(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]> = new Map(),
    viewerTeamId?: string,
    viewer?: MatchViewerContext,
  ): InlineMatchRenderResult {
    return this.#inlineMatch.render(match, playerMatches, playerMapStats, {
      statsWindow: this.#settings.statsWindow,
      mapWinRateWindow: this.#settings.mapWinRateWindow,
      showExtendedTier: this.#settings.showExtendedTier,
      showPlayerRoles: this.#settings.showPlayerRoles,
      showMapWinRates: this.#settings.showMapWinRates,
    }, viewerTeamId, viewer);
  }

  showPositions(match: MatchContext): void {
    if (!match.mapPool.length) {
      this.#positions.hidden = true;
      return;
    }
    this.#positions.hidden = false;
    const head = element("div", { className: "es-positions-head" });
    append(
      head,
      element("strong", { text: "Быстрые позиции" }),
      match.selectedMap
        ? element("span", { className: "es-badge", text: `Выбрана ${match.selectedMap}` })
        : element("span", { className: "es-muted", text: "Карта ещё не выбрана" }),
      element("span", { className: "es-spacer" }),
      createWindowSelect(this.#settings.statsWindow, this.callbacks.onStatsWindow),
    );
    const grid = element("div", { className: "es-position-grid" });
    for (const map of match.mapPool) grid.append(this.#positionCard(match, map));
    this.#positions.replaceChildren(head, grid);
  }

  #hidePositions(): void {
    this.#positions.hidden = true;
    this.#positions.replaceChildren();
  }

  #positionCard(match: MatchContext, map: string): HTMLElement {
    const canonicalMap = canonicalPositionMapId(map) ?? map;
    const current = positionForMap(this.#settings, canonicalMap) ?? { enabled: false, message: "", mode: "confirm" as const };
    const selected = match.selectedMap?.toLowerCase() === map.toLowerCase() && isSelectedMapVisible(document, map);
    const card = element("div", { className: "es-position-card" });
    card.dataset.selected = String(selected);
    const enabled = element("input") as HTMLInputElement;
    enabled.type = "checkbox";
    enabled.checked = current.enabled;
    const label = element("label");
    append(label, enabled, ` ${map.toUpperCase()}`);
    const textarea = element("textarea") as HTMLTextAreaElement;
    textarea.value = current.message;
    textarea.placeholder = `Позиция на ${map}`;
    textarea.maxLength = 280;
    const mode = element("select", { className: "es-select" }) as HTMLSelectElement;
    for (const [value, title] of [["confirm", "По кнопке"], ["prefill", "Заполнить чат"], ["auto", "Авто после выбора"]] as const) {
      const option = element("option", { text: title });
      option.value = value;
      option.selected = current.mode === value;
      mode.append(option);
    }
    const savePosition = (): void => {
      const positions = { ...this.#settings.automations.positions, [canonicalMap]: { enabled: enabled.checked, message: textarea.value, mode: mode.value as "confirm" | "auto" | "prefill" } };
      this.#settings = { ...this.#settings, automations: { ...this.#settings.automations, positions } };
      void this.callbacks.onSettingsChange(this.#settings);
    };
    enabled.addEventListener("change", savePosition);
    textarea.addEventListener("change", savePosition);
    mode.addEventListener("change", savePosition);
    const send = element("button", { className: "es-primary", text: mode.value === "prefill" ? "Подготовить" : "Отправить" });
    send.type = "button";
    mode.addEventListener("change", () => {
      send.textContent = mode.value === "prefill" ? "Подготовить" : "Отправить";
    });
    const updateSendState = (): void => {
      send.disabled = !enabled.checked || !selected;
      send.title = !selected
        ? "Отправка доступна после выбора этой карты"
        : !enabled.checked
          ? "Сначала включите сообщение для карты"
          : "";
    };
    enabled.addEventListener("change", updateSendState);
    updateSendState();
    const status = element("div", { className: "es-status" });
    send.addEventListener("click", async () => {
      savePosition();
      send.setAttribute("disabled", "true");
      const result = await this.callbacks.onPositionSend(map, textarea.value, mode.value as "confirm" | "auto" | "prefill");
      const labels: Record<PositionSendResult, string> = {
        sent: "Отправлено",
        prepared: "Текст подготовлен — чат ждёт ручную отправку",
        duplicate: "Уже отправлено в этом матче",
        "chat-unavailable": "Чат пока не готов",
        empty: "Введите текст"
      };
      status.textContent = labels[result];
      send.removeAttribute("disabled");
    });
    append(card, element("div", { className: "es-row" }), textarea);
    const firstRow = card.firstElementChild as HTMLElement;
    append(firstRow, label, mode);
    append(card, send, status);
    return card;
  }
}
