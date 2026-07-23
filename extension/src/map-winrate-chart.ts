import {
  canonicalMapId,
  compareTeamMapWinRates,
  type MapWinRateComparison,
  type MatchContext,
  type PlayerMapStats,
  type StatsWindow,
  type TeamMapWinRateAggregate,
} from "@eloscope/core";

const LIVE_PREFERENCE_SELECTOR = '[data-testid="matchPreference"]';
const LIVE_VETO_SELECTOR = '[data-testid="mapsVetoHistory"]';
const LIVE_PREFERENCES_CONTAINER_SELECTOR = '[class*="Preferences__Container"]';
const LIVE_FINISHED_SECTION_SELECTOR = '[class*="Finished__Section"]';
const LIVE_FINISHED_CONTAINER_SELECTOR = '[class*="Finished__Container"]';
const LIVE_CONNECT_SELECTOR = 'a[data-testid="connect-to-server"][href^="steam://connect/"]';
const LIVE_BACK_TO_MATCHMAKING_SELECTOR = '[data-testid="back-to-matchmaking"]';
const EXPLICIT_MAP_SELECTORS = [
  '[data-testid="selected-map"][data-map-id]',
  '[data-testid="map-voting-result"][data-map]',
  '[data-eloscope-contract="selected-map"][data-map-id]',
] as const;

export const INLINE_MAP_WINRATE_ATTRIBUTE = "data-eloscope-inline-map-winrates";
export const INLINE_SELECTED_MAP_WINS_ATTRIBUTE = "data-eloscope-selected-map-wins";

