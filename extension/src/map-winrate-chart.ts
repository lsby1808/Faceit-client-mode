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
export const INLINE_MAP_CARD_WINRATE_ATTRIBUTE = "data-eloscope-map-card-winrate";

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

const MAP_CARD_WINRATE_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    min-width: 132px;
    margin-left: auto;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .card-wr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 5px;
    min-width: 0;
    padding: 2px 0;
    font-variant-numeric: tabular-nums;
  }
  .team {
    min-width: 0;
    overflow: hidden;
    font-size: 10px;
    font-weight: 900;
    line-height: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .team.left { color: #ff8b49; text-align: right; }
  .team.right { color: #68ddf8; text-align: left; }
  .vs {
    color: #8f969f;
    font-size: 7px;
    font-weight: 900;
    letter-spacing: .06em;
  }
  .meta {
    grid-column: 1 / -1;
    overflow: hidden;
    color: #8f969f;
    font-size: 7px;
    font-weight: 800;
    line-height: 9px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

type ChartAnchor = Readonly<{
  kind: "selected";
  container: HTMLElement;
  after: HTMLElement;
  selected: HTMLElement;
}>;

type VotingChartAnchor = Readonly<{
  kind: "voting";
  container: HTMLElement;
  after: HTMLElement;
  cards: ReadonlyMap<string, HTMLElement>;
}>;

type AnyChartAnchor = ChartAnchor | VotingChartAnchor;

type ChartMount = {
  host: HTMLElement;
  winsHost: HTMLElement;
  cardHosts: HTMLElement[];
  anchor: AnyChartAnchor;
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

function cssString(value: string): string {
  return value.replace(/["\\]/gu, "\\$&");
}

function explicitVotingMapSelector(map: string): string {
  const value = cssString(map);
  return [
    `[data-testid="veto-map-${value}"]`,
    `[data-eloscope-contract="veto-map"][data-map-id="${value}"]`,
    `[data-map-id="${value}"]`,
  ].join(", ");
}

function normalizedElementText(element: HTMLElement): string | undefined {
  const text = element.textContent?.replace(/\s+/gu, " ").trim();
  return text ? domMapId(text) : undefined;
}

function isMapCardCandidate(element: HTMLElement, expectedMap: string): boolean {
  if (
    element === element.ownerDocument.body
    || element === element.ownerDocument.documentElement
    || ["SCRIPT", "STYLE", "OPTION", "SELECT"].includes(element.tagName)
  ) return false;
  if (!isRendered(element) || !hasRenderedBox(element)) return false;

  const explicitMap = element.dataset.mapId
    ?? element.dataset.map
    ?? element.dataset.testid?.replace(/^veto-map-/u, "").split("-")[0];
  if (domMapId(explicitMap) === expectedMap) return true;
  if (normalizedElementText(element) !== expectedMap) return false;

  // Prefer the smallest visible node that names the map. This keeps the
  // fallback from selecting the whole center column when a child card exists.
  return !Array.from(element.children).some((child) =>
    child instanceof HTMLElement
    && isRendered(child)
    && hasRenderedBox(child)
    && normalizedElementText(child) === expectedMap);
}

function uniqueVotingCardForMap(ownerDocument: Document, map: string): HTMLElement | undefined {
  const explicit = Array.from(ownerDocument.querySelectorAll<HTMLElement>(explicitVotingMapSelector(map)))
    .filter((candidate) => isMapCardCandidate(candidate, map));
  if (explicit.length === 1) return explicit[0];
  if (explicit.length > 1) return undefined;

  const textMatches = Array.from(ownerDocument.querySelectorAll<HTMLElement>("button, [role='button'], li, div, article, section"))
    .filter((candidate) => isMapCardCandidate(candidate, map));
  return textMatches.length === 1 ? textMatches[0] : undefined;
}

function discoverVotingChartAnchor(ownerDocument: Document, match: MatchContext): VotingChartAnchor | undefined {
  if (match.teams.length !== 2 || match.mapPool.length === 0) return undefined;
  const uniqueMaps = [...new Set(match.mapPool
    .map((map) => domMapId(map))
    .filter((map): map is string => map !== undefined))];
  if (uniqueMaps.length === 0) return undefined;

  const cards = new Map<string, HTMLElement>();
  for (const map of uniqueMaps) {
    const card = uniqueVotingCardForMap(ownerDocument, map);
    if (!card || cards.has(map)) return undefined;
    cards.set(map, card);
  }
  const uniqueCards = uniqueElements([...cards.values()]);
  if (uniqueCards.length !== cards.size) return undefined;
  const parent = uniqueCards[0]?.parentElement;
  if (
    !parent
    || parent === ownerDocument.body
    || parent === ownerDocument.documentElement
    || uniqueCards.some((card) => card.parentElement !== parent)
  ) return undefined;

  return {
    kind: "voting",
    container: parent,
    after: uniqueCards[uniqueCards.length - 1] as HTMLElement,
    cards,
  };
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
    return after ? { kind: "selected", container, after, selected } : undefined;
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
  return after ? { kind: "selected", container: finished, after, selected } : undefined;
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
  selectedMap: string | undefined,
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
  if (selectedMap && domMapId(comparison.map) === selectedMap) {
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
  const selectedMap = domMapId(match.selectedMap);
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

function renderMapCardWinRate(
  shadow: ShadowRoot,
  comparison: MapWinRateComparison,
): void {
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = MAP_CARD_WINRATE_STYLES;
  const left = comparison.teams[0];
  const right = comparison.teams[1];
  if (!left || !right) {
    shadow.replaceChildren(style);
    return;
  }

  const summary = ownerDocument.createElement("section");
  summary.className = "card-wr";
  summary.dataset.esCardMapWinrate = comparison.map;
  summary.setAttribute(
    "aria-label",
    `${comparison.map}: ${formatRate(left)} РїСЂРѕС‚РёРІ ${formatRate(right)}`,
  );
  const leftRate = ownerDocument.createElement("strong");
  leftRate.className = "team left";
  leftRate.textContent = formatRate(left);
  const versus = ownerDocument.createElement("span");
  versus.className = "vs";
  versus.textContent = "VS";
  const rightRate = ownerDocument.createElement("strong");
  rightRate.className = "team right";
  rightRate.textContent = formatRate(right);
  const meta = ownerDocument.createElement("span");
  meta.className = "meta";
  meta.textContent = `${left.knownPlayers}/${left.totalPlayers} · ${right.knownPlayers}/${right.totalPlayers}`;
  summary.append(leftRate, versus, rightRate, meta);
  shadow.replaceChildren(style, summary);
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
    showSelectedWins = true,
  ): MapWinRateChartRenderResult {
    const perspective = matchFromViewerPerspective(match, viewerTeamId);
    const visibleMatch = perspective.match;
    const anchor = discoverChartAnchor(this.#document, visibleMatch)
      ?? discoverVotingChartAnchor(this.#document, visibleMatch);
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
      showSelectedWins,
      anchorKind: anchor.kind,
      teamNames: visibleMatch.teams.map(({ id, name }) => [id, name]),
      comparisons,
    });

    let updated = 0;
    let mount = this.#mount;
    if (
      !mount
      || !mount.host.isConnected
      || !this.#sameAnchor(mount.anchor, anchor)
      || mount.host.parentElement !== anchor.container
    ) {
      mount?.host.remove();
      mount?.winsHost.remove();
      mount?.cardHosts.forEach((host) => host.remove());
      const host = this.#document.createElement("div");
      host.setAttribute(INLINE_MAP_WINRATE_ATTRIBUTE, visibleMatch.id);
      host.dataset.eloscopeMapWinrateMode = anchor.kind;
      if (anchor.kind === "voting") host.style.gridColumn = "1 / -1";
      const shadow = host.attachShadow({ mode: "open" });
      renderChart(shadow, visibleMatch, comparisons, window);
      const winsHost = this.#document.createElement("span");
      winsHost.setAttribute(INLINE_SELECTED_MAP_WINS_ATTRIBUTE, visibleMatch.id);
      const winsShadow = winsHost.attachShadow({ mode: "open" });
      if (anchor.kind === "selected" && showSelectedWins) {
        renderSelectedWins(winsShadow, visibleMatch, comparisons, perspective.viewerTeamId);
      }
      winsHost.hidden = anchor.kind !== "selected" || !showSelectedWins;
      winsHost.setAttribute("aria-hidden", String(anchor.kind !== "selected" || !showSelectedWins));
      const cardHosts = anchor.kind === "voting"
        ? this.#createCardHosts(anchor, visibleMatch.id, comparisons)
        : [];
      mount = { host, winsHost, cardHosts, anchor, signature };
      this.#mount = mount;
      updated = 1;
    } else if (mount.signature !== signature) {
      mount.host.setAttribute(INLINE_MAP_WINRATE_ATTRIBUTE, visibleMatch.id);
      mount.host.dataset.eloscopeMapWinrateMode = anchor.kind;
      mount.host.style.gridColumn = anchor.kind === "voting" ? "1 / -1" : "";
      renderChart(mount.host.shadowRoot as ShadowRoot, visibleMatch, comparisons, window);
      mount.winsHost.setAttribute(INLINE_SELECTED_MAP_WINS_ATTRIBUTE, visibleMatch.id);
      if (anchor.kind === "selected" && showSelectedWins) {
        renderSelectedWins(
          mount.winsHost.shadowRoot as ShadowRoot,
          visibleMatch,
          comparisons,
          perspective.viewerTeamId,
        );
      } else {
        mount.winsHost.shadowRoot?.replaceChildren();
      }
      mount.winsHost.hidden = anchor.kind !== "selected" || !showSelectedWins;
      mount.winsHost.setAttribute("aria-hidden", String(anchor.kind !== "selected" || !showSelectedWins));
      if (anchor.kind === "voting") {
        this.#updateCardHosts(mount.cardHosts, anchor, visibleMatch.id, comparisons);
      } else {
        mount.cardHosts.forEach((host) => host.remove());
        mount.cardHosts = [];
      }
      mount.anchor = anchor;
      mount.signature = signature;
      updated = 1;
    }

    if (
      anchor.kind === "selected"
      && (mount.winsHost.parentElement !== anchor.selected || anchor.selected.lastElementChild !== mount.winsHost)
    ) {
      anchor.selected.append(mount.winsHost);
      updated = 1;
    } else if (anchor.kind === "voting" && mount.winsHost.isConnected) {
      mount.winsHost.remove();
      updated = 1;
    }
    if (anchor.after.nextElementSibling !== mount.host) {
      anchor.after.insertAdjacentElement("afterend", mount.host);
      updated = 1;
    }
    if (anchor.kind === "voting" && this.#attachCardHosts(mount.cardHosts, anchor)) {
      updated = 1;
    }
    this.#removeOrphans(mount.host, mount.winsHost, mount.cardHosts);
    return { status: "rendered", updated };
  }

  cleanup(): number {
    let updated = 0;
    if (this.#mount) {
      if (
        this.#mount.host.isConnected
        || this.#mount.winsHost.isConnected
        || this.#mount.cardHosts.some((host) => host.isConnected)
      ) updated = 1;
      this.#mount.host.remove();
      this.#mount.winsHost.remove();
      this.#mount.cardHosts.forEach((host) => host.remove());
      this.#mount = undefined;
    }
    const orphans = Array.from(this.#document.querySelectorAll<HTMLElement>(
      `[${INLINE_MAP_WINRATE_ATTRIBUTE}], [${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}], [${INLINE_MAP_CARD_WINRATE_ATTRIBUTE}]`,
    ));
    if (orphans.length) updated = 1;
    orphans.forEach((host) => host.remove());
    return updated;
  }

  destroy(): void {
    this.cleanup();
  }

  #sameAnchor(previous: AnyChartAnchor, next: AnyChartAnchor): boolean {
    if (
      previous.kind !== next.kind
      || previous.container !== next.container
      || previous.after !== next.after
    ) return false;
    if (previous.kind === "selected" && next.kind === "selected") {
      return previous.selected === next.selected;
    }
    if (previous.kind === "voting" && next.kind === "voting") {
      if (previous.cards.size !== next.cards.size) return false;
      for (const [map, card] of previous.cards) {
        if (next.cards.get(map) !== card) return false;
      }
      return true;
    }
    return false;
  }

  #createCardHosts(
    anchor: VotingChartAnchor,
    matchId: string,
    comparisons: readonly MapWinRateComparison[],
  ): HTMLElement[] {
    return [...anchor.cards.keys()].map((map) => {
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_MAP_CARD_WINRATE_ATTRIBUTE, matchId);
      host.dataset.mapId = map;
      const shadow = host.attachShadow({ mode: "open" });
      const comparison = comparisons.find((candidate) => domMapId(candidate.map) === map);
      if (comparison) renderMapCardWinRate(shadow, comparison);
      return host;
    });
  }

  #updateCardHosts(
    hosts: HTMLElement[],
    anchor: VotingChartAnchor,
    matchId: string,
    comparisons: readonly MapWinRateComparison[],
  ): void {
    const expectedMaps = [...anchor.cards.keys()];
    if (hosts.length !== expectedMaps.length) {
      hosts.forEach((host) => host.remove());
      hosts.splice(0, hosts.length, ...this.#createCardHosts(anchor, matchId, comparisons));
      return;
    }
    hosts.forEach((host, index) => {
      const map = expectedMaps[index];
      if (!map) return;
      host.dataset.mapId = map;
      const comparison = comparisons.find((candidate) => domMapId(candidate.map) === map);
      if (comparison) renderMapCardWinRate(host.shadowRoot as ShadowRoot, comparison);
    });
  }

  #attachCardHosts(hosts: readonly HTMLElement[], anchor: VotingChartAnchor): boolean {
    let updated = false;
    for (const host of hosts) {
      const map = host.dataset.mapId;
      const card = map ? anchor.cards.get(map) : undefined;
      if (!card) continue;
      if (host.parentElement !== card || card.lastElementChild !== host) {
        card.append(host);
        updated = true;
      }
    }
    return updated;
  }

  #removeOrphans(current: HTMLElement, currentWins: HTMLElement, currentCards: readonly HTMLElement[]): void {
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`).forEach((host) => {
      if (host !== current) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`).forEach((host) => {
      if (host !== currentWins) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_MAP_CARD_WINRATE_ATTRIBUTE}]`).forEach((host) => {
      if (!currentCards.includes(host)) host.remove();
    });
  }
}
