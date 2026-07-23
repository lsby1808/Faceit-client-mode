import {
  type DataState,
  type Player,
  type PlayerMatch,
  type PlayerRole,
} from "@eloscope/core";

import {
  buildProfileStatsModel,
  type ProfileStatsMapRow,
  type ProfileStatsModel,
} from "./profile-stats-model";

export const PROFILE_STATS_BANNER_ATTRIBUTE = "data-eloscope-profile-stats";

type BannerTab = "overview" | "combat" | "maps" | "role";

const TAB_ENTRIES: ReadonlyArray<readonly [BannerTab, string]> = [
  ["overview", "Обзор"],
  ["combat", "Бой"],
  ["maps", "Карты"],
  ["role", "Роль"],
];

const ROLE_LABELS: Record<PlayerRole, string> = {
  sniper: "Снайпер",
  entry: "Энтри",
  support: "Саппорт",
  anchor: "Опорник",
  rifler: "Рифлер",
};

const STYLES = `
  :host {
    display: block;
    width: 100%;
    min-width: 0;
    margin: 0 0 16px;
    color: #f4f6f8;
    font: 500 13px/1.35 Inter, "Segoe UI", sans-serif;
    color-scheme: dark;
    container-type: inline-size;
  }
  * { box-sizing: border-box; }
  button { font: inherit; }
  .banner {
    overflow: hidden;
    border: 1px solid #2a3037;
    border-radius: 10px;
    background: #0b0f13;
    box-shadow: 0 12px 28px #0005;
  }
  .header {
    display: flex;
    min-height: 58px;
    align-items: center;
    gap: 14px;
    padding: 10px 16px;
    border-bottom: 1px solid #252a30;
    background: #0d1116;
  }
  .brand {
    display: inline-grid;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #ff6a24;
    border-radius: 8px;
    color: #ff6a24;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: -.04em;
  }
  .heading { min-width: 175px; }
  .title {
    margin: 0;
    color: #f7f8fa;
    font-size: 14px;
    font-weight: 850;
  }
  .subtitle {
    margin-top: 2px;
    color: #89929e;
    font-size: 11px;
  }
  .role-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 3px 10px;
    border: 1px solid #8f3e14;
    border-radius: 999px;
    color: #ff8a4f;
    background: #26150e;
    font-size: 11px;
    font-weight: 750;
  }
  .tabs {
    display: flex;
    min-width: 0;
    margin-left: auto;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: thin;
  }
  .tab {
    min-height: 30px;
    padding: 5px 12px;
    border: 1px solid #242a31;
    border-radius: 6px;
    color: #9ea7b3;
    background: #090c10;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab[aria-selected="true"] {
    border-color: #a94013;
    color: #ff7a38;
    background: #26130b;
  }
  .tab:focus-visible { outline: 2px solid #50d8ff; outline-offset: 2px; }
  .window {
    display: inline-grid;
    min-width: 48px;
    min-height: 30px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid #30353c;
    border-radius: 6px;
    color: #f3f4f6;
    background: #171b20;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }
  .content { min-height: 124px; padding: 16px; }
  .content [hidden] { display: none !important; }
  .section-label {
    margin: 0 0 9px;
    color: #7f8996;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .metric-grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(92px, 1fr));
    gap: 10px;
    margin: 0;
  }
  .metric {
    min-width: 0;
    min-height: 62px;
    display: grid;
    align-content: center;
    justify-items: center;
    padding: 8px 7px;
    border: 1px solid #20262d;
    border-radius: 7px;
    background: #090c0f;
    text-align: center;
  }
  .metric dt {
    order: 0;
    margin: 0 0 3px;
    color: #7f8b99;
    font-size: 9px;
    font-weight: 750;
    letter-spacing: .055em;
    text-transform: uppercase;
  }
  .metric dd {
    order: 1;
    margin: 0;
    color: #f7f8fa;
    font-size: 16px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
  }
  .metric dd.accent { color: #64dcff; }
  .metric dd.good { color: #42df9a; }
  .metric dd.warn { color: #ff9b47; }
  .metric small {
    margin-top: 2px;
    color: #6f7b88;
    font-size: 9px;
  }
  .compact-grid {
    grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
  }
  .map-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
    gap: 10px;
  }
  .map-card {
    padding: 10px 12px;
    border: 1px solid #20262d;
    border-radius: 7px;
    background: #090c0f;
  }
  .map-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
  }
  .map-name { font-weight: 900; text-transform: uppercase; }
  .map-record { color: #8b95a1; font-size: 11px; }
  .map-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    color: #9ca6b2;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .map-stats strong { display: block; color: #e9edf1; font-size: 12px; }
  .role-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(92px, 1fr));
    gap: 10px;
  }
  .role-card {
    padding: 10px;
    border: 1px solid #20262d;
    border-radius: 7px;
    background: #090c0f;
    text-align: center;
  }
  .role-card[data-active="true"] { border-color: #a94013; background: #21120c; }
  .role-card strong {
    display: block;
    margin-top: 4px;
    color: #64dcff;
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  .state {
    min-height: 112px;
    display: grid;
    place-items: center;
    padding: 18px;
    color: #9aa4af;
    text-align: center;
  }
  .state strong { display: block; margin-bottom: 4px; color: #eef1f4; }
  .skeleton {
    width: min(520px, 75%);
    height: 12px;
    border-radius: 999px;
    background: linear-gradient(90deg, #171d24 15%, #28313a 45%, #171d24 75%);
    background-size: 220% 100%;
    animation: pulse 1.25s linear infinite;
  }
  @keyframes pulse { to { background-position: -220% 0; } }
  @container (max-width: 820px) {
    .header { flex-wrap: wrap; }
    .tabs { order: 3; width: 100%; margin-left: 0; }
    .window { margin-left: auto; }
    .metric-grid { grid-template-columns: repeat(4, minmax(92px, 1fr)); }
  }
  @container (max-width: 520px) {
    .header { padding: 10px 12px; }
    .content { padding: 12px; }
    .metric-grid, .role-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .map-grid { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
`;

