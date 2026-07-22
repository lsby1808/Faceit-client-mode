import {
  aggregatePlayerMatches,
  calculateFormBattery,
  classifyPlayerRole,
  eligibleMatches,
  getEloTier,
  getEloTierPresentation,
  type EloScopeTier,
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

const NAMED_ROSTER_SELECTOR = '[name="roster1"], [name="roster2"]';
const ROSTER_SELECTOR = '[class*="Roster__Group"]';
const NICKNAME_SELECTOR = '[class*="Nickname__Name"]';
const PLAYER_PROFILE_LINK_SELECTOR = 'a[href*="/players/"]';
const NICKNAME_CONTAINER_SELECTOR = '[class*="Nickname__Container"]';
const NICKNAME_SLOT_SELECTOR = '[class*="styles__NicknameContainer"]';
const PLAYER_CARD_SELECTOR = '[class*="ListContentPlayer__Background"]';
const PLAYER_HOLDER_SELECTOR = '[class*="styles__Holder"]';
const PLAYER_LEVEL_SELECTOR = '[class*="SkillIcon__StyledSvg"]';
const AVATAR_HOLDER_SELECTOR = '[class*="Avatar__AvatarHolder"]';
const AVATAR_IMAGE_SELECTOR =
  'img[class*="Avatar__Image"][aria-label="avatar"], i[class*="Avatar__AvatarIcon"][aria-label="avatar"]';
const MATCH_HEADER_WRAPPER_SELECTOR = '[class*="styles__HeaderWrapper-sc-"]';
const MATCH_HEADER_FACTION_SELECTOR = '[class*="styles__Faction-sc-"]';
const MATCH_HEADER_FACTION_NAME_SELECTOR = '[class*="styles__StyledFactionName-sc-"]';

export const INLINE_PLAYER_ATTRIBUTE = "data-eloscope-inline-player";
export const INLINE_TEAM_ATTRIBUTE = "data-eloscope-inline-team";
export const INLINE_BATTERY_ATTRIBUTE = "data-eloscope-inline-battery";
export const INLINE_TIER_ATTRIBUTE = "data-eloscope-inline-tier";
export const INLINE_ROLE_ATTRIBUTE = "data-eloscope-inline-role";

const WIN_RATE_WINDOW: StatsWindow = 20;

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
  .overall {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    min-width: 0;
    padding: 7px 8px;
  }
  .stat { min-width: 0; padding: 0 5px; text-align: center; border-left: 1px solid rgba(255, 255, 255, .1); }
  .stat:first-child { border-left: 0; }
  .stat b { display: block; overflow: hidden; color: #e8eaed; font-size: 11px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
  .stat small { display: block; margin-top: 2px; color: #858b94; font-size: 9px; letter-spacing: .02em; text-transform: uppercase; white-space: nowrap; }
  @container (max-width: 500px) {
    .stat { padding-inline: 2px; }
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
    border: 2px solid var(--es-tier-color);
    border-radius: 50%;
    background: var(--es-tier-background);
    color: var(--es-tier-color);
    box-shadow: inset 0 0 0 2px var(--es-tier-glow), 0 0 8px var(--es-tier-glow);
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
  mountAfter: HTMLElement;
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

function appendMetric(parent: ParentNode, value: string, label: string): HTMLElement {
  const stat = document.createElement("span");
  stat.className = "stat";
  const strong = document.createElement("b");
  strong.textContent = value;
  const small = document.createElement("small");
  small.textContent = label;
  stat.append(strong, small);
  parent.append(stat);
  return stat;
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

function renderTier(shadow: ShadowRoot, player: Player, level: EloScopeTier): void {
  const presentation = getEloTierPresentation(level);
  const style = document.createElement("style");
  style.textContent = TIER_STYLES;
  const tier = document.createElement("span");
  tier.className = "tier";
  tier.dataset.esTier = String(level);
  tier.style.setProperty("--es-tier-color", presentation.foreground);
  tier.style.setProperty("--es-tier-background", presentation.background);
  tier.style.setProperty("--es-tier-glow", presentation.glow);
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
  player: Player,
  rows: readonly PlayerMatch[],
  totalMatches: number | undefined,
  settings: InlineMatchSettings,
): string {
  return JSON.stringify({
    id: player.id,
    nickname: player.nickname,
    statsWindow: settings.statsWindow,
    totalMatches,
    rows: matchRowsSignature(rows),
  });
}

function renderPlayer(
  shadow: ShadowRoot,
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

  const validRows = eligibleMatches(rows);
  const aggregate = validRows.length ? aggregatePlayerMatches(validRows, settings.statsWindow) : undefined;
  const winRateAggregate = validRows.length ? aggregatePlayerMatches(validRows, WIN_RATE_WINDOW) : undefined;

  const overall = document.createElement("div");
  overall.className = "overall";
  overall.dataset.esStat = "overall";
  appendMetric(overall, totalMatches === undefined ? "—" : String(totalMatches), "матчи");
  const wins = appendMetric(overall, winRateAggregate ? percent(winRateAggregate.winRate) : "—", "победы");
  wins.dataset.esMetric = "win-rate-20";
  wins.title = winRateAggregate
    ? `Процент побед за последние ${winRateAggregate.matches} завершённых матчей CS2 5v5`
    : "Нет завершённых матчей CS2 5v5";
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

function teamForVisiblePlayers(team: MatchTeam, players: readonly Player[]): MatchTeam {
  const elos = players.map((player) => player.elo).filter(isPositiveFiniteNumber);
  return {
    id: team.id,
    ...(team.name ? { name: team.name } : {}),
    players: [...players],
    eloKnown: elos.length,
    eloTotal: players.length,
    ...(elos.length
      ? {
          averageElo: Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length),
          minElo: Math.min(...elos),
          maxElo: Math.max(...elos),
        }
      : {}),
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
  const matches = new Set<HTMLElement>();
  for (const node of Array.from(roster.querySelectorAll<HTMLElement>(NICKNAME_SELECTOR)).filter(isRendered)) {
    if (normalizedNickname(node.textContent ?? "") === expected) matches.add(node);
  }
  for (const link of Array.from(roster.querySelectorAll<HTMLAnchorElement>(PLAYER_PROFILE_LINK_SELECTOR)).filter(isRendered)) {
    if (profileNickname(link) === expected) matches.add(link);
  }
  return [...matches];
}

type PlayerStructure = Readonly<{
  card: HTMLElement;
  holder: HTMLElement;
  mountAfter: HTMLElement;
}>;

function profileNickname(link: HTMLAnchorElement): string | undefined {
  const href = link.getAttribute("href");
  if (!href) return undefined;
  try {
    const url = new URL(href, link.ownerDocument.baseURI);
    const pageUrl = new URL(link.ownerDocument.baseURI);
    const isRootRelative = href.startsWith("/") && !href.startsWith("//") && url.origin === pageUrl.origin;
    const canonicalOrigin = url.origin === "https://www.faceit.com" || url.origin === "https://faceit.com";
    if (url.username || url.password || (!isRootRelative && !canonicalOrigin)) return undefined;
    const segments = url.pathname.split("/").filter(Boolean);
    const playersIndex = segments.findIndex((segment) => segment.toLocaleLowerCase("en-US") === "players");
    if (
      playersIndex < 0
      || playersIndex > 1
      || (playersIndex === 1 && !/^[a-z]{2}(?:-[a-z]{2})?$/iu.test(segments[0] ?? ""))
    ) return undefined;
    const encodedNickname = playersIndex >= 0 ? segments[playersIndex + 1] : undefined;
    if (!encodedNickname) return undefined;
    return normalizedNickname(decodeURIComponent(encodedNickname));
  } catch {
    return undefined;
  }
}

function directChildContaining(parent: HTMLElement, descendant: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = descendant;
  while (current?.parentElement && current.parentElement !== parent) current = current.parentElement;
  return current?.parentElement === parent ? current : undefined;
}

function playerStructure(roster: HTMLElement, identity: HTMLElement): PlayerStructure | undefined {
  const closestCard = identity.closest<HTMLElement>(PLAYER_CARD_SELECTOR);
  const nestedCards = closestCard
    ? []
    : Array.from(identity.querySelectorAll<HTMLElement>(PLAYER_CARD_SELECTOR)).filter(isRendered);
  let card = closestCard ?? (nestedCards.length === 1 ? nestedCards[0] : undefined);
  let holder = (card ?? identity).closest<HTMLElement>(PLAYER_HOLDER_SELECTOR);
  if (!holder && card) {
    let structuralHolder = card.parentElement;
    if (structuralHolder?.tagName === "A") structuralHolder = structuralHolder.parentElement;
    if (structuralHolder && structuralHolder !== roster && roster.contains(structuralHolder)) holder = structuralHolder;
  }
  if (!holder || holder === roster || !roster.contains(holder)) return undefined;
  if (!card) {
    const holderCards = Array.from(holder.querySelectorAll<HTMLElement>(PLAYER_CARD_SELECTOR)).filter(isRendered);
    if (holderCards.length === 1) card = holderCards[0];
  }
  if (!card) return undefined;
  const mountAfter = directChildContaining(holder, card);
  if (!mountAfter) return undefined;
  return { card, holder, mountAfter };
}

function uniquePlayerStructures(roster: HTMLElement, nickname: string): PlayerStructure[] {
  const structures: PlayerStructure[] = [];
  for (const identity of exactNicknameNodes(roster, nickname)) {
    const structure = playerStructure(roster, identity);
    if (structure && !structures.some((candidate) =>
      candidate.card === structure.card
      && candidate.holder === structure.holder
      && candidate.mountAfter === structure.mountAfter)) {
      structures.push(structure);
    }
  }
  return structures;
}

function rosterPlayerStructures(roster: HTMLElement): PlayerStructure[] {
  const identities = new Set<HTMLElement>([
    ...Array.from(roster.querySelectorAll<HTMLElement>(NICKNAME_SELECTOR)).filter(isRendered),
    ...Array.from(roster.querySelectorAll<HTMLAnchorElement>(PLAYER_PROFILE_LINK_SELECTOR)).filter(isRendered),
  ]);
  const structures: PlayerStructure[] = [];
  for (const identity of identities) {
    const structure = playerStructure(roster, identity);
    if (structure && !structures.some((candidate) =>
      candidate.card === structure.card
      && candidate.holder === structure.holder
      && candidate.mountAfter === structure.mountAfter)) {
      structures.push(structure);
    }
  }
  return structures;
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
    const discovery = this.#discover(match);
    if (discovery.status === "incompatible") {
      if (settings.showMapWinRates) this.#mapWinRateChart.render(match, playerMapStats);
      else this.#mapWinRateChart.cleanup();
      this.#cleanupRosterEnhancements();
      return discovery;
    }
    const visibleMatch: MatchContext = {
      ...match,
      teams: discovery.teams.map(({ team }) => team),
    };
    const chartUpdated = settings.showMapWinRates
      ? this.#mapWinRateChart.render(visibleMatch, playerMapStats).updated
      : this.#mapWinRateChart.cleanup();

    const expectedPlayerIds = new Set(discovery.teams.flatMap((team) => team.players.map(({ player }) => player.id)));
    const expectedTeamIds = new Set(discovery.teams.map(({ team }) => team.id));
    const headerMetrics = this.#discoverHeaderTeams(discovery.teams.map(({ team }) => team)).flatMap((anchor) => {
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
        const signature = playerSignature(anchor.player, rows, totalMatches, settings);
        let mount = this.#playerMounts.get(anchor.player.id);
        if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.holder) {
          mount?.host.remove();
          const host = this.#document.createElement("div");
          host.setAttribute(INLINE_PLAYER_ATTRIBUTE, anchor.player.id);
          const shadow = host.attachShadow({ mode: "open" });
          mount = { host, signature: "" };
          this.#playerMounts.set(anchor.player.id, mount);
          renderPlayer(shadow, anchor.player, rows, totalMatches, settings);
          mount.signature = signature;
          updated += 1;
        } else if (mount.signature !== signature) {
          renderPlayer(mount.host.shadowRoot as ShadowRoot, anchor.player, rows, totalMatches, settings);
          mount.signature = signature;
          updated += 1;
        }
        if (anchor.mountAfter.nextElementSibling !== mount.host) {
          anchor.mountAfter.insertAdjacentElement("afterend", mount.host);
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
    const eligibleTeams = match.teams.filter((team) => team.players.length >= 5);
    if (
      eligibleTeams.length < 2
      || new Set(match.teams.map((team) => team.id)).size !== match.teams.length
      || new Set(match.teams.flatMap((team) => team.players.map((player) => player.id))).size
        !== match.teams.reduce((sum, team) => sum + team.players.length, 0)
    ) {
      return { status: "incompatible", reason: "invalid-match-roster" };
    }

    const namedRosters = Array.from(this.#document.querySelectorAll<HTMLElement>(NAMED_ROSTER_SELECTOR)).filter(isRendered);
    const namedRosterSet = new Set(namedRosters);
    const rawRosters = [...new Set([
      ...namedRosters,
      ...Array.from(this.#document.querySelectorAll<HTMLElement>(ROSTER_SELECTOR)).filter(isRendered),
    ])];
    const rosterStructures = new Map(rawRosters.map((roster) => [roster, rosterPlayerStructures(roster)] as const));
    const rosters: HTMLElement[] = [];
    for (const candidate of rawRosters) {
      const candidateHolders = new Set((rosterStructures.get(candidate) ?? []).map(({ holder }) => holder));
      const equivalentIndex = candidateHolders.size === 5
        ? rosters.findIndex((existing) => {
            const existingHolders = new Set((rosterStructures.get(existing) ?? []).map(({ holder }) => holder));
            return existingHolders.size === candidateHolders.size
              && [...candidateHolders].every((holder) => existingHolders.has(holder));
          })
        : -1;
      if (equivalentIndex < 0) {
        rosters.push(candidate);
      } else if (namedRosterSet.has(candidate) && !namedRosterSet.has(rosters[equivalentIndex] as HTMLElement)) {
        rosters[equivalentIndex] = candidate;
      }
    }
    if (rosters.length < 2) return { status: "incompatible", reason: "roster-contract" };

    type TeamRosterCandidate = Readonly<{
      team: MatchTeam;
      roster: HTMLElement;
      players: readonly Readonly<{ player: Player; structure: PlayerStructure }>[];
    }>;
    const candidates: TeamRosterCandidate[] = [];
    for (const team of eligibleTeams) {
      for (const roster of rosters) {
        const structuresForRoster = rosterStructures.get(roster) ?? [];
        if (structuresForRoster.length !== 5) continue;
        const players: Array<Readonly<{ player: Player; structure: PlayerStructure }>> = [];
        let ambiguous = false;
        for (const player of team.players) {
          const structures = uniquePlayerStructures(roster, player.nickname);
          if (structures.length > 1) {
            ambiguous = true;
            break;
          }
          if (structures[0]) players.push({ player, structure: structures[0] });
        }
        if (ambiguous || players.length !== 5) continue;
        const holders = new Set(players.map(({ structure }) => structure.holder));
        if (holders.size !== 5 || structuresForRoster.some(({ holder }) => !holders.has(holder))) continue;
        const parent = players[0]?.structure.holder.parentElement;
        if (!parent || !roster.contains(parent) || players.some(({ structure }) => structure.holder.parentElement !== parent)) {
          continue;
        }
        candidates.push({
          team: teamForVisiblePlayers(team, players.map(({ player }) => player)),
          roster,
          players,
        });
      }
    }

    const solutions: Array<readonly [TeamRosterCandidate, TeamRosterCandidate]> = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const first = candidates[left] as TeamRosterCandidate;
        const second = candidates[right] as TeamRosterCandidate;
        if (first.team.id !== second.team.id && first.roster !== second.roster) solutions.push([first, second]);
      }
    }
    if (solutions.length !== 1) return { status: "incompatible", reason: "team-roster-ambiguous" };

    const usedRosters = new Set<HTMLElement>();
    const usedCards = new Set<HTMLElement>();
    const usedHolders = new Set<HTMLElement>();
    const teams: TeamAnchor[] = [];

    for (const assignment of solutions[0] as readonly TeamRosterCandidate[]) {
      const { team, roster } = assignment;
      if (usedRosters.has(roster)) return { status: "incompatible", reason: "team-roster-ambiguous" };
      usedRosters.add(roster);
      const players: PlayerAnchor[] = [];
      for (const { player, structure } of assignment.players) {
        const { card, holder, mountAfter } = structure;
        if (!roster.contains(card) || usedCards.has(card)) {
          return { status: "incompatible", reason: "player-card-contract" };
        }
        if (!roster.contains(holder) || usedHolders.has(holder)) {
          return { status: "incompatible", reason: "player-holder-contract" };
        }
        usedCards.add(card);
        usedHolders.add(holder);
        const nicknameNodes = exactNicknameNodes(roster, player.nickname)
          .filter((node) => playerStructure(roster, node)?.holder === holder);
        const nicknameContainers = Array.from(card.querySelectorAll<HTMLElement>(NICKNAME_CONTAINER_SELECTOR))
          .filter(isRendered);
        const matchingNicknameContainers = nicknameContainers
          .filter((container) => nicknameNodes.some((nickname) => container.contains(nickname)));
        const nicknameContainer = matchingNicknameContainers.length === 1
          ? matchingNicknameContainers[0]
          : nicknameContainers.length === 1
            ? nicknameContainers[0]
            : undefined;
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
          mountAfter,
          ...(nicknameContainer ? { nicknameContainer } : {}),
          ...(nicknameSlot ? { nicknameSlot } : {}),
          ...(nativeLevel ? { nativeLevel } : {}),
          ...(avatarPair ? avatarPair : {}),
        });
      }
      teams.push({ team, roster, players });
    }

    return { status: "ready", teams };
  }

  #discoverHeaderTeams(teams: readonly MatchTeam[]): readonly TeamHeaderAnchor[] {
    const namedTeams = teams.flatMap((team) => {
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
