import {
  aggregatePlayerMatches,
  calculateFormBattery,
  calculateTeamFcr,
  eligibleMatches,
  getEloTier,
  getOfficialEloProgress,
  toEpochMs,
  type DataState,
  type FormBattery,
  type MatchContext,
  type MatchPlayerStats,
  type MatchStats,
  type Player,
  type PlayerMapStats,
  type PlayerMatch,
  type StatsWindow
} from "@eloscope/core";
import type { CompatibilityStatus } from "./compatibility";
import { InlineMatchRenderer } from "./inline-match";
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

function format(value: number | undefined, digits = 1): string {
  return value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function percent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function stat(label: string, value: string): HTMLElement {
  const box = element("div", { className: "es-stat" });
  append(box, element("b", { text: value }), element("span", { text: label }));
  return box;
}

function sectionTitle(text: string): HTMLElement {
  return element("div", { className: "es-section-title", text });
}

function batteryTooltip(battery: FormBattery): string {
  if (battery.status === "unknown") return `Форма неизвестна: ${battery.recentCount} свежих матчей (нужно минимум 2)`;
  const delta = battery.delta;
  return [
    `Форма ${battery.score}/100 · уверенность ${Math.round(battery.confidence * 100)}%`,
    `ADR ${delta ? format(delta.adr, 1) : "—"} · K/R ${delta ? format(delta.kr, 2) : "—"}`,
    `K/D ${delta ? format(delta.kd, 2) : "—"} · WR ${delta ? percent(delta.winRate * 100) : "—"}`,
    `Выборка: ${battery.recentCount} recent / ${battery.baselineCount} baseline`
  ].join("\n");
}

export function batteryNode(matches: readonly PlayerMatch[]): HTMLElement {
  const battery = calculateFormBattery(matches);
  const node = element("span", { className: "es-battery", title: batteryTooltip(battery) });
  node.style.color = battery.color;
  node.tabIndex = 0;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", batteryTooltip(battery).replaceAll("\n", ". "));
  const on = battery.score === null ? 0 : Math.ceil(battery.score / 20);
  for (let index = 0; index < 5; index += 1) {
    const bar = element("i", { className: "es-battery-bar" });
    bar.dataset.on = String(index < on);
    node.append(bar);
  }
  node.append(element("span", { className: "es-battery-score", text: battery.score === null ? "?" : String(battery.score) }));
  return node;
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
  onHistoryDetail: (matchId: string) => Promise<DataState<HistoryDetailData>>;
};

export type HistoryDetailData = {
  match: MatchContext;
  stats: MatchStats;
};

export type ProfileInlineMode = "profile" | "history";

const PROFILE_MAIN_SELECTOR = '[class*="styles__MainSection-sc-"]';
const PROFILE_PRIMARY_SELECTOR = '[class*="styles__PrimaryContent-sc-"]';
const PROFILE_CARD_STACK_SELECTOR = '[class*="styles__CardStack-sc-"]';
const PROFILE_MATCH_TABLE_SELECTOR = '[class*="styles__MatchTable-sc-"]';

function isRenderedElement(node: Element): node is HTMLElement {
  if (!(node instanceof HTMLElement) || !node.isConnected || node.hidden) return false;
  if (node.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = getComputedStyle(node);
  return style.display !== "none" && style.visibility !== "hidden";
}

function directChildWithin(container: HTMLElement, descendant: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = descendant;
  while (current?.parentElement && current.parentElement !== container) current = current.parentElement;
  return current?.parentElement === container ? current : undefined;
}

export class EloScopeOverlay {
  readonly host: HTMLElement;
  readonly shadow: ShadowRoot;
  readonly #shell: HTMLElement;
  readonly #panel: HTMLElement;
  readonly #positions: HTMLElement;
  readonly #inlineMatch = new InlineMatchRenderer();
  #settings: ExtensionSettings;
  #profileInlineMode: ProfileInlineMode | undefined;
  #profilePanelRequested = false;
  #profileRenderGeneration = 0;

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
    this.#panel = element("section", { className: "es-panel" });
    this.#panel.hidden = true;
    this.#positions = element("section", { className: "es-positions" });
    this.#positions.hidden = true;
    append(this.#shell, this.#panel, this.#positions);
    this.shadow.append(this.#shell);
    (document.documentElement ?? document).append(this.host);
  }

  destroy(): void {
    this.#profileRenderGeneration += 1;
    this.#inlineMatch.destroy();
    this.host.remove();
  }

  updateSettings(settings: ExtensionSettings): void {
    this.#settings = settings;
  }

  setCompatibility(status: CompatibilityStatus): void {
    this.host.dataset.compatibility = status;
  }

  hideRoutePanels(): void {
    this.#inlineMatch.cleanup();
    this.#resetProfileInline();
    this.#panel.hidden = true;
    this.#positions.hidden = true;
    this.#panel.replaceChildren();
    this.#positions.replaceChildren();
  }

  showLoading(title: string, mode: ProfileInlineMode = title === "Расширенная история" ? "history" : "profile"): void {
    this.#renderProfileInline(
      mode,
      this.#header(title),
      element("div", { className: "es-state", text: "Загружаю разрешённые данные FACEIT…" }),
    );
  }

  showState(
    title: string,
    state: "restricted" | "error" | "empty",
    mode: ProfileInlineMode = title === "Расширенная история" ? "history" : "profile",
  ): void {
    const messages = {
      restricted: "Данные недоступны для текущей сессии или профиля.",
      error: "Не удалось прочитать данные. Нативная страница FACEIT продолжает работать.",
      empty: "Достоверных завершённых CS2 5v5 матчей пока нет."
    };
    this.#renderProfileInline(mode, this.#header(title), element("div", { className: "es-state", text: messages[state] }));
  }

  showProfile(player: Player, matches: PlayerMatch[], maps: PlayerMapStats[]): void {
    this.#inlineMatch.cleanup();
    const validMatches = eligibleMatches(matches);
    this.#positions.hidden = true;
    const content = element("div", { className: "es-content" });
    const identity = element("div", { className: "es-profile-line" });
    const level = player.elo === undefined ? player.officialLevel : getEloTier(player.elo, this.#settings.showExtendedTier);
    append(
      identity,
      element("div", { className: "es-level", text: level === undefined ? "—" : String(level), title: this.#settings.showExtendedTier ? "Шкала EloScope 1–20" : "Официальный уровень FACEIT" }),
      element("div", { className: "es-player-name", text: player.nickname }),
      player.country ? element("span", { className: "es-badge", text: player.country }) : null,
      element("span", { className: "es-spacer" }),
      batteryNode(validMatches),
      createWindowSelect(this.#settings.statsWindow, this.callbacks.onStatsWindow)
    );
    content.append(identity);
    if (player.elo !== undefined) {
      const progress = getOfficialEloProgress(player.elo);
      const progressNode = element("div", { className: "es-progress" });
      const progressLabel = element("div", { className: "es-row" });
      append(
        progressLabel,
        element("span", { text: `Официальный level ${progress.level}` }),
        element("span", { className: "es-spacer" }),
        element("span", {
          className: "es-muted",
          text: progress.pointsNeeded === null
            ? "Максимальный официальный уровень"
            : `${progress.pointsNeeded} ELO до level ${progress.level + 1}`,
        }),
      );
      const track = element("div", { className: "es-progress-track" });
      const fill = element("i", { className: "es-progress-fill" });
      fill.style.width = `${progress.percent}%`;
      track.append(fill);
      append(progressNode, progressLabel, track);
      content.append(progressNode);
    }
    if (validMatches.length === 0) {
      content.append(element("div", { className: "es-state", text: "Нет достоверных завершённых CS2 5v5 матчей — нули не подставляются." }));
      this.#renderProfileInline("profile", this.#header("Профиль"), content);
      return;
    }

    const aggregate = aggregatePlayerMatches(validMatches, this.#settings.statsWindow);
    const grid = element("div", { className: "es-grid" });
    append(
      grid,
      stat("ELO", player.elo === undefined ? "—" : String(player.elo)),
      stat("W / L", `${aggregate.wins} / ${aggregate.losses}`),
      stat("K / A / D", `${aggregate.kills} / ${aggregate.assists} / ${aggregate.deaths}`),
      stat("Win rate", percent(aggregate.winRate)),
      stat("K/D", format(aggregate.kd, 2)),
      stat("K/R", format(aggregate.kr, 2)),
      stat("ADR", format(aggregate.adr, 1)),
      stat("HS", percent(aggregate.headshotPercent)),
      stat("Contribution", aggregate.contribution === undefined ? "—" : percent(aggregate.contribution))
    );
    content.append(grid, sectionTitle("Карты"));
    const mapList = element("div", { className: "es-map-list" });
    const sourceMaps = maps.length ? maps : aggregate.maps.map((map) => {
      const rows = validMatches.filter((match) => match.map === map.map);
      return {
        map: map.map,
        matches: map.matches,
        wins: map.wins,
        kills: rows.reduce((sum, row) => sum + row.kills, 0),
        assists: rows.reduce((sum, row) => sum + row.assists, 0),
        deaths: rows.reduce((sum, row) => sum + row.deaths, 0),
        roundsPlayed: rows.reduce((sum, row) => sum + row.roundsPlayed, 0),
        damage: rows.reduce((sum, row) => sum + row.damage, 0),
      };
    });
    const ranked = [...sourceMaps].sort((left, right) => right.wins / Math.max(1, right.matches) - left.wins / Math.max(1, left.matches));
    const visibleMaps = ranked.slice(0, 9);
    for (const [index, map] of visibleMaps.entries()) {
      const card = element("div", { className: "es-map" });
      const winRate = (map.wins / Math.max(1, map.matches)) * 100;
      const kd = map.deaths > 0 ? map.kills / map.deaths : map.kills;
      const kr = map.roundsPlayed > 0 ? map.kills / map.roundsPlayed : undefined;
      const adr = map.roundsPlayed > 0 ? map.damage / map.roundsPlayed : undefined;
      append(
        card,
        element("strong", { text: map.map }),
        element("span", { className: "es-muted", text: `${map.matches} матчей · ${percent(winRate)} WR` }),
        element("span", {
          className: "es-muted",
          text: `${format(map.kills / Math.max(1, map.matches), 1)} avg K · ${format(kd, 2)} KD · ${format(kr, 2)} KR · ${format(adr, 1)} ADR`,
        }),
        index === 0 ? element("div", { className: "es-positive", text: "Лучшая карта" }) : null,
        index === visibleMaps.length - 1 && visibleMaps.length > 1 ? element("div", { className: "es-negative", text: "Слабейшая карта" }) : null
      );
      mapList.append(card);
    }
    content.append(mapList);
    this.#renderProfileInline("profile", this.#header("Профиль"), content);
  }

  showHistory(player: Player, matches: PlayerMatch[]): void {
    this.#inlineMatch.cleanup();
    const validMatches = eligibleMatches(matches);
    this.#positions.hidden = true;
    const content = element("div", { className: "es-content" });
    const line = element("div", { className: "es-profile-line" });
    append(line, element("div", { className: "es-title", text: player.nickname }), element("span", { className: "es-spacer" }), batteryNode(validMatches), createWindowSelect(this.#settings.statsWindow, this.callbacks.onStatsWindow));
    content.append(line);
    if (!validMatches.length) content.append(element("div", { className: "es-state", text: "История не содержит достоверных строк. Исторический ELO не угадывается." }));
    else content.append(this.#historyTable(validMatches));
    this.#renderProfileInline("history", this.#header("Расширенная история"), content);
  }

  syncProfileInline(mode: ProfileInlineMode): boolean {
    if (!this.#profilePanelRequested || this.#profileInlineMode !== mode) return false;
    const target = this.#profileInlineTarget(mode);
    if (!target) {
      this.#detachProfileInline();
      return false;
    }

    this.host.dataset.layout = "profile-inline";
    this.host.dataset.profileMode = mode;
    if (target.position === "after") {
      if (target.anchor.nextElementSibling !== this.host) target.anchor.after(this.host);
    } else if (target.position === "before") {
      if (target.anchor.previousElementSibling !== this.host) target.anchor.before(this.host);
    } else if (target.main.firstElementChild !== this.host) {
      target.main.prepend(this.host);
    }
    this.#panel.hidden = false;
    return true;
  }

  #renderProfileInline(mode: ProfileInlineMode, ...children: Node[]): void {
    this.#inlineMatch.cleanup();
    this.#positions.hidden = true;
    this.#profileRenderGeneration += 1;
    this.#profileInlineMode = mode;
    this.#profilePanelRequested = true;
    this.#panel.replaceChildren(...children);
    this.syncProfileInline(mode);
  }

  #profileInlineTarget(mode: ProfileInlineMode):
    | { main: HTMLElement; anchor: HTMLElement; position: "before" | "after" }
    | { main: HTMLElement; position: "prepend" }
    | undefined {
    const mains = Array.from(document.querySelectorAll(PROFILE_MAIN_SELECTOR)).filter(isRenderedElement);
    if (mains.length !== 1) return undefined;
    const [main] = mains;
    if (!main) return undefined;
    if (!main.closest(PROFILE_PRIMARY_SELECTOR)) return undefined;

    if (mode === "history") {
      const tables = Array.from(main.querySelectorAll(PROFILE_MATCH_TABLE_SELECTOR)).filter(isRenderedElement);
      if (tables.length !== 1) return undefined;
      const [table] = tables;
      if (!table) return undefined;
      const anchor = directChildWithin(main, table);
      return anchor ? { main, anchor, position: "before" } : undefined;
    }

    const cards = Array.from(main.querySelectorAll(PROFILE_CARD_STACK_SELECTOR)).filter(isRenderedElement);
    if (cards.length > 1) return undefined;
    if (cards.length === 1) {
      const [card] = cards;
      if (!card) return undefined;
      const anchor = directChildWithin(main, card);
      return anchor ? { main, anchor, position: "after" } : undefined;
    }
    return { main, position: "prepend" };
  }

  #detachProfileInline(): void {
    delete this.host.dataset.layout;
    delete this.host.dataset.profileMode;
    const root = document.documentElement ?? document;
    if (this.host.parentNode !== root) root.append(this.host);
    this.#panel.hidden = true;
  }

  #resetProfileInline(): void {
    this.#profileRenderGeneration += 1;
    this.#profilePanelRequested = false;
    this.#profileInlineMode = undefined;
    this.#detachProfileInline();
  }

  #historyTable(matches: PlayerMatch[]): HTMLElement {
    const wrap = element("div", { className: "es-table-wrap" });
    const table = element("table", { className: "es-table" });
    const head = element("thead");
    const headRow = element("tr");
    for (const title of ["Дата", "W/L", "AVG ELO", "Δ ELO", "K/A/D", "ADR", "K/D", "K/R", "FCR", "Карта"]) {
      headRow.append(element("th", { text: title }));
    }
    head.append(headRow);
    const body = element("tbody");
    for (const match of matches.slice(0, this.#settings.statsWindow)) {
      const row = element("tr");
      row.dataset.clickable = "true";
      const finished = new Date(toEpochMs(match.finishedAt));
      const eloDelta = match.eloAfter !== undefined && match.eloBefore !== undefined ? match.eloAfter - match.eloBefore : undefined;
      const values = [
        Number.isNaN(finished.valueOf()) ? "—" : finished.toLocaleDateString(),
        match.result === "win" ? "W" : "L",
        match.teamAverageElo === undefined || match.opponentAverageElo === undefined ? "—" : `${Math.round(match.teamAverageElo)} / ${Math.round(match.opponentAverageElo)}`,
        eloDelta === undefined ? "—" : `${eloDelta > 0 ? "+" : ""}${Math.round(eloDelta)}`,
        `${match.kills}/${match.assists}/${match.deaths}`,
        format(match.damage / match.roundsPlayed, 1),
        format(match.deaths ? match.kills / match.deaths : match.kills, 2),
        format(match.kills / match.roundsPlayed, 2),
        match.fcr === undefined ? "—" : percent(match.fcr),
        match.map ?? "—"
      ];
      values.forEach((value) => row.append(element("td", { text: value })));
      const detail = element("tr", { className: "es-detail" });
      detail.hidden = true;
      const cell = element("td", {
        text: `Match ${match.id} · нажмите, чтобы загрузить обе команды`
      });
      cell.colSpan = 10;
      detail.append(cell);
      let loaded = false;
      let loading = false;
      row.addEventListener("click", async () => {
        if (!detail.hidden) {
          detail.hidden = true;
          return;
        }
        detail.hidden = false;
        if (loaded || loading) return;
        loading = true;
        const generation = this.#profileRenderGeneration;
        cell.textContent = "Загружаю достоверную статистику матча…";
        const state = await this.callbacks.onHistoryDetail(match.id);
        if (generation !== this.#profileRenderGeneration || !cell.isConnected) return;
        if (state.status === "ready") {
          cell.replaceChildren(this.#historyDetail(state.data, match));
          loaded = true;
        } else {
          cell.textContent = state.status === "restricted"
            ? "Детальная статистика скрыта или недоступна."
            : "Не удалось загрузить детали; нативная история FACEIT продолжает работать.";
        }
        loading = false;
      });
      append(body, row, detail);
    }
    append(table, head, body);
    wrap.append(table);
    return wrap;
  }

  #historyDetail(data: HistoryDetailData, subjectMatch: PlayerMatch): HTMLElement {
    const container = element("div", { className: "es-history-detail" });
    const roster = new Map(
      data.match.teams.flatMap((team) => team.players.map((player) => [player.id, player] as const)),
    );
    const teamNames = new Map(data.match.teams.map((team) => [team.id, team.name ?? team.id] as const));
    const groups = new Map<string, MatchPlayerStats[]>();
    for (const player of data.stats.players) {
      const group = groups.get(player.teamId) ?? [];
      group.push(player);
      groups.set(player.teamId, group);
    }

    if (!groups.size) {
      return element("div", { className: "es-state", text: "В ответе FACEIT нет достоверных строк игроков." });
    }

    for (const [teamId, players] of groups) {
      const section = element("section", { className: "es-detail-team" });
      section.append(element("strong", { text: teamNames.get(teamId) ?? teamId }));
      const fcr = new Map(calculateTeamFcr(players.map((player) => ({
        playerId: player.playerId,
        kills: player.kills,
        assists: player.assists,
        damage: player.damage,
        survivedRounds: player.survivedRounds ?? Math.max(0, player.roundsPlayed - player.deaths),
        firstKills: player.firstKills ?? 0,
      }))).map((row) => [row.playerId, row] as const));
      const table = element("table", { className: "es-detail-table" });
      const head = element("tr");
      for (const label of ["Nick", "K/A/D", "K/R", "K/D", "HS", "ADR", "FCR", "ELO snapshot"]) {
        head.append(element("th", { text: label }));
      }
      table.append(head);
      for (const player of players) {
        const row = element("tr");
        const identity = roster.get(player.playerId);
        const exactElo = player.playerId === subjectMatch.playerId ? subjectMatch.eloAfter : undefined;
        const values = [
          identity?.nickname ?? player.playerId.slice(0, 12),
          `${player.kills}/${player.assists}/${player.deaths}`,
          format(player.roundsPlayed > 0 ? player.kills / player.roundsPlayed : undefined, 2),
          format(player.deaths > 0 ? player.kills / player.deaths : player.kills, 2),
          percent(player.kills > 0 && player.headshots !== undefined ? (player.headshots / player.kills) * 100 : undefined),
          format(player.roundsPlayed > 0 ? player.damage / player.roundsPlayed : undefined, 1),
          fcr.get(player.playerId) ? percent(fcr.get(player.playerId)?.score) : "—",
          exactElo === undefined ? "—" : String(Math.round(exactElo)),
        ];
        values.forEach((value) => row.append(element("td", { text: value })));
        table.append(row);
      }
      append(section, table);
      container.append(section);
    }
    return container;
  }

  showMatch(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]> = new Map(),
  ): void {
    this.#resetProfileInline();
    this.#panel.hidden = true;
    this.#panel.replaceChildren();
    this.syncMatchInline(match, playerMatches, playerMapStats);
    this.showPositions(match);
  }

  syncMatchInline(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]> = new Map(),
  ): void {
    this.#inlineMatch.render(match, playerMatches, playerMapStats, {
      statsWindow: this.#settings.statsWindow,
      showExtendedTier: this.#settings.showExtendedTier,
      showPlayerRoles: this.#settings.showPlayerRoles,
      showMapWinRates: this.#settings.showMapWinRates,
    });
  }

  showPositions(match: MatchContext): void {
    if (!match.mapPool.length) {
      this.#positions.hidden = true;
      return;
    }
    this.#positions.hidden = false;
    const head = element("div", { className: "es-positions-head" });
    append(head, element("strong", { text: "Быстрые позиции" }), match.selectedMap ? element("span", { className: "es-badge", text: `Выбрана ${match.selectedMap}` }) : element("span", { className: "es-muted", text: "Карта ещё не выбрана" }), element("span", { className: "es-spacer" }), createWindowSelect(this.#settings.statsWindow, this.callbacks.onStatsWindow));
    const grid = element("div", { className: "es-position-grid" });
    for (const map of match.mapPool) grid.append(this.#positionCard(match, map));
    this.#positions.replaceChildren(head, grid);
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

  #header(title: string, customAction?: HTMLElement): HTMLElement {
    const head = element("header", { className: "es-head" });
    append(head, element("span", { className: "es-title", text: title }), element("span", { className: "es-badge", text: "EloScope" }), element("span", { className: "es-spacer" }), customAction);
    return head;
  }

}
