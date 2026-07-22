import {
  aggregatePlayerMatches,
  calculateFormBattery,
  classifyPlayerRole,
  eligibleMatches,
  getEloTier,
  type FormBattery,
  type MatchContext,
  type MatchTeam,
  type Player,
  type PlayerMapStats,
  type PlayerMatch,
  type PlayerRole,
  type StatsWindow,
} from "@eloscope/core";
import { MatchMapWinRateChartRenderer } from "./map-winrate-chart";

export { INLINE_MAP_WINRATE_ATTRIBUTE } from "./map-winrate-chart";

const ROSTER_SELECTOR = '[class*="Roster__Group-sc-"]';
const NICKNAME_SELECTOR = '[class*="Nickname__Name-sc-"]';
const NICKNAME_CONTAINER_SELECTOR = '[class*="Nickname__Container-sc-"]';
const NICKNAME_SLOT_SELECTOR = '[class*="styles__NicknameContainer-sc-"]';
const PLAYER_CARD_SELECTOR = '[class*="ListContentPlayer__Background-sc-"]';
const PLAYER_HOLDER_SELECTOR = '[class*="styles__Holder-sc-"]';
const PLAYER_LEVEL_SELECTOR = '[class*="SkillIcon__StyledSvg-sc-"]';
const AVATAR_HOLDER_SELECTOR = '[class*="Avatar__AvatarHolder-sc-"]';
const AVATAR_IMAGE_SELECTOR =
  'img[class*="Avatar__Image-sc-"][aria-label="avatar"], i[class*="Avatar__AvatarIcon-sc-"][aria-label="avatar"]';
const MATCH_HEADER_WRAPPER_SELECTOR = '[class*="styles__HeaderWrapper-sc-"]';
const MATCH_HEADER_FACTION_SELECTOR = '[class*="styles__Faction-sc-"]';
const MATCH_HEADER_FACTION_NAME_SELECTOR = '[class*="styles__StyledFactionName-sc-"]';

export const INLINE_PLAYER_ATTRIBUTE = "data-eloscope-inline-player";
export const INLINE_TEAM_ATTRIBUTE = "data-eloscope-inline-team";
export const INLINE_BATTERY_ATTRIBUTE = "data-eloscope-inline-battery";
export const INLINE_TIER_ATTRIBUTE = "data-eloscope-inline-tier";
export const INLINE_ROLE_ATTRIBUTE = "data-eloscope-inline-role";