const CHART_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    margin-top: 10px;
    container-type: inline-size;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .chart {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .11);
    border-radius: 6px;
    background: rgba(10, 12, 15, .98);
    color: #f2f4f7;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 9px 10px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, .09);
    background: rgba(255, 255, 255, .025);
  }
  .team {
    overflow: hidden;
    font-size: 10px;
    font-weight: 800;
    line-height: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team.left { color: #ff7a2c; text-align: left; }
  .team.right { color: #55d8f7; text-align: right; }
  .title {
    color: #aab0b9;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .055em;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .row {
    position: relative;
    min-width: 0;
    padding: 6px 7px 7px;
    border: 1px solid rgba(255, 255, 255, .075);
    border-radius: 5px;
    background: rgba(255, 255, 255, .018);
  }
  .rows {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
    padding: 6px;
  }
  .row[data-selected="true"] {
    grid-column: 1 / -1;
    background: linear-gradient(90deg, rgba(255, 107, 33, .07), rgba(53, 201, 239, .07));
    box-shadow: inset 2px 0 #ff6b21, inset -2px 0 #35c9ef;
  }
  .row-head {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
    margin-bottom: 3px;
    line-height: 11px;
  }
  .map {
    overflow: hidden;
    color: #f2f4f7;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: .045em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .selected {
    flex: 0 0 auto;
    border: 1px solid rgba(255, 107, 33, .45);
    border-radius: 999px;
    padding: 1px 4px;
    color: #ff985e;
    font-size: 6px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .values {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 5px;
    align-items: end;
  }
  .value { min-width: 0; }
  .value.right { text-align: right; }
  .wr {
    color: #eff2f5;
    font-size: 11px;
    font-weight: 900;
    line-height: 13px;
  }
  .value[data-leading="true"] .wr { color: var(--es-team-color); }
  .sample {
    display: block;
    overflow: hidden;
    margin-top: 0;
    color: #858c96;
    font-size: 7px;
    line-height: 9px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bars {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 1px minmax(0, 1fr);
    gap: 4px;
    align-items: center;
    margin-top: 3px;
  }
  .axis { width: 1px; height: 6px; background: rgba(255, 255, 255, .24); }
  .track {
    display: flex;
    height: 4px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, .075);
  }
  .track.left { justify-content: flex-end; }
  .fill { height: 100%; border-radius: inherit; }
  .track.left .fill { background: #ff6b21; }
  .track.right .fill { background: #35c9ef; }
  .advantage {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: #949ba5;
    font-size: 7px;
    font-weight: 700;
    line-height: 9px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .advantage[data-side="left"] { color: #ff985e; }
  .advantage[data-side="right"] { color: #77e2fb; }
  .footnote {
    padding: 6px 10px 7px;
    border-top: 1px solid rgba(255, 255, 255, .075);
    color: #69717c;
    font-size: 7px;
    line-height: 10px;
    text-align: center;
  }
  @container (max-width: 300px) {
    .rows { grid-template-columns: 1fr; }
    .row[data-selected="true"] { grid-column: auto; }
    .title { font-size: 8px; }
  }
`;

const SELECTED_WINS_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    flex: 1 1 auto;
    min-width: 170px;
    max-width: 260px;
    margin-left: auto;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .wins-summary {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 2px 10px;
    font-variant-numeric: tabular-nums;
  }
  .wins-team { min-width: 0; }
  .wins-team.right { text-align: right; }
  .wins-label {
    display: block;
    overflow: hidden;
    color: #8f969f;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: .04em;
    line-height: 9px;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .wins-value {
    display: block;
    margin-top: 1px;
    color: #ff8b49;
    font-size: 18px;
    font-weight: 950;
    line-height: 19px;
  }
  .wins-team.right .wins-value { color: #68ddf8; }
  .wins-unit {
    margin-left: 3px;
    color: #9da4ad;
    font-size: 7px;
    font-weight: 800;
    letter-spacing: .03em;
    text-transform: uppercase;
  }
  .wins-vs {
    color: #d8dbe0;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: .08em;
    text-align: center;
  }
`;

type ChartAnchor = Readonly<{
  container: HTMLElement;
  after: HTMLElement;
  selected: HTMLElement;
}>;

type ChartMount = {
  host: HTMLElement;
  winsHost: HTMLElement;
  anchor: ChartAnchor;
  signature: string;
};

export type MapWinRateChartRenderResult = Readonly<{
  status: "rendered" | "incompatible";
  updated: number;
}>;

function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if ((current instanceof HTMLElement && current.hidden) || current.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(current);
    if (
      style?.display === "none"
      || style?.visibility === "hidden"
      || (style !== undefined && style.opacity !== "" && Number.parseFloat(style.opacity) === 0)
    ) return false;
  }
  return true;
}

function hasRenderedBox(element: HTMLElement): boolean {
  if (element.dataset.eloscopeVisible === "true") return true;
  return [...element.getClientRects()].some(({ width, height }) => width > 0 && height > 0);
}

function domMapId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const canonical = canonicalMapId(value).replace(/[\s_-]+/gu, "");
  return canonical || undefined;
}

function uniqueElements(elements: readonly HTMLElement[]): HTMLElement[] {
  return [...new Set(elements)];
}

function actionSelector(match: MatchContext): string {
  const status = match.status.trim().toLowerCase();
  return status === "finished" || status === "cancelled"
    ? LIVE_BACK_TO_MATCHMAKING_SELECTOR
    : LIVE_CONNECT_SELECTOR;
}

function uniqueVisibleAction(ownerDocument: Document, match: MatchContext): HTMLElement | undefined {
  const candidates = Array.from(
    ownerDocument.querySelectorAll<HTMLElement>(actionSelector(match)),
  ).filter((candidate) => isRendered(candidate) && hasRenderedBox(candidate));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function directChildWithin(element: HTMLElement, container: HTMLElement): HTMLElement | undefined {
  let current = element;
  while (current.parentElement && current.parentElement !== container) {
    current = current.parentElement;
  }
  return current.parentElement === container ? current : undefined;
}

function discoverChartAnchor(ownerDocument: Document, match: MatchContext): ChartAnchor | undefined {
  const expectedMap = domMapId(match.selectedMap);
  if (!expectedMap || match.teams.length !== 2) return undefined;
  const action = uniqueVisibleAction(ownerDocument, match);
  if (!action) return undefined;

  const explicit = EXPLICIT_MAP_SELECTORS.flatMap((selector) =>
    Array.from(ownerDocument.querySelectorAll<HTMLElement>(selector)).filter(isRendered));
  const live = Array.from(ownerDocument.querySelectorAll<HTMLElement>(LIVE_PREFERENCE_SELECTOR))
    .filter(isRendered)
    .filter((candidate) => candidate.previousElementSibling?.querySelector(LIVE_VETO_SELECTOR));
  const candidates = uniqueElements([...explicit, ...live]);
  if (candidates.length !== 1) return undefined;

  const selected = candidates[0] as HTMLElement;
  const isExplicit = EXPLICIT_MAP_SELECTORS.some((selector) => selected.matches(selector));
  if (isExplicit) {
    const declaredMap = selected.dataset.mapId ?? selected.dataset.map;
    const declaredContainer = selected.closest<HTMLElement>('[data-eloscope-contract="match-center"]');
    const container = declaredContainer ?? selected.parentElement;
    if (
      domMapId(declaredMap) !== expectedMap
      || !container
      || container === ownerDocument.body
      || container === ownerDocument.documentElement
      || !container.contains(action)
      || (!declaredContainer && action.parentElement !== container)
    ) return undefined;
    const after = directChildWithin(action, container);
    return after ? { container, after, selected } : undefined;
  }

  if (domMapId(selected.textContent ?? undefined) !== expectedMap) return undefined;
  const preferences = selected.parentElement;
  const section = preferences?.parentElement;
  const finished = section?.parentElement;
  if (
    !preferences
    || !section
    || !finished
    || !preferences.matches(LIVE_PREFERENCES_CONTAINER_SELECTOR)
    || !section.matches(LIVE_FINISHED_SECTION_SELECTOR)
    || !finished.matches(LIVE_FINISHED_CONTAINER_SELECTOR)
    || preferences.parentElement !== section
    || section.parentElement !== finished
  ) return undefined;
  if (!finished.contains(action)) return undefined;
  const after = directChildWithin(action, finished);
  return after ? { container: finished, after, selected } : undefined;
}

function teamName(comparison: MapWinRateComparison, index: number, match: MatchContext): string {
  return comparison.teams[index]?.teamName ?? match.teams[index]?.name ?? match.teams[index]?.id ?? "—";
}

function safeRate(team: TeamMapWinRateAggregate): number | undefined {
  if (team.status !== "ready" || !Number.isFinite(team.winRate)) return undefined;
  return Math.min(100, Math.max(0, team.winRate));
}

function formatRate(team: TeamMapWinRateAggregate): string {
  const value = safeRate(team);
  return value === undefined ? "—" : `${value.toFixed(1)}%`;
}

function formatMatches(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function sampleLabel(team: TeamMapWinRateAggregate): string {
  const coverage = `${team.knownPlayers}/${team.totalPlayers}`;
  return team.status === "ready"
    ? `${formatMatches(team.sampleMatches)} матчей · ${coverage}`
    : `— матчей · ${coverage}`;
}

function completeRosterWins(team: TeamMapWinRateAggregate): number | undefined {
  return team.status === "ready"
    && team.totalPlayers === 5
    && team.knownPlayers === 5
    && Number.isSafeInteger(team.wins)
    && team.wins >= 0
    ? team.wins
    : undefined;
}

function matchFromViewerPerspective(
  match: MatchContext,
  viewerTeamId: string | undefined,
): Readonly<{ match: MatchContext; viewerTeamId?: string }> {
  if (!viewerTeamId || match.teams.length !== 2) return { match };
  const matching = match.teams.filter(({ id }) => id === viewerTeamId);
  if (matching.length !== 1) return { match };
  const opponent = match.teams.find(({ id }) => id !== viewerTeamId);
  if (!opponent) return { match };
  return {
    match: {
      ...match,
      teams: [matching[0] as MatchContext["teams"][number], opponent],
    },
    viewerTeamId,
  };
}

function winsTeamNode(
  ownerDocument: Document,
  team: TeamMapWinRateAggregate,
  side: "left" | "right",
  label: string,
  map: string,
): HTMLElement {
  const node = ownerDocument.createElement("div");
  node.className = `wins-team ${side}`;
  node.dataset.esWinsTeamId = team.teamId;
  const wins = completeRosterWins(team);
  node.dataset.status = wins === undefined ? "unavailable" : "ready";
  const detail = wins === undefined
    ? `Данные на ${map} доступны для ${team.knownPlayers}/${team.totalPlayers} игроков`
    : `Суммарные победы пяти игроков на ${map}: ${formatMatches(wins)}`;
  node.title = detail;
  node.setAttribute("aria-label", `${label}: ${detail}`);

  const name = ownerDocument.createElement("small");
  name.className = "wins-label";
  name.textContent = label;
  const value = ownerDocument.createElement("strong");
  value.className = "wins-value";
  value.textContent = wins === undefined ? "—" : formatMatches(wins);
  const unit = ownerDocument.createElement("span");
  unit.className = "wins-unit";
  unit.textContent = "побед";
  value.append(unit);
  node.append(name, value);
  return node;
}

function selectedWinsSummary(
  ownerDocument: Document,
  match: MatchContext,
  comparisons: readonly MapWinRateComparison[],
  viewerTeamId: string | undefined,
): HTMLElement | undefined {
  const selectedMap = domMapId(match.selectedMap);
  const comparison = comparisons.find(({ map }) => domMapId(map) === selectedMap);
  const left = comparison?.teams[0];
  const right = comparison?.teams[1];
  if (!comparison || !left || !right) return undefined;

  const viewerKnown = viewerTeamId !== undefined && left.teamId === viewerTeamId;
  const summary = ownerDocument.createElement("section");
  summary.className = "wins-summary";
  summary.dataset.esSelectedMapWins = comparison.map;
  summary.setAttribute(
    "aria-label",
    `Суммарные победы игроков на ${comparison.map}: ${teamName(comparison, 0, match)} против ${teamName(comparison, 1, match)}`,
  );
  const versus = ownerDocument.createElement("span");
  versus.className = "wins-vs";
  versus.textContent = "VS";
  summary.append(
    winsTeamNode(
      ownerDocument,
      left,
      "left",
      viewerKnown ? "Наша команда" : teamName(comparison, 0, match),
      comparison.map,
    ),
    versus,
    winsTeamNode(
      ownerDocument,
      right,
      "right",
      viewerKnown ? "Соперники" : teamName(comparison, 1, match),
      comparison.map,
    ),
  );
  return summary;
}

function valueNode(
  ownerDocument: Document,
  team: TeamMapWinRateAggregate,
  side: "left" | "right",
  leading: boolean,
): HTMLElement {
  const value = ownerDocument.createElement("div");
  value.className = `value ${side}`;
  value.dataset.esTeamId = team.teamId;
  value.dataset.status = team.status;
  value.dataset.leading = String(leading);
  value.style.setProperty("--es-team-color", side === "left" ? "#ff985e" : "#77e2fb");

  const rate = ownerDocument.createElement("strong");
  rate.className = "wr";
  rate.textContent = formatRate(team);
  const sample = ownerDocument.createElement("small");
  sample.className = "sample";
  sample.textContent = sampleLabel(team);
  value.append(rate, sample);
  return value;
}

function advantageNode(
  ownerDocument: Document,
  comparison: MapWinRateComparison,
  leftName: string,
  rightName: string,
): HTMLElement {
  const node = ownerDocument.createElement("div");
  node.className = "advantage";
  node.dataset.esAdvantage = "";
  if (comparison.advantage.status !== "ready") {
    node.dataset.side = "unavailable";
    node.textContent = "—";
    node.title = "Недостаточно данных для сравнения";
    return node;
  }

  const difference = comparison.advantage.percentagePoints.toFixed(1);
  const leaderId = comparison.advantage.leaderTeamId;
  if (leaderId === null) {
    node.dataset.side = "tie";
    node.textContent = "= 0.0 п.п.";
    node.title = "Равный винрейт";
  } else if (leaderId === comparison.teams[0]?.teamId) {
    node.dataset.side = "left";
    node.textContent = `← +${difference} п.п.`;
    node.title = `${leftName}: преимущество ${difference} п.п.`;
  } else {
    node.dataset.side = "right";
    node.textContent = `+${difference} п.п. →`;
    node.title = `${rightName}: преимущество ${difference} п.п.`;
  }
  return node;
}

function chartRow(
  ownerDocument: Document,
  comparison: MapWinRateComparison,
  match: MatchContext,
  selectedMap: string,
): HTMLElement | undefined {
  const left = comparison.teams[0];
  const right = comparison.teams[1];
  if (!left || !right) return undefined;
  const leftName = teamName(comparison, 0, match);
  const rightName = teamName(comparison, 1, match);
  const leaderId = comparison.advantage.status === "ready" ? comparison.advantage.leaderTeamId : null;
  const row = ownerDocument.createElement("article");
  row.className = "row";
  row.dataset.esMapRow = comparison.map;
  row.dataset.selected = String(domMapId(comparison.map) === selectedMap);

  const head = ownerDocument.createElement("div");
  head.className = "row-head";
  const map = ownerDocument.createElement("strong");
  map.className = "map";
  map.textContent = comparison.map;
  head.append(map);
  if (domMapId(comparison.map) === selectedMap) {
    const selected = ownerDocument.createElement("span");
    selected.className = "selected";
    selected.textContent = "выбрана";
    head.append(selected);
  }
  head.append(advantageNode(ownerDocument, comparison, leftName, rightName));

  const values = ownerDocument.createElement("div");
  values.className = "values";
  values.append(
    valueNode(ownerDocument, left, "left", leaderId === left.teamId),
    valueNode(ownerDocument, right, "right", leaderId === right.teamId),
  );

  const bars = ownerDocument.createElement("div");
  bars.className = "bars";
  bars.setAttribute("role", "img");
  bars.setAttribute(
    "aria-label",
    `${comparison.map}: ${leftName} ${formatRate(left)}, ${rightName} ${formatRate(right)}`,
  );
  for (const [team, side] of [[left, "left"], [right, "right"]] as const) {
    const track = ownerDocument.createElement("span");
    track.className = `track ${side}`;
    const fill = ownerDocument.createElement("i");
    fill.className = "fill";
    const rate = safeRate(team);
    if (rate === undefined) fill.hidden = true;
    else fill.style.width = `${rate}%`;
    track.append(fill);
    bars.append(track);
    if (side === "left") {
      const axis = ownerDocument.createElement("i");
      axis.className = "axis";
      bars.append(axis);
    }
  }

  row.append(head, values, bars);
  return row;
}

function renderChart(
  shadow: ShadowRoot,
  match: MatchContext,
  comparisons: readonly MapWinRateComparison[],
  window: StatsWindow,
): void {
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = CHART_STYLES;
  const chart = ownerDocument.createElement("section");
  chart.className = "chart";
  chart.dataset.esMapWinrates = "";
  chart.setAttribute("aria-label", "Сравнение винрейта команд по картам");

  const firstComparison = comparisons[0];
  const header = ownerDocument.createElement("header");
  header.className = "header";
  const left = ownerDocument.createElement("span");
  left.className = "team left";
  left.textContent = firstComparison ? teamName(firstComparison, 0, match) : match.teams[0]?.name ?? "Команда 1";
  const title = ownerDocument.createElement("span");
  title.className = "title";
  title.textContent = "WR по картам";
  const right = ownerDocument.createElement("span");
  right.className = "team right";
  right.textContent = firstComparison ? teamName(firstComparison, 1, match) : match.teams[1]?.name ?? "Команда 2";
  header.append(left, title, right);
  chart.append(header);

  const rows = ownerDocument.createElement("div");
  rows.className = "rows";
  const selectedMap = domMapId(match.selectedMap) as string;
  for (const comparison of comparisons) {
    const row = chartRow(ownerDocument, comparison, match, selectedMap);
    if (row) rows.append(row);
  }
  chart.append(rows);

  const footnote = ownerDocument.createElement("footer");
  footnote.className = "footnote";
  footnote.textContent = `WR по последним ${window} матчам каждого игрока · X/5 — покрытие состава`;
  chart.append(footnote);
  shadow.replaceChildren(style, chart);
}

function renderSelectedWins(
  shadow: ShadowRoot,
  match: MatchContext,
  comparisons: readonly MapWinRateComparison[],
  viewerTeamId: string | undefined,
): void {
  const style = shadow.ownerDocument.createElement("style");
  style.textContent = SELECTED_WINS_STYLES;
  const summary = selectedWinsSummary(shadow.ownerDocument, match, comparisons, viewerTeamId);
  shadow.replaceChildren(style, ...(summary ? [summary] : []));
}

/**
 * Mounts a fail-closed total inside the selected-map card and the comparison
 * chart below FACEIT's connect/back-to-matchmaking action. It never guesses
 * between ambiguous DOM contracts, actions, or mismatched maps.
 */
export class MatchMapWinRateChartRenderer {
  readonly #document: Document;
  #mount?: ChartMount;

  constructor(ownerDocument: Document = document) {
    this.#document = ownerDocument;
  }

  render(
    match: MatchContext,
    playerMapStats: ReadonlyMap<string, readonly PlayerMapStats[]>,
    viewerTeamId?: string,
    window: StatsWindow = 30,
  ): MapWinRateChartRenderResult {
    const perspective = matchFromViewerPerspective(match, viewerTeamId);
    const visibleMatch = perspective.match;
    const anchor = discoverChartAnchor(this.#document, visibleMatch);
    if (!anchor) {
      const updated = this.cleanup();
      return { status: "incompatible", updated };
    }

    const comparisons = compareTeamMapWinRates(visibleMatch, playerMapStats);
    if (!comparisons.length || comparisons.some((comparison) => comparison.teams.length !== 2)) {
      const updated = this.cleanup();
      return { status: "incompatible", updated };
    }
    const signature = JSON.stringify({
      matchId: visibleMatch.id,
      selectedMap: domMapId(visibleMatch.selectedMap),
      viewerTeamId: perspective.viewerTeamId,
      window,
      teamNames: visibleMatch.teams.map(({ id, name }) => [id, name]),
      comparisons,
    });

    let updated = 0;
    let mount = this.#mount;
    if (
      !mount
      || !mount.host.isConnected
      || !mount.winsHost.isConnected
      || mount.anchor.container !== anchor.container
      || mount.anchor.after !== anchor.after
      || mount.anchor.selected !== anchor.selected
      || mount.host.parentElement !== anchor.container
      || mount.winsHost.parentElement !== anchor.selected
    ) {
      mount?.host.remove();
      mount?.winsHost.remove();
      const host = this.#document.createElement("div");
      host.setAttribute(INLINE_MAP_WINRATE_ATTRIBUTE, visibleMatch.id);
      const shadow = host.attachShadow({ mode: "open" });
      renderChart(shadow, visibleMatch, comparisons, window);
      const winsHost = this.#document.createElement("span");
      winsHost.setAttribute(INLINE_SELECTED_MAP_WINS_ATTRIBUTE, visibleMatch.id);
      const winsShadow = winsHost.attachShadow({ mode: "open" });
      renderSelectedWins(winsShadow, visibleMatch, comparisons, perspective.viewerTeamId);
      mount = { host, winsHost, anchor, signature };
      this.#mount = mount;
      updated = 1;
    } else if (mount.signature !== signature) {
      mount.host.setAttribute(INLINE_MAP_WINRATE_ATTRIBUTE, visibleMatch.id);
      renderChart(mount.host.shadowRoot as ShadowRoot, visibleMatch, comparisons, window);
      mount.winsHost.setAttribute(INLINE_SELECTED_MAP_WINS_ATTRIBUTE, visibleMatch.id);
      renderSelectedWins(
        mount.winsHost.shadowRoot as ShadowRoot,
        visibleMatch,
        comparisons,
        perspective.viewerTeamId,
      );
      mount.signature = signature;
      updated = 1;
    }

    if (mount.winsHost.parentElement !== anchor.selected || anchor.selected.lastElementChild !== mount.winsHost) {
      anchor.selected.append(mount.winsHost);
      updated = 1;
    }
    if (anchor.after.nextElementSibling !== mount.host) {
      anchor.after.insertAdjacentElement("afterend", mount.host);
      updated = 1;
    }
    this.#removeOrphans(mount.host, mount.winsHost);
    return { status: "rendered", updated };
  }

  cleanup(): number {
    let updated = 0;
    if (this.#mount) {
      if (this.#mount.host.isConnected || this.#mount.winsHost.isConnected) updated = 1;
      this.#mount.host.remove();
      this.#mount.winsHost.remove();
      this.#mount = undefined;
    }
    const orphans = Array.from(this.#document.querySelectorAll<HTMLElement>(
      `[${INLINE_MAP_WINRATE_ATTRIBUTE}], [${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`,
    ));
    if (orphans.length) updated = 1;
    orphans.forEach((host) => host.remove());
    return updated;
  }

  destroy(): void {
    this.cleanup();
  }

  #removeOrphans(current: HTMLElement, currentWins: HTMLElement): void {
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`).forEach((host) => {
      if (host !== current) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`).forEach((host) => {
      if (host !== currentWins) host.remove();
    });
  }
}