function node<K extends keyof HTMLElementTagNameMap>(
  ownerDocument: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = ownerDocument.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function format(value: number | null, digits: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value: number | null, digits = 1): string {
  const rendered = format(value, digits);
  return rendered === "—" ? rendered : `${rendered}%`;
}

function metric(
  ownerDocument: Document,
  label: string,
  value: string,
  options: { tone?: "accent" | "good" | "warn"; hint?: string; title?: string } = {},
): HTMLElement {
  const wrapper = node(ownerDocument, "div", "metric");
  const term = node(ownerDocument, "dt", undefined, label);
  const description = node(ownerDocument, "dd", options.tone, value);
  if (options.title) wrapper.title = options.title;
  wrapper.append(term, description);
  if (options.hint) wrapper.append(node(ownerDocument, "small", undefined, options.hint));
  return wrapper;
}

function mapCard(ownerDocument: Document, map: ProfileStatsMapRow): HTMLElement {
  const card = node(ownerDocument, "article", "map-card");
  const head = node(ownerDocument, "div", "map-head");
  head.append(
    node(ownerDocument, "span", "map-name", map.map),
    node(ownerDocument, "span", "map-record", `${map.wins}–${map.losses} · ${percent(map.winRate)}`),
  );
  const stats = node(ownerDocument, "div", "map-stats");
  for (const [label, value] of [
    ["Матчи", String(map.matches)],
    ["AVG K", format(map.averageKills, 1)],
    ["K/D", format(map.kd, 2)],
    ["K/R", format(map.kr, 2)],
    ["ADR", format(map.adr, 1)],
  ] as const) {
    const item = node(ownerDocument, "span");
    item.append(node(ownerDocument, "strong", undefined, value), label);
    stats.append(item);
  }
  card.append(head, stats);
  return card;
}

function isRenderedLayoutElement(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style?.display === "none"
      || style?.visibility === "hidden"
      || style?.opacity === "0"
      || style?.contentVisibility === "hidden"
    ) return false;
    current = current.parentElement;
  }
  return true;
}