const PLAYER_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    flex: 0 0 100%;
    grid-column: 1 / -1;
    container-type: inline-size;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .card {
    width: 100%;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .12);
    border-top: 0;
    border-radius: 0 0 5px 5px;
    background: rgba(8, 10, 12, .97);
    color: #f4f5f6;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .map, .overall {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    padding: 6px 8px;
  }
  .map { border-bottom: 1px solid rgba(255, 255, 255, .1); }
  .map strong { overflow: hidden; color: #ff6b21; letter-spacing: .035em; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }
  .map .metric { color: #f1f3f5; white-space: nowrap; }
  .map .empty { color: #8a9099; }
  .spacer { flex: 1 1 auto; min-width: 3px; }
  .country {
    color: #d8dde5;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .premade { color: #ff9d5a; font-size: 11px; line-height: 1; }
  .elo { color: #aeb4bc; white-space: nowrap; }
  .overall { justify-content: space-between; gap: 4px; padding-block: 7px; }
  .stat { min-width: 0; padding: 0 5px; text-align: center; border-left: 1px solid rgba(255, 255, 255, .1); }
  .stat:first-child { border-left: 0; }
  .stat b { display: block; overflow: hidden; color: #e8eaed; font-size: 11px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .stat small { display: block; margin-top: 2px; color: #858b94; font-size: 9px; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
  .no-data { width: 100%; padding: 2px 0; color: #858b94; text-align: center; }
  @container (max-width: 500px) {
    .map { gap: 6px; }
    .map .optional { display: none; }
    .stat { padding-inline: 2px; }
  }
  @container (max-width: 340px) {
    .country, .elo { display: none; }
  }
`;

const BATTERY_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 auto;
    align-items: center;
    align-self: center;
    margin-left: 6px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .battery {
    display: inline-flex;
    align-items: flex-end;
    gap: 1px;
    width: 27px;
    height: 13px;
    border: 1px solid currentColor;
    border-radius: 3px;
    padding: 2px 3px;
    outline: none;
  }
  .battery::after {
    content: "";
    align-self: center;
    width: 2px;
    height: 5px;
    margin-right: -6px;
    border-radius: 0 2px 2px 0;
    background: currentColor;
  }
  .battery i { width: 3px; height: 7px; border-radius: 1px; background: rgba(255, 255, 255, .13); }
  .battery i[data-on="true"] { background: currentColor; }
  .battery:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const TIER_STYLES = `
  :host {
    color-scheme: dark;
    display: inline-flex !important;
    flex: 0 0 var(--es-tier-size, 30px);
    width: var(--es-tier-size, 30px);
    height: var(--es-tier-size, 30px);
    align-items: center;
    justify-content: center;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .tier {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    border: 2px solid #35c9ef;
    border-radius: 50%;
    background: #0b1115;
    color: #5ddcff;
    box-shadow: inset 0 0 0 2px rgba(53, 201, 239, .1), 0 0 8px rgba(53, 201, 239, .18);
    font-size: 11px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    outline: none;
  }
  .tier:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const ROLE_STYLES = `
  :host {
    color-scheme: dark;
    position: absolute !important;
    inset: 0 !important;
    z-index: 0;
    display: block !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .role {
    display: grid;
    width: 100%;
    height: 100%;
    grid-template-rows: minmax(0, 1fr) auto;
    place-items: center;
    gap: 0;
    padding: 3px 2px 2px;
    background: #080a0d;
    background: radial-gradient(circle at 50% 38%, color-mix(in srgb, currentColor 15%, #11151a), #080a0d 72%);
    color: var(--es-role-color);
  }
  svg {
    display: block;
    width: min(64%, 25px);
    height: min(64%, 25px);
    overflow: visible;
  }
  .label {
    max-width: 100%;
    overflow: hidden;
    color: var(--es-role-color);
    font-size: clamp(6px, 18%, 8px);
    font-weight: 900;
    letter-spacing: .04em;
    line-height: 1;
    text-overflow: clip;
    text-transform: uppercase;
    white-space: nowrap;
  }
`;

const TEAM_STYLES = `
  :host {
    color-scheme: dark;
    position: absolute !important;
    bottom: 9px !important;
    z-index: 2;
    display: inline-flex !important;
    box-sizing: border-box;
    max-width: calc(50% - 24px);
    align-items: center;
    pointer-events: none !important;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  :host([data-eloscope-team-side="left"]) { left: 16px !important; }
  :host([data-eloscope-team-side="right"]) { right: 16px !important; }
  *, *::before, *::after { box-sizing: border-box; }
  .metric {
    display: inline-flex;
    align-items: center;
    color: #f3f4f6;
    font-size: 11px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: .025em;
    line-height: 16px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, .9);
    white-space: nowrap;
  }
`;

export type InlineMatchSettings = Readonly<{
  statsWindow: StatsWindow;
  showExtendedTier: boolean;
  showPlayerRoles: boolean;
  showMapWinRates: boolean;
}>;

export type InlineMatchFailure =
  | "invalid-match-roster"
  | "roster-contract"
  | "team-roster-ambiguous"
  | "nickname-ambiguous"
  | "player-card-contract"
  | "player-holder-contract";

export type InlineMatchRenderResult =
  | Readonly<{ status: "rendered"; players: number; teams: number; updated: number }>
  | Readonly<{ status: "incompatible"; reason: InlineMatchFailure }>;

type PlayerAnchor = Readonly<{
  player: Player;
  card: HTMLElement;
  holder: HTMLElement;
  nicknameContainer?: HTMLElement;
  nicknameSlot?: HTMLElement;
  nativeLevel?: SVGSVGElement;
  avatarHolder?: HTMLElement;
  nativeAvatar?: HTMLElement;
}>;

type TeamAnchor = Readonly<{
  team: MatchTeam;
  roster: HTMLElement;
  players: readonly PlayerAnchor[];
}>;

type TeamHeaderSide = "left" | "right";

type TeamHeaderAnchor = Readonly<{
  team: MatchTeam;
  container: HTMLElement;
  side: TeamHeaderSide;
}>;

type Mount = {
  host: HTMLElement;
  signature: string;
};

type TierMount = Mount & {
  nativeLevel: SVGSVGElement;
  tierSize: number;
  previousDisplay: string;
  previousDisplayPriority: string;
  previousAriaHidden: string | null;
};

type RoleMount = Mount & {
  avatarHolder: HTMLElement;
  nativeAvatar: HTMLElement;
  previousDisplay: string;
  previousDisplayPriority: string;
  previousAriaHidden: string | null;
  previousTitle: string | null;
};

function normalizedNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if ((current instanceof HTMLElement && current.hidden) || current.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

function isSafeAvatarOverlayHolder(element: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (!style || !style.position || style.position === "static") return false;
  const rect = element.getBoundingClientRect();
  const width = rect.width > 0 ? rect.width : Number.parseFloat(style.width);
  const height = rect.height > 0 ? rect.height : Number.parseFloat(style.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 24 || height < 24 || width > 96 || height > 96) {
    return false;
  }
  const ratio = width / height;
  return ratio >= 0.75 && ratio <= 1.25;
}

function format(value: number | undefined, digits = 1): string {
  return value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function percent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function canonicalMap(value: string | undefined): string | undefined {
  return value?.trim().replace(/^de_/iu, "").toLocaleLowerCase("en-US");
}

function nativeLevelSize(element: SVGSVGElement): number {
  const clamp = (value: number): number => Math.min(40, Math.max(24, Math.round(value)));
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) return clamp(Math.min(rect.width, rect.height));

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const computedWidth = Number.parseFloat(style?.width ?? "");
  const computedHeight = Number.parseFloat(style?.height ?? "");
  if (computedWidth > 0 && computedHeight > 0) return clamp(Math.min(computedWidth, computedHeight));

  const viewBox = element.getAttribute("viewBox")?.trim().split(/[ ,]+/u).map(Number);
  if (viewBox?.length === 4 && (viewBox[2] ?? 0) > 0 && (viewBox[3] ?? 0) > 0) {
    return clamp(Math.min(viewBox[2] as number, viewBox[3] as number));
  }
  return 30;
}

function lifetimeMatchCount(rows: readonly PlayerMapStats[] | undefined): number | undefined {
  if (!rows) return undefined;
  const matchesByMap = new Map<string, number>();
  for (const row of rows) {
    const map = canonicalMap(row.map);
    if (!map || !Number.isFinite(row.matches) || row.matches < 0) continue;
    matchesByMap.set(map, Math.max(matchesByMap.get(map) ?? 0, Math.round(row.matches)));
  }
  return [...matchesByMap.values()].reduce((sum, matches) => sum + matches, 0);
}

function batteryTitle(battery: FormBattery): string {
  if (battery.status === "unknown") {
    return `Форма неизвестна: ${battery.recentCount} свежих матчей (нужно минимум 2)`;
  }
  const delta = battery.delta;
  return [
    `Форма ${battery.score}/100 · уверенность ${Math.round(battery.confidence * 100)}%`,
    `ADR ${format(delta?.adr, 1)} · K/R ${format(delta?.kr, 2)}`,
    `K/D ${format(delta?.kd, 2)} · WR ${delta ? percent(delta.winRate * 100) : "—"}`,
    `${battery.recentCount} recent / ${battery.baselineCount} baseline`,
  ].join("\n");
}

function appendTextNode(parent: ParentNode, tag: keyof HTMLElementTagNameMap, className: string, text: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function appendMetric(parent: ParentNode, value: string, label: string): void {
  const stat = document.createElement("span");
  stat.className = "stat";
  const strong = document.createElement("b");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = label;
  stat.append(strong, small);
  parent.append(stat);
}

function renderBattery(shadow: ShadowRoot, matches: readonly PlayerMatch[]): void {
  const battery = calculateFormBattery(matches);
  const title = batteryTitle(battery);
  const style = document.createElement("style");
  style.textContent = BATTERY_STYLES;
  const node = document.createElement("span");
  node.className = "battery";
  node.dataset.esFormBattery = "";
  node.style.color = battery.color;
  node.title = title;
  node.tabIndex = 0;
  node.setAttribute("role", "img");
  node.setAttribute("aria-label", title.replaceAll("\n", ". "));
  const active = battery.score === null ? 0 : Math.ceil(battery.score / 20);
  for (let index = 0; index < 5; index += 1) {
    const bar = document.createElement("i");
    bar.dataset.on = String(index < active);
    node.append(bar);
  }
  shadow.replaceChildren(style, node);
}

function renderTier(shadow: ShadowRoot, player: Player, level: number): void {
  const style = document.createElement("style");
  style.textContent = TIER_STYLES;
  const tier = document.createElement("span");
  tier.className = "tier";
  tier.dataset.esTier = "";
  tier.textContent = String(level);
  tier.title = `Шкала EloScope 1–20 · официальный FACEIT level ${player.officialLevel ?? "—"}`;
  tier.tabIndex = 0;
  tier.setAttribute("role", "img");
  tier.setAttribute(
    "aria-label",
    `EloScope level ${level}, официальный FACEIT level ${player.officialLevel ?? "неизвестен"}`,
  );
  shadow.replaceChildren(style, tier);
}

const ROLE_PRESENTATION: Record<PlayerRole, Readonly<{ label: string; color: string }>> = {
  sniper: { label: "SNIPER", color: "#d84cff" },
  entry: { label: "ENTRY", color: "#ff7a1a" },
  support: { label: "SUPPORT", color: "#24c9f4" },
  anchor: { label: "ANCHOR", color: "#21db79" },
  rifler: { label: "RIFLER", color: "#3d9cff" },
};

function roleTitle(role: PlayerRole, confidence: number): string {
  const percent = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  return `Предполагаемая роль: ${ROLE_PRESENTATION[role].label} · последние 20 матчей · уверенность ${percent}%`;
}

function svgNode<K extends keyof SVGElementTagNameMap>(
  ownerDocument: Document,
  tag: K,
  attributes: Readonly<Record<string, string | number>>,
): SVGElementTagNameMap[K] {
  const node = ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function roleIcon(ownerDocument: Document, role: PlayerRole): SVGSVGElement {
  const svg = svgNode(ownerDocument, "svg", {
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2.2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  });
  if (role === "sniper") {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 7 }),
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 1.6, fill: "currentColor", stroke: "none" }),
      svgNode(ownerDocument, "path", { d: "M16 3v6M16 21v7M4 15h6M22 15h6" }),
    );
  } else if (role === "entry") {
    svg.append(
      svgNode(ownerDocument, "path", { d: "M6 26 16 5l10 21M11 26l5-11 5 11" }),
      svgNode(ownerDocument, "path", { d: "M16 5v10" }),
    );
  } else if (role === "support") {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 5 }),
      svgNode(ownerDocument, "circle", { cx: 7, cy: 22, r: 3 }),
      svgNode(ownerDocument, "circle", { cx: 25, cy: 22, r: 3 }),
      svgNode(ownerDocument, "path", { d: "M12 18 9 20M20 18l3 2M16 11V5M13 8h6" }),
    );
  } else if (role === "anchor") {
    svg.append(
      svgNode(ownerDocument, "path", { d: "M16 3 27 8v8c0 7-5 10-11 13C10 26 5 23 5 16V8Z" }),
      svgNode(ownerDocument, "path", { d: "M16 8v13M11 21h10" }),
    );
  } else {
    svg.append(
      svgNode(ownerDocument, "circle", { cx: 16, cy: 15, r: 6 }),
      svgNode(ownerDocument, "path", { d: "M16 3v6M16 21v7M4 15h6M22 15h6M8 7l4 4M24 7l-4 4" }),
    );
  }
  return svg;
}

function renderRole(shadow: ShadowRoot, role: PlayerRole, confidence: number): string {
  const presentation = ROLE_PRESENTATION[role];
  const title = roleTitle(role, confidence);
  const ownerDocument = shadow.ownerDocument;
  const style = ownerDocument.createElement("style");
  style.textContent = ROLE_STYLES;
  const tile = ownerDocument.createElement("span");
  tile.className = "role";
  tile.dataset.esRole = role;
  tile.style.setProperty("--es-role-color", presentation.color);
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", title);
  const label = ownerDocument.createElement("span");
  label.className = "label";
  label.textContent = presentation.label;
  tile.append(roleIcon(ownerDocument, role), label);
  shadow.replaceChildren(style, tile);
  return title;
}

function matchRowsSignature(rows: readonly PlayerMatch[]): readonly unknown[] {
  return rows.map((row) => [
    row.id,
    row.finishedAt instanceof Date ? row.finishedAt.toISOString() : row.finishedAt,
    row.result,
    row.map,
    row.roundsPlayed,
    row.kills,
    row.assists,
    row.deaths,
    row.damage,
    row.headshots,
    row.fcr,
  ]);
}

function playerSignature(
  match: MatchContext,
  player: Player,
  rows: readonly PlayerMatch[],
  totalMatches: number | undefined,
  settings: InlineMatchSettings,
): string {
  return JSON.stringify({
    id: player.id,
    nickname: player.nickname,
    country: player.country,
    premadeId: (player as Player & { premadeId?: string }).premadeId,
    elo: player.elo,
    officialLevel: player.officialLevel,
    selectedMap: match.selectedMap,
    statsWindow: settings.statsWindow,
    totalMatches,
    rows: matchRowsSignature(rows),
  });
}

function renderPlayer(
  shadow: ShadowRoot,
  match: MatchContext,
  player: Player,
  rows: readonly PlayerMatch[],
  totalMatches: number | undefined,
  settings: InlineMatchSettings,
): void {
  const style = document.createElement("style");
  style.textContent = PLAYER_STYLES;
  const card = document.createElement("section");
  card.className = "card";
  card.setAttribute("aria-label", `Расширенная статистика ${player.nickname}`);

  const mapLine = document.createElement("div");
  mapLine.className = "map";
  mapLine.dataset.esStat = "selected-map";
  const validRows = eligibleMatches(rows);
  const aggregate = validRows.length ? aggregatePlayerMatches(validRows, settings.statsWindow) : undefined;
  const selectedMap = canonicalMap(match.selectedMap);
  const selectedStats = selectedMap
    ? aggregate?.maps.find((entry) => canonicalMap(entry.map) === selectedMap)
    : undefined;

  if (match.selectedMap) {
    appendTextNode(mapLine, "strong", "", match.selectedMap);
    if (selectedStats) {
      appendTextNode(mapLine, "span", "metric", `${selectedStats.matches}m`);
      appendTextNode(mapLine, "span", "metric", `${percent(selectedStats.winRate)} WR`);
      appendTextNode(mapLine, "span", "metric", `${format(selectedStats.kd, 2)} KD`);
      appendTextNode(mapLine, "span", "metric optional", `${format(selectedStats.kr, 2)} KR`);
      appendTextNode(mapLine, "span", "metric optional", `${format(selectedStats.adr, 0)} ADR`);
    } else {
      appendTextNode(mapLine, "span", "empty", "нет матчей в выбранном окне");
    }
  } else {
    appendTextNode(mapLine, "span", "empty", "Карта ещё не выбрана");
  }
  appendTextNode(mapLine, "span", "spacer", "");

  if (player.country) appendTextNode(mapLine, "span", "country", player.country);
  const premadeId = (player as Player & { premadeId?: string }).premadeId;
  if (premadeId) {
    const premade = appendTextNode(mapLine, "span", "premade", "●");
    premade.title = `Premade ${premadeId}`;
  }

  appendTextNode(mapLine, "span", "elo", player.elo === undefined ? "ELO —" : `ELO ${Math.round(player.elo)}`);
  card.append(mapLine);

  const overall = document.createElement("div");
  overall.className = "overall";
  overall.dataset.esStat = "overall";
  appendMetric(overall, totalMatches === undefined ? "—" : String(totalMatches), "матчи");
  appendMetric(overall, aggregate ? percent(aggregate.winRate) : "—", "победы");
  appendMetric(overall, aggregate ? format(aggregate.kills / aggregate.matches, 1) : "—", "AVG KILLS");
  appendMetric(overall, aggregate ? format(aggregate.kd, 2) : "—", "K/D");
  appendMetric(overall, aggregate ? format(aggregate.kr, 2) : "—", "K/R");
  appendMetric(overall, aggregate ? format(aggregate.adr, 0) : "—", "ADR");
  card.append(overall);
  shadow.replaceChildren(style, card);
}

function teamHeaderMetric(
  team: MatchTeam,
  side: TeamHeaderSide,
): { average: number; known: number; text: string; signature: string } | undefined {
  const elos = team.players
    .map((player) => player.elo)
    .filter(isPositiveFiniteNumber);
  const declaredKnown = team.eloKnown;
  const known = typeof declaredKnown === "number"
    && Number.isInteger(declaredKnown)
    && declaredKnown > 0
    && declaredKnown <= team.players.length
    ? declaredKnown
    : elos.length;
  const declaredAverage = team.averageElo;
  const average = isPositiveFiniteNumber(declaredAverage)
    ? Math.round(declaredAverage)
    : elos.length
      ? Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length)
      : undefined;
  if (average === undefined || known === 0) return undefined;
  const text = `AVG ELO ${average} · ${known}`;
  return {
    average,
    known,
    text,
    signature: JSON.stringify([team.id, average, known, side]),
  };
}

function renderTeam(
  shadow: ShadowRoot,
  team: MatchTeam,
  side: TeamHeaderSide,
  metric: NonNullable<ReturnType<typeof teamHeaderMetric>>,
): void {
  const style = document.createElement("style");
  style.textContent = TEAM_STYLES;
  const value = document.createElement("span");
  value.className = "metric";
  value.dataset.esTeamMetric = side;
  value.textContent = metric.text;
  value.setAttribute(
    "aria-label",
    `Средний ELO команды ${team.name ?? team.id}: ${metric.average}, игроков учтено ${metric.known}`,
  );
  shadow.replaceChildren(style, value);
}

function exactNicknameNodes(roster: HTMLElement, nickname: string): HTMLElement[] {
  const expected = normalizedNickname(nickname);
  return Array.from(roster.querySelectorAll<HTMLElement>(NICKNAME_SELECTOR))
    .filter((node) => normalizedNickname(node.textContent ?? "") === expected);
}

/**
 * Mounts compact stats only after the complete live FACEIT roster contract has
 * been validated. Any ambiguity removes existing mounts instead of guessing a
 * player/card association.
 */
export class InlineMatchRenderer {
  readonly #document: Document;
  readonly #playerMounts = new Map<string, Mount>();
  readonly #teamMounts = new Map<string, Mount>();
  readonly #batteryMounts = new Map<string, Mount>();
  readonly #tierMounts = new Map<string, TierMount>();
  readonly #roleMounts = new Map<string, RoleMount>();
  readonly #mapWinRateChart: MatchMapWinRateChartRenderer;

  constructor(ownerDocument: Document = document) {
    this.#document = ownerDocument;
    this.#mapWinRateChart = new MatchMapWinRateChartRenderer(ownerDocument);
  }

  render(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    playerMapStats: ReadonlyMap<string, PlayerMapStats[]>,
    settings: InlineMatchSettings,
  ): InlineMatchRenderResult {
    const chartUpdated = settings.showMapWinRates
      ? this.#mapWinRateChart.render(match, playerMapStats).updated
      : this.#mapWinRateChart.cleanup();
    const discovery = this.#discover(match);
    if (discovery.status === "incompatible") {
      this.#cleanupRosterEnhancements();
      return discovery;
    }

    const expectedPlayerIds = new Set(discovery.teams.flatMap((team) => team.players.map(({ player }) => player.id)));
    const expectedTeamIds = new Set(discovery.teams.map(({ team }) => team.id));
    const headerMetrics = this.#discoverHeaderTeams(match).flatMap((anchor) => {
      const metric = teamHeaderMetric(anchor.team, anchor.side);
      return metric ? [{ anchor, metric }] : [];
    });
    const expectedHeaderTeamIds = new Set(headerMetrics.map(({ anchor }) => anchor.team.id));
    this.#removeStale(this.#playerMounts, expectedPlayerIds);
    this.#removeStale(this.#teamMounts, expectedHeaderTeamIds);
    this.#removeStale(this.#batteryMounts, expectedPlayerIds);
    this.#removeStaleTiers(expectedPlayerIds);
    this.#removeStaleRoles(expectedPlayerIds);
    this.#removeOrphans(expectedPlayerIds, expectedHeaderTeamIds);

    let updated = chartUpdated;
    for (const { anchor, metric } of headerMetrics) {
      let teamMount = this.#teamMounts.get(anchor.team.id);
      const sideChanged = teamMount?.host.getAttribute("data-eloscope-team-side") !== anchor.side;
      if (!teamMount || !teamMount.host.isConnected || teamMount.host.parentElement !== anchor.container) {
        teamMount?.host.remove();
        const host = this.#document.createElement("div");
        host.setAttribute(INLINE_TEAM_ATTRIBUTE, anchor.team.id);
        host.setAttribute("data-eloscope-team-side", anchor.side);
        const shadow = host.attachShadow({ mode: "open" });
        teamMount = { host, signature: "" };
        this.#teamMounts.set(anchor.team.id, teamMount);
        renderTeam(shadow, anchor.team, anchor.side, metric);
        teamMount.signature = metric.signature;
        anchor.container.append(host);
        updated += 1;
      } else if (teamMount.signature !== metric.signature || sideChanged) {
        teamMount.host.setAttribute("data-eloscope-team-side", anchor.side);
        renderTeam(teamMount.host.shadowRoot as ShadowRoot, anchor.team, anchor.side, metric);
        teamMount.signature = metric.signature;
        updated += 1;
      }
    }

    for (const teamAnchor of discovery.teams) {
      for (const anchor of teamAnchor.players) {
        const rows = eligibleMatches(playerMatches.get(anchor.player.id) ?? []);
        const totalMatches = lifetimeMatchCount(playerMapStats.get(anchor.player.id));
        const signature = playerSignature(match, anchor.player, rows, totalMatches, settings);
        let mount = this.#playerMounts.get(anchor.player.id);
        if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.holder) {
          mount?.host.remove();
          const host = this.#document.createElement("div");
          host.setAttribute(INLINE_PLAYER_ATTRIBUTE, anchor.player.id);
          const shadow = host.attachShadow({ mode: "open" });
          mount = { host, signature: "" };
          this.#playerMounts.set(anchor.player.id, mount);
          renderPlayer(shadow, match, anchor.player, rows, totalMatches, settings);
          mount.signature = signature;
          updated += 1;
        } else if (mount.signature !== signature) {
          renderPlayer(mount.host.shadowRoot as ShadowRoot, match, anchor.player, rows, totalMatches, settings);
          mount.signature = signature;
          updated += 1;
        }
        if (anchor.card.nextElementSibling !== mount.host) {
          anchor.card.insertAdjacentElement("afterend", mount.host);
        }
        updated += this.#syncBattery(anchor, rows);
        updated += this.#syncTier(anchor, settings);
        updated += this.#syncRole(anchor, rows, settings);
      }
    }

    return {
      status: "rendered",
      players: expectedPlayerIds.size,
      teams: expectedTeamIds.size,
      updated,
    };
  }

  cleanup(): void {
    this.#cleanupRosterEnhancements();
    this.#mapWinRateChart.cleanup();
  }

  #cleanupRosterEnhancements(): void {
    for (const mount of this.#playerMounts.values()) mount.host.remove();
    for (const mount of this.#teamMounts.values()) mount.host.remove();
    for (const mount of this.#batteryMounts.values()) mount.host.remove();
    for (const mount of this.#tierMounts.values()) this.#removeTierMount(mount);
    for (const mount of this.#roleMounts.values()) this.#removeRoleMount(mount);
    this.#playerMounts.clear();
    this.#teamMounts.clear();
    this.#batteryMounts.clear();
    this.#tierMounts.clear();
    this.#roleMounts.clear();
    this.#document.querySelectorAll(
      `[${INLINE_PLAYER_ATTRIBUTE}], [${INLINE_TEAM_ATTRIBUTE}], [${INLINE_BATTERY_ATTRIBUTE}], [${INLINE_TIER_ATTRIBUTE}], [${INLINE_ROLE_ATTRIBUTE}]`,
    )
      .forEach((host) => host.remove());
  }

  destroy(): void {
    this.cleanup();
  }

  #syncBattery(anchor: PlayerAnchor, rows: readonly PlayerMatch[]): number {
    const id = anchor.player.id;
    if (!anchor.nicknameContainer || !anchor.nicknameSlot) {
      const existing = this.#batteryMounts.get(id);
      if (!existing) return 0;
      existing.host.remove();
      this.#batteryMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(matchRowsSignature(rows));
    let mount = this.#batteryMounts.get(id);
    let updated = 0;
    if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.nicknameSlot) {
      mount?.host.remove();
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_BATTERY_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = { host, signature: "" };
      this.#batteryMounts.set(id, mount);
      renderBattery(shadow, rows);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderBattery(mount.host.shadowRoot as ShadowRoot, rows);
      mount.signature = signature;
      updated = 1;
    }
    if (anchor.nicknameContainer.nextElementSibling !== mount.host) {
      anchor.nicknameContainer.insertAdjacentElement("afterend", mount.host);
    }
    return updated;
  }

  #syncTier(anchor: PlayerAnchor, settings: InlineMatchSettings): number {
    const id = anchor.player.id;
    const level = settings.showExtendedTier && anchor.player.elo !== undefined
      ? getEloTier(anchor.player.elo, true)
      : undefined;
    if (level === undefined || level <= 10 || !anchor.nativeLevel || !anchor.nativeLevel.parentElement) {
      const existing = this.#tierMounts.get(id);
      if (!existing) return 0;
      this.#removeTierMount(existing);
      this.#tierMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify([level, anchor.player.officialLevel]);
    let mount = this.#tierMounts.get(id);
    let updated = 0;
    if (
      !mount
      || !mount.host.isConnected
      || mount.host.parentElement !== anchor.nativeLevel.parentElement
      || mount.nativeLevel !== anchor.nativeLevel
    ) {
      if (mount) this.#removeTierMount(mount);
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_TIER_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = {
        host,
        signature: "",
        nativeLevel: anchor.nativeLevel,
        tierSize: nativeLevelSize(anchor.nativeLevel),
        previousDisplay: anchor.nativeLevel.style.getPropertyValue("display"),
        previousDisplayPriority: anchor.nativeLevel.style.getPropertyPriority("display"),
        previousAriaHidden: anchor.nativeLevel.getAttribute("aria-hidden"),
      };
      this.#tierMounts.set(id, mount);
      renderTier(shadow, anchor.player, level);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderTier(mount.host.shadowRoot as ShadowRoot, anchor.player, level);
      mount.signature = signature;
      updated = 1;
    }
    mount.host.style.setProperty("--es-tier-size", `${mount.tierSize}px`);
    if (mount.nativeLevel.style.getPropertyValue("display") !== "none"
      || mount.nativeLevel.style.getPropertyPriority("display") !== "important") {
      mount.nativeLevel.style.setProperty("display", "none", "important");
    }
    if (mount.nativeLevel.getAttribute("aria-hidden") !== "true") {
      mount.nativeLevel.setAttribute("aria-hidden", "true");
    }
    if (mount.nativeLevel.previousElementSibling !== mount.host) {
      mount.nativeLevel.parentElement?.insertBefore(mount.host, mount.nativeLevel);
    }
    return updated;
  }

  #removeTierMount(mount: TierMount): void {
    if (mount.previousDisplay) {
      mount.nativeLevel.style.setProperty("display", mount.previousDisplay, mount.previousDisplayPriority);
    } else {
      mount.nativeLevel.style.removeProperty("display");
    }
    if (mount.previousAriaHidden === null) mount.nativeLevel.removeAttribute("aria-hidden");
    else mount.nativeLevel.setAttribute("aria-hidden", mount.previousAriaHidden);
    mount.host.remove();
  }

  #syncRole(anchor: PlayerAnchor, rows: readonly PlayerMatch[], settings: InlineMatchSettings): number {
    const id = anchor.player.id;
    const analysis = settings.showPlayerRoles ? classifyPlayerRole(rows) : undefined;
    if (
      analysis?.status !== "known"
      || !anchor.avatarHolder
      || !anchor.nativeAvatar
      || anchor.nativeAvatar.parentElement !== anchor.avatarHolder
    ) {
      const existing = this.#roleMounts.get(id);
      if (!existing) return 0;
      this.#removeRoleMount(existing);
      this.#roleMounts.delete(id);
      return 1;
    }

    const signature = JSON.stringify(analysis);
    let mount = this.#roleMounts.get(id);
    let updated = 0;
    if (
      !mount
      || !mount.host.isConnected
      || mount.host.parentElement !== anchor.avatarHolder
      || mount.avatarHolder !== anchor.avatarHolder
      || mount.nativeAvatar !== anchor.nativeAvatar
    ) {
      if (mount) this.#removeRoleMount(mount);
      const host = this.#document.createElement("span");
      host.setAttribute(INLINE_ROLE_ATTRIBUTE, id);
      const shadow = host.attachShadow({ mode: "open" });
      mount = {
        host,
        signature: "",
        avatarHolder: anchor.avatarHolder,
        nativeAvatar: anchor.nativeAvatar,
        previousDisplay: anchor.nativeAvatar.style.getPropertyValue("display"),
        previousDisplayPriority: anchor.nativeAvatar.style.getPropertyPriority("display"),
        previousAriaHidden: anchor.nativeAvatar.getAttribute("aria-hidden"),
        previousTitle: anchor.avatarHolder.getAttribute("title"),
      };
      this.#roleMounts.set(id, mount);
      renderRole(shadow, analysis.role, analysis.confidence);
      mount.signature = signature;
      updated = 1;
    } else if (mount.signature !== signature) {
      renderRole(mount.host.shadowRoot as ShadowRoot, analysis.role, analysis.confidence);
      mount.signature = signature;
      updated = 1;
    }

    const title = roleTitle(analysis.role, analysis.confidence);
    if (mount.avatarHolder.getAttribute("title") !== title) mount.avatarHolder.setAttribute("title", title);
    if (
      mount.nativeAvatar.style.getPropertyValue("display") !== "none"
      || mount.nativeAvatar.style.getPropertyPriority("display") !== "important"
    ) {
      mount.nativeAvatar.style.setProperty("display", "none", "important");
    }
    if (mount.nativeAvatar.getAttribute("aria-hidden") !== "true") {
      mount.nativeAvatar.setAttribute("aria-hidden", "true");
    }
    if (mount.avatarHolder.firstElementChild !== mount.host) {
      mount.avatarHolder.insertBefore(mount.host, mount.avatarHolder.firstElementChild);
    }
    return updated;
  }

  #removeRoleMount(mount: RoleMount): void {
    if (mount.previousDisplay) {
      mount.nativeAvatar.style.setProperty("display", mount.previousDisplay, mount.previousDisplayPriority);
    } else {
      mount.nativeAvatar.style.removeProperty("display");
    }
    if (mount.previousAriaHidden === null) mount.nativeAvatar.removeAttribute("aria-hidden");
    else mount.nativeAvatar.setAttribute("aria-hidden", mount.previousAriaHidden);
    if (mount.previousTitle === null) mount.avatarHolder.removeAttribute("title");
    else mount.avatarHolder.setAttribute("title", mount.previousTitle);
    mount.host.remove();
  }

  #nativeLevelMatchesPlayer(nativeLevel: SVGSVGElement, player: Player): boolean {
    const expectedLevel = player.officialLevel
      ?? (player.elo === undefined ? undefined : getEloTier(player.elo, false));
    if (expectedLevel === undefined) return false;
    const label = [
      nativeLevel.getAttribute("aria-label"),
      nativeLevel.getAttribute("title"),
      nativeLevel.querySelector("title")?.textContent,
    ].filter((value): value is string => Boolean(value)).join(" ");
    const parsed = /skill\s*level\s*(\d{1,2})/iu.exec(label)?.[1];
    return parsed !== undefined && Number(parsed) === expectedLevel;
  }

  #discover(match: MatchContext):
    | Readonly<{ status: "ready"; teams: readonly TeamAnchor[] }>
    | Readonly<{ status: "incompatible"; reason: InlineMatchFailure }> {
    if (
      match.teams.length !== 2
      || match.teams.some((team) => team.players.length !== 5)
      || new Set(match.teams.map((team) => team.id)).size !== match.teams.length
      || new Set(match.teams.flatMap((team) => team.players.map((player) => player.id))).size
        !== match.teams.reduce((sum, team) => sum + team.players.length, 0)
    ) {
      return { status: "incompatible", reason: "invalid-match-roster" };
    }
    const expectedNicknames = match.teams.flatMap((team) => team.players.map((player) => normalizedNickname(player.nickname)));
    if (new Set(expectedNicknames).size !== expectedNicknames.length) {
      return { status: "incompatible", reason: "invalid-match-roster" };
    }

    const rosters = Array.from(this.#document.querySelectorAll<HTMLElement>(ROSTER_SELECTOR)).filter(isRendered);
    if (rosters.length !== 2) return { status: "incompatible", reason: "roster-contract" };
    if (rosters.some((roster) => roster.querySelectorAll(NICKNAME_SELECTOR).length !== 5)) {
      return { status: "incompatible", reason: "roster-contract" };
    }

    const usedRosters = new Set<HTMLElement>();
    const usedCards = new Set<HTMLElement>();
    const usedHolders = new Set<HTMLElement>();
    const teams: TeamAnchor[] = [];

    for (const team of match.teams) {
      const candidates = rosters.filter((roster) => team.players.every((player) => exactNicknameNodes(roster, player.nickname).length === 1));
      if (candidates.length !== 1 || usedRosters.has(candidates[0] as HTMLElement)) {
        return { status: "incompatible", reason: "team-roster-ambiguous" };
      }
      const roster = candidates[0] as HTMLElement;
      usedRosters.add(roster);
      const players: PlayerAnchor[] = [];
      for (const player of team.players) {
        const nicknameNodes = exactNicknameNodes(roster, player.nickname);
        if (nicknameNodes.length !== 1) return { status: "incompatible", reason: "nickname-ambiguous" };
        const nickname = nicknameNodes[0] as HTMLElement;
        const card = nickname.closest<HTMLElement>(PLAYER_CARD_SELECTOR);
        if (!card || !roster.contains(card) || usedCards.has(card)) {
          return { status: "incompatible", reason: "player-card-contract" };
        }
        const holder = card.parentElement;
        if (!holder || !holder.matches(PLAYER_HOLDER_SELECTOR) || usedHolders.has(holder)) {
          return { status: "incompatible", reason: "player-holder-contract" };
        }
        usedCards.add(card);
        usedHolders.add(holder);
        const nicknameContainers = Array.from(card.querySelectorAll<HTMLElement>(NICKNAME_CONTAINER_SELECTOR))
          .filter((container) => container.contains(nickname));
        const nicknameContainer = nicknameContainers.length === 1 ? nicknameContainers[0] : undefined;
        const nicknameSlot = nicknameContainer?.parentElement
          && nicknameContainer.parentElement.matches(NICKNAME_SLOT_SELECTOR)
          && card.contains(nicknameContainer.parentElement)
          ? nicknameContainer.parentElement
          : undefined;
        const mountedNativeLevel = this.#tierMounts.get(player.id)?.nativeLevel;
        const nativeLevels = Array.from(card.querySelectorAll<SVGSVGElement>(PLAYER_LEVEL_SELECTOR))
          .filter((level) => level === mountedNativeLevel || isRendered(level));
        const nativeLevel = nativeLevels.length === 1 && this.#nativeLevelMatchesPlayer(nativeLevels[0] as SVGSVGElement, player)
          ? nativeLevels[0]
          : undefined;
        const mountedNativeAvatar = this.#roleMounts.get(player.id)?.nativeAvatar;
        const avatarPairs = Array.from(card.querySelectorAll<HTMLElement>(AVATAR_HOLDER_SELECTOR))
          .filter((avatarHolder) => isRendered(avatarHolder) && isSafeAvatarOverlayHolder(avatarHolder))
          .flatMap((avatarHolder) => {
            const nativeAvatars = Array.from(avatarHolder.children)
              .filter((candidate): candidate is HTMLElement => candidate instanceof HTMLElement)
              .filter((candidate) => candidate.matches(AVATAR_IMAGE_SELECTOR))
              .filter((candidate) => candidate === mountedNativeAvatar || isRendered(candidate));
            return nativeAvatars.length === 1
              ? [{ avatarHolder, nativeAvatar: nativeAvatars[0] as HTMLElement }]
              : [];
          });
        const avatarPair = avatarPairs.length === 1 ? avatarPairs[0] : undefined;
        players.push({
          player,
          card,
          holder,
          ...(nicknameContainer ? { nicknameContainer } : {}),
          ...(nicknameSlot ? { nicknameSlot } : {}),
          ...(nativeLevel ? { nativeLevel } : {}),
          ...(avatarPair ? avatarPair : {}),
        });
      }
      const parent = players[0]?.holder.parentElement;
      if (!parent || !roster.contains(parent) || players.some(({ holder }) => holder.parentElement !== parent)) {
        return { status: "incompatible", reason: "player-holder-contract" };
      }
      const playerHolders = new Set(players.map(({ holder }) => holder));
      const firstHolder = Array.from(parent.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && playerHolders.has(child));
      if (!firstHolder) return { status: "incompatible", reason: "player-holder-contract" };
      teams.push({ team, roster, players });
    }

    return { status: "ready", teams };
  }

  #discoverHeaderTeams(match: MatchContext): readonly TeamHeaderAnchor[] {
    const namedTeams = match.teams.flatMap((team) => {
      const name = team.name ? normalizedNickname(team.name) : "";
      return name ? [{ team, name }] : [];
    });
    if (namedTeams.length !== 2 || new Set(namedTeams.map(({ name }) => name)).size !== 2) return [];

    const candidates: TeamHeaderAnchor[][] = [];
    for (const wrapper of Array.from(this.#document.querySelectorAll<HTMLElement>(MATCH_HEADER_WRAPPER_SELECTOR))
      .filter(isRendered)) {
      const factions = Array.from(wrapper.querySelectorAll<HTMLElement>(MATCH_HEADER_FACTION_SELECTOR))
        .filter(isRendered);
      if (factions.length !== 2 || factions[0]?.parentElement !== factions[1]?.parentElement) continue;
      const factionContainer = factions[0]?.parentElement;
      const overlayContainer = factionContainer?.parentElement;
      if (!factionContainer || !overlayContainer || !wrapper.contains(overlayContainer)) continue;
      if (!this.#isSafeHeaderOverlayContainer(overlayContainer)) continue;

      const factionNames = factions.map((faction) => {
        const nodes = Array.from(faction.querySelectorAll<HTMLElement>(MATCH_HEADER_FACTION_NAME_SELECTOR))
          .filter(isRendered);
        return nodes.length === 1 ? normalizedNickname(nodes[0]?.textContent ?? "") : "";
      });
      if (factionNames.some((name) => !name) || new Set(factionNames).size !== 2) continue;
      const byName = new Map(namedTeams.map(({ team, name }) => [name, team] as const));
      if (factionNames.some((name) => !byName.has(name))) continue;

      candidates.push(factions.map((_, index): TeamHeaderAnchor => ({
        team: byName.get(factionNames[index] as string) as MatchTeam,
        container: overlayContainer,
        side: index === 0 ? "left" : "right",
      })));
    }

    return candidates.length === 1 ? candidates[0] as readonly TeamHeaderAnchor[] : [];
  }

  #isSafeHeaderOverlayContainer(container: HTMLElement): boolean {
    if (!isRendered(container)) return false;
    const style = this.#document.defaultView?.getComputedStyle(container);
    if (!style || style.position === "static") return false;
    const rect = container.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : Number.parseFloat(style.width);
    const height = rect.height > 0 ? rect.height : Number.parseFloat(style.height);
    return Number.isFinite(width)
      && Number.isFinite(height)
      && width >= 420
      && width <= 3_000
      && height >= 96
      && height <= 480;
  }

  #removeStale(mounts: Map<string, Mount>, expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of mounts) {
      if (expectedIds.has(id)) continue;
      mount.host.remove();
      mounts.delete(id);
    }
  }

  #removeStaleTiers(expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of this.#tierMounts) {
      if (expectedIds.has(id)) continue;
      this.#removeTierMount(mount);
      this.#tierMounts.delete(id);
    }
  }

  #removeStaleRoles(expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of this.#roleMounts) {
      if (expectedIds.has(id)) continue;
      this.#removeRoleMount(mount);
      this.#roleMounts.delete(id);
    }
  }

  #removeOrphans(expectedPlayerIds: ReadonlySet<string>, expectedTeamIds: ReadonlySet<string>): void {
    const playerHosts = new Set(Array.from(this.#playerMounts.values(), ({ host }) => host));
    const teamHosts = new Set(Array.from(this.#teamMounts.values(), ({ host }) => host));
    const batteryHosts = new Set(Array.from(this.#batteryMounts.values(), ({ host }) => host));
    const tierHosts = new Set(Array.from(this.#tierMounts.values(), ({ host }) => host));
    const roleHosts = new Set(Array.from(this.#roleMounts.values(), ({ host }) => host));
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_PLAYER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !playerHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TEAM_ATTRIBUTE);
      if (!id || !expectedTeamIds.has(id) || !teamHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_BATTERY_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !batteryHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TIER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !tierHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_ROLE_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !roleHosts.has(host)) host.remove();
    });
  }
}