function findUniqueRendered(root: Document | HTMLElement, selector: string): HTMLElement | null {
  let candidates: NodeListOf<HTMLElement>;
  try {
    candidates = root.querySelectorAll<HTMLElement>(selector);
  } catch {
    return null;
  }
  const rendered = Array.from(candidates).filter(isRenderedLayoutElement);
  return rendered.length === 1 ? rendered[0] ?? null : null;
}

function profileAnchor(ownerDocument: Document): HTMLElement | null {
  const primaryCandidates = ownerDocument.querySelectorAll<HTMLElement>(
    '[class*="styles__PrimaryContent-sc-"]',
  );
  const candidates = Array.from(primaryCandidates)
    .filter(isRenderedLayoutElement)
    .map((primary) => ({
      primary,
      main: findUniqueRendered(primary, '[class*="styles__MainSection-sc-"]'),
    }))
    .filter((candidate): candidate is { primary: HTMLElement; main: HTMLElement } =>
      candidate.main !== null);
  if (candidates.length !== 1) return null;
  const main = candidates[0]?.main;
  if (!main) return null;
  const cardStack = findUniqueRendered(main, '[class*="styles__CardStack-sc-"]');
  if (!cardStack) return null;

  let anchor: HTMLElement = cardStack;
  while (anchor.parentElement && anchor.parentElement !== main) {
    anchor = anchor.parentElement;
  }
  return anchor.parentElement === main ? anchor : null;
}

export class ProfileStatsBannerRenderer {
  readonly #ownerDocument: Document;
  #host: HTMLElement | undefined;
  #shadow: ShadowRoot | undefined;
  #player: Player | undefined;
  #state: DataState<PlayerMatch[]> | undefined;
  #model: ProfileStatsModel | undefined;
  #tab: BannerTab = "overview";
  #dataSignature = "";
  #signature = "";

  constructor(ownerDocument: Document = document) {
    this.#ownerDocument = ownerDocument;
  }

  render(player: Player, state: DataState<PlayerMatch[]>): boolean {
    this.#player = player;
    this.#state = state;
    this.#model = state.status === "ready" ? buildProfileStatsModel(state.data) : undefined;
    this.#dataSignature = state.status === "ready"
      ? JSON.stringify([player.id, this.#model])
      : `${player.id}:${state.status}`;
    this.#signature = "";
    return this.sync();
  }

  sync(): boolean {
    if (!this.#player || !this.#state) {
      this.cleanup();
      return false;
    }
    const anchor = profileAnchor(this.#ownerDocument);
    if (!anchor) {
      this.#detach();
      return false;
    }

    if (!this.#host) this.#createHost();
    const host = this.#host as HTMLElement;
    if (host.getAttribute(PROFILE_STATS_BANNER_ATTRIBUTE) !== this.#player.id) {
      host.setAttribute(PROFILE_STATS_BANNER_ATTRIBUTE, this.#player.id);
    }
    for (const duplicate of this.#ownerDocument.querySelectorAll<HTMLElement>(
      `[${PROFILE_STATS_BANNER_ATTRIBUTE}]`,
    )) {
      if (duplicate !== host) duplicate.remove();
    }
    if (host.previousElementSibling !== anchor || host.parentElement !== anchor.parentElement) {
      anchor.after(host);
    }

    const signature = this.#renderSignature();
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#renderShadow();
    }
    return true;
  }

  cleanup(): void {
    this.#player = undefined;
    this.#state = undefined;
    this.#model = undefined;
    this.#dataSignature = "";
    this.#signature = "";
    this.#tab = "overview";
    this.#detach();
  }

  destroy(): void {
    this.cleanup();
    this.#host = undefined;
    this.#shadow = undefined;
  }

  #createHost(): void {
    const host = this.#ownerDocument.createElement("section");
    host.setAttribute(PROFILE_STATS_BANNER_ATTRIBUTE, this.#player?.id ?? "");
    host.style.display = "block";
    host.style.width = "100%";
    host.style.minWidth = "0";
    this.#host = host;
    this.#shadow = host.attachShadow({ mode: "open" });
  }

  #detach(): void {
    this.#host?.remove();
  }

  #renderSignature(): string {
    return `${this.#dataSignature}:${this.#tab}`;
  }

  #renderShadow(): void {
    const shadow = this.#shadow as ShadowRoot;
    const style = node(this.#ownerDocument, "style");
    style.textContent = STYLES;
    const banner = node(this.#ownerDocument, "section", "banner");
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-labelledby", "eloscope-profile-stats-title");
    banner.append(this.#header());

    const content = node(this.#ownerDocument, "div", "content");
    const state = this.#state as DataState<PlayerMatch[]>;
    if (state.status === "loading") {
      const loading = node(this.#ownerDocument, "div", "state");
      loading.setAttribute("role", "status");
      loading.setAttribute("aria-label", "Загрузка статистики последних матчей");
      loading.append(node(this.#ownerDocument, "div", "skeleton"));
      content.append(loading);
    } else if (state.status === "restricted") {
      content.append(this.#stateMessage(
        "Статистика недоступна",
        state.reason ?? "FACEIT ограничил чтение данных этого профиля.",
      ));
    } else if (state.status === "error") {
      content.append(this.#stateMessage(
        "Не удалось загрузить статистику",
        state.error.retryable
          ? "FACEIT временно не отвечает. Баннер обновится при следующей загрузке."
          : state.error.message,
      ));
    } else {
      const model = this.#model as ProfileStatsModel;
      if (model.sampleSize === 0) {
        content.append(this.#stateMessage(
          "Нет завершённых матчей",
          "Для расчёта нужны завершённые матчи CS2 5v5.",
        ));
      } else {
        content.append(this.#tabPanels(model));
      }
    }
    banner.append(content);
    shadow.replaceChildren(style, banner);
  }

  #header(): HTMLElement {
    const header = node(this.#ownerDocument, "header", "header");
    header.append(node(this.#ownerDocument, "span", "brand", "ES"));
    const heading = node(this.#ownerDocument, "div", "heading");
    const title = node(this.#ownerDocument, "h2", "title", "Статистика последних матчей");
    title.id = "eloscope-profile-stats-title";
    const subtitle = node(
      this.#ownerDocument,
      "div",
      "subtitle",
      "Только завершённые CS2 5v5 · данные FACEIT",
    );
    heading.append(title, subtitle);
    header.append(heading);

    const state = this.#state;
    const model = state?.status === "ready" ? this.#model : undefined;
    const role = model?.roleAnalysis.status === "known"
      ? ROLE_LABELS[model.roleAnalysis.role]
      : "Роль уточняется";
    const rolePill = node(this.#ownerDocument, "span", "role-pill", role);
    if (model?.roleAnalysis.status === "known") {
      rolePill.title = `Уверенность ${Math.round(model.roleAnalysis.confidence * 100)}% по ${model.roleAnalysis.sampleSize} матчам`;
    } else {
      rolePill.title = "Для уверенного определения роли нужны 20 завершённых матчей";
    }
    header.append(rolePill);

    const tabs = node(this.#ownerDocument, "div", "tabs");
    tabs.setAttribute("role", "tablist");
    for (const [value, label] of TAB_ENTRIES) {
      const button = node(this.#ownerDocument, "button", "tab", label);
      button.type = "button";
      button.id = `eloscope-profile-stats-tab-${value}`;
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(this.#tab === value));
      button.setAttribute("aria-controls", `eloscope-profile-stats-panel-${value}`);
      button.tabIndex = this.#tab === value ? 0 : -1;
      button.dataset.tab = value;
      button.addEventListener("click", () => this.#selectTab(value));
      button.addEventListener("keydown", (event) => this.#onTabKeydown(event, TAB_ENTRIES));
      tabs.append(button);
    }
    header.append(tabs, node(this.#ownerDocument, "span", "window", "20"));
    return header;
  }

  #selectTab(tab: BannerTab): void {
    if (this.#tab === tab) return;
    this.#tab = tab;
    this.#signature = "";
    this.#renderShadow();
    this.#shadow
      ?.querySelector<HTMLButtonElement>(`[role="tab"][data-tab="${tab}"]`)
      ?.focus();
  }

  #onTabKeydown(
    event: KeyboardEvent,
    entries: ReadonlyArray<readonly [BannerTab, string]>,
  ): void {
    const current = entries.findIndex(([tab]) => tab === this.#tab);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % entries.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + entries.length) % entries.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = entries.length - 1;
    else return;
    event.preventDefault();
    const tab = entries[next]?.[0];
    if (tab) this.#selectTab(tab);
  }

  #tabPanels(model: ProfileStatsModel): HTMLElement {
    const panels = node(this.#ownerDocument, "div");
    for (const [tab] of TAB_ENTRIES) {
      const panel = tab === this.#tab
        ? this.#tabContent(model, tab)
        : node(this.#ownerDocument, "section");
      panel.id = `eloscope-profile-stats-panel-${tab}`;
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", `eloscope-profile-stats-tab-${tab}`);
      panel.hidden = tab !== this.#tab;
      panels.append(panel);
    }
    return panels;
  }

  #tabContent(model: ProfileStatsModel, tab: BannerTab): HTMLElement {
    let panel: HTMLElement;
    switch (tab) {
      case "overview":
        panel = this.#overview(model);
        break;
      case "combat":
        panel = this.#combat(model);
        break;
      case "maps":
        panel = this.#maps(model);
        break;
      case "role":
        panel = this.#role(model);
        break;
    }
    return panel;
  }

  #overview(model: ProfileStatsModel): HTMLElement {
    const wrapper = node(this.#ownerDocument, "section");
    wrapper.setAttribute("role", "tabpanel");
    wrapper.append(node(
      this.#ownerDocument,
      "p",
      "section-label",
      `Последние ${model.sampleSize} ${model.sampleSize === 1 ? "матч" : "матчей"}`,
    ));
    const grid = node(this.#ownerDocument, "dl", "metric-grid");
    const headshotTitle = model.headshots.coveredMatches < model.sampleSize
      ? `FACEIT передал headshots для ${model.headshots.coveredMatches} из ${model.sampleSize} матчей`
      : undefined;
    grid.append(
      metric(this.#ownerDocument, "Победы / поражения", `${model.wins} / ${model.losses}`),
      metric(this.#ownerDocument, "Win rate", percent(model.winRate), {
        tone: model.winRate !== null && model.winRate >= 50 ? "good" : "warn",
      }),
      metric(
        this.#ownerDocument,
        "AVG K / D / A",
        `${format(model.average.kills, 1)} / ${format(model.average.deaths, 1)} / ${format(model.average.assists, 1)}`,
        { tone: "accent" },
      ),
      metric(this.#ownerDocument, "K/D", format(model.kd, 2), {
        tone: model.kd !== null && model.kd >= 1 ? "good" : "warn",
      }),
      metric(this.#ownerDocument, "K/R", format(model.kr, 2)),
      metric(this.#ownerDocument, "ADR", format(model.adr, 1), { tone: "accent" }),
      metric(
        this.#ownerDocument,
        "HS%",
        percent(model.headshots.coveredMatches === model.sampleSize ? model.headshots.value : null),
        {
        title: headshotTitle,
        hint: headshotTitle ? `${model.headshots.coveredMatches}/${model.sampleSize} матчей` : undefined,
        },
      ),
    );
    wrapper.append(grid);
    return wrapper;
  }

  #combat(model: ProfileStatsModel): HTMLElement {
    const wrapper = node(this.#ownerDocument, "section");
    wrapper.setAttribute("role", "tabpanel");
    wrapper.append(node(this.#ownerDocument, "p", "section-label", "Доступные боевые показатели"));
    const grid = node(this.#ownerDocument, "dl", "metric-grid compact-grid");
    const firstKillTitle = model.firstKills.coveredMatches < model.sampleSize
      ? `FACEIT передал first kills для ${model.firstKills.coveredMatches} из ${model.sampleSize} матчей`
      : undefined;
    grid.append(
      metric(
        this.#ownerDocument,
        "First kills",
        format(model.firstKills.coveredMatches === model.sampleSize ? model.firstKills.total : null, 0),
        {
        tone: "warn",
        title: firstKillTitle,
        hint: firstKillTitle ? `${model.firstKills.coveredMatches}/${model.sampleSize} матчей` : undefined,
        },
      ),
      metric(
        this.#ownerDocument,
        "First kills / round",
        format(model.firstKills.coveredMatches === model.sampleSize ? model.firstKills.rate : null, 3),
        {
        title: firstKillTitle,
        },
      ),
      metric(this.#ownerDocument, "Assists / round", format(model.assistsPerRound, 3)),
      metric(this.#ownerDocument, "Выживаемость", percent(model.survivalRate)),
    );
    wrapper.append(grid);
    return wrapper;
  }

  #maps(model: ProfileStatsModel): HTMLElement {
    const wrapper = node(this.#ownerDocument, "section");
    wrapper.setAttribute("role", "tabpanel");
    wrapper.append(node(this.#ownerDocument, "p", "section-label", "Карты в выбранных матчах"));
    if (model.maps.length === 0) {
      wrapper.append(this.#stateMessage("Карты недоступны", "FACEIT не передал названия карт для этой выборки."));
      return wrapper;
    }
    const grid = node(this.#ownerDocument, "div", "map-grid");
    for (const map of model.maps) grid.append(mapCard(this.#ownerDocument, map));
    wrapper.append(grid);
    return wrapper;
  }

  #role(model: ProfileStatsModel): HTMLElement {
    const wrapper = node(this.#ownerDocument, "section");
    wrapper.setAttribute("role", "tabpanel");
    wrapper.append(node(this.#ownerDocument, "p", "section-label", "Оценка игрового стиля по 20 матчам"));
    if (model.roleAnalysis.status !== "known") {
      wrapper.append(this.#stateMessage(
        "Роль ещё не определена",
        `Доступно ${model.roleAnalysis.sampleSize} из ${model.roleAnalysis.requiredMatches} нужных матчей.`,
      ));
      return wrapper;
    }
    const grid = node(this.#ownerDocument, "div", "role-grid");
    for (const role of ["sniper", "entry", "rifler", "support", "anchor"] as const) {
      const card = node(this.#ownerDocument, "article", "role-card");
      card.dataset.active = String(model.roleAnalysis.role === role);
      const score = model.roleAnalysis.scores[role];
      card.append(
        node(this.#ownerDocument, "span", undefined, ROLE_LABELS[role]),
        node(this.#ownerDocument, "strong", undefined, score === null ? "—" : String(Math.round(score * 100))),
      );
      grid.append(card);
    }
    wrapper.append(grid);
    return wrapper;
  }

  #stateMessage(title: string, description: string): HTMLElement {
    const wrapper = node(this.#ownerDocument, "div", "state");
    wrapper.setAttribute("role", "status");
    const copy = node(this.#ownerDocument, "div");
    copy.append(
      node(this.#ownerDocument, "strong", undefined, title),
      node(this.#ownerDocument, "span", undefined, description),
    );
    wrapper.append(copy);
    return wrapper;
  }
}
