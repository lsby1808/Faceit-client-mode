import {
  aggregatePlayerMatches,
  calculateFormBattery,
  eligibleMatches,
  getEloTier,
  type FormBattery,
  type MatchContext,
  type MatchTeam,
  type Player,
  type PlayerMatch,
  type StatsWindow,
} from "@eloscope/core";

const ROSTER_SELECTOR = '[class*="Roster__Group-sc-"]';
const NICKNAME_SELECTOR = '[class*="Nickname__Name-sc-"]';
const PLAYER_CARD_SELECTOR = '[class*="ListContentPlayer__Background-sc-"]';
const PLAYER_HOLDER_SELECTOR = '[class*="styles__Holder-sc-"]';

export const INLINE_PLAYER_ATTRIBUTE = "data-eloscope-inline-player";
export const INLINE_TEAM_ATTRIBUTE = "data-eloscope-inline-team";

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
  .tier {
    flex: 0 0 auto;
    border: 1px solid #35c9ef;
    border-radius: 999px;
    padding: 1px 5px;
    color: #5ddcff;
    font-size: 10px;
    font-weight: 800;
    line-height: 1.25;
  }
  .country {
    color: #d8dde5;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .premade { color: #ff9d5a; font-size: 11px; line-height: 1; }
  .elo { color: #aeb4bc; white-space: nowrap; }
  .battery {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 17px;
    min-width: 49px;
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 2px 4px;
    outline: none;
  }
  .battery::after {
    content: "";
    align-self: center;
    width: 2px;
    height: 7px;
    margin-right: -7px;
    border-radius: 0 2px 2px 0;
    background: currentColor;
  }
  .battery i { width: 4px; height: 9px; border-radius: 1px; background: rgba(255, 255, 255, .13); }
  .battery i[data-on="true"] { background: currentColor; }
  .battery b { min-width: 17px; margin-left: 2px; line-height: 10px; text-align: right; }
  .battery:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
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

const TEAM_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    flex: 0 0 100%;
    grid-column: 1 / -1;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    margin: 0 0 7px;
    padding: 6px 9px;
    border: 1px solid rgba(255, 107, 33, .28);
    border-radius: 5px;
    background: rgba(12, 14, 17, .95);
    color: #aeb4bc;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  strong { overflow: hidden; color: #f4f5f6; text-overflow: ellipsis; white-space: nowrap; }
  span { text-align: right; }
`;

export type InlineMatchSettings = Readonly<{
  statsWindow: StatsWindow;
  showExtendedTier: boolean;
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
}>;

type TeamAnchor = Readonly<{
  team: MatchTeam;
  roster: HTMLElement;
  parent: HTMLElement;
  firstHolder: HTMLElement;
  players: readonly PlayerAnchor[];
}>;

type Mount = {
  host: HTMLElement;
  signature: string;
};

function normalizedNickname(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function isRendered(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.getAttribute("aria-hidden") === "true") return false;
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

function format(value: number | undefined, digits = 1): string {
  return value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function percent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
}

function canonicalMap(value: string | undefined): string | undefined {
  return value?.trim().replace(/^de_/iu, "").toLocaleLowerCase("en-US");
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

function appendBattery(parent: ParentNode, matches: readonly PlayerMatch[]): void {
  const battery = calculateFormBattery(matches);
  const title = batteryTitle(battery);
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
  const score = document.createElement("b");
  score.textContent = battery.score === null ? "?" : String(battery.score);
  node.append(score);
  parent.append(node);
}

function playerSignature(
  match: MatchContext,
  player: Player,
  rows: readonly PlayerMatch[],
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
    showExtendedTier: settings.showExtendedTier,
    rows: rows.map((row) => [
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
    ]),
  });
}

function renderPlayer(
  shadow: ShadowRoot,
  match: MatchContext,
  player: Player,
  rows: readonly PlayerMatch[],
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

  const displayedLevel = player.elo === undefined
    ? player.officialLevel
    : getEloTier(player.elo, settings.showExtendedTier);
  if (displayedLevel !== undefined) {
    const tier = appendTextNode(mapLine, "span", "tier", String(displayedLevel));
    tier.dataset.esTier = "";
    tier.title = settings.showExtendedTier
      ? `Шкала EloScope 1–20 · официальный FACEIT level ${player.officialLevel ?? "—"}`
      : "Официальный FACEIT level";
    tier.setAttribute(
      "aria-label",
      settings.showExtendedTier
        ? `EloScope level ${displayedLevel}, официальный FACEIT level ${player.officialLevel ?? "неизвестен"}`
        : `Официальный FACEIT level ${displayedLevel}`,
    );
  }
  appendTextNode(mapLine, "span", "elo", player.elo === undefined ? "ELO —" : `ELO ${Math.round(player.elo)}`);
  appendBattery(mapLine, validRows);
  card.append(mapLine);

  const overall = document.createElement("div");
  overall.className = "overall";
  overall.dataset.esStat = "overall";
  if (!aggregate || aggregate.matches === 0) {
    appendTextNode(overall, "span", "no-data", "Нет достоверных завершённых CS2 5v5 матчей");
  } else {
    appendMetric(overall, String(aggregate.matches), "матчи");
    appendMetric(overall, percent(aggregate.winRate), "победы");
    appendMetric(
      overall,
      `${format(aggregate.kills / aggregate.matches, 1)}/${format(aggregate.assists / aggregate.matches, 1)}/${format(aggregate.deaths / aggregate.matches, 1)}`,
      "K/A/D",
    );
    appendMetric(overall, format(aggregate.kd, 2), "K/D");
    appendMetric(overall, format(aggregate.kr, 2), "K/R");
    appendMetric(overall, format(aggregate.adr, 0), "ADR");
  }
  card.append(overall);
  shadow.replaceChildren(style, card);
}

function teamSummary(team: MatchTeam): { text: string; signature: string } {
  const elos = team.players.map((player) => player.elo).filter((elo): elo is number => elo !== undefined);
  const average = team.averageElo ?? (elos.length
    ? Math.round(elos.reduce((sum, elo) => sum + elo, 0) / elos.length)
    : undefined);
  const minimum = team.minElo ?? (elos.length ? Math.min(...elos) : undefined);
  const maximum = team.maxElo ?? (elos.length ? Math.max(...elos) : undefined);
  const known = team.eloKnown ?? elos.length;
  const total = team.eloTotal ?? team.players.length;
  const range = minimum === undefined || maximum === undefined ? "—" : `${minimum}–${maximum}`;
  const text = `AVG ${average ?? "—"} · ${range} · coverage ${known}/${total}${known < total ? " partial" : ""}`;
  return { text, signature: JSON.stringify([team.id, team.name, average, minimum, maximum, known, total]) };
}

function renderTeam(shadow: ShadowRoot, team: MatchTeam): void {
  const style = document.createElement("style");
  style.textContent = TEAM_STYLES;
  const summary = document.createElement("div");
  summary.className = "summary";
  summary.setAttribute("aria-label", `Сводка команды ${team.name ?? team.id}`);
  appendTextNode(summary, "strong", "", team.name ?? team.id);
  appendTextNode(summary, "span", "", teamSummary(team).text);
  shadow.replaceChildren(style, summary);
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

  constructor(ownerDocument: Document = document) {
    this.#document = ownerDocument;
  }

  render(
    match: MatchContext,
    playerMatches: ReadonlyMap<string, PlayerMatch[]>,
    settings: InlineMatchSettings,
  ): InlineMatchRenderResult {
    const discovery = this.#discover(match);
    if (discovery.status === "incompatible") {
      this.cleanup();
      return discovery;
    }

    const expectedPlayerIds = new Set(discovery.teams.flatMap((team) => team.players.map(({ player }) => player.id)));
    const expectedTeamIds = new Set(discovery.teams.map(({ team }) => team.id));
    this.#removeStale(this.#playerMounts, expectedPlayerIds);
    this.#removeStale(this.#teamMounts, expectedTeamIds);
    this.#removeOrphans(expectedPlayerIds, expectedTeamIds);

    let updated = 0;
    for (const teamAnchor of discovery.teams) {
      const summary = teamSummary(teamAnchor.team);
      let teamMount = this.#teamMounts.get(teamAnchor.team.id);
      if (!teamMount || !teamMount.host.isConnected || teamMount.host.parentElement !== teamAnchor.parent) {
        teamMount?.host.remove();
        const host = this.#document.createElement("div");
        host.setAttribute(INLINE_TEAM_ATTRIBUTE, teamAnchor.team.id);
        const shadow = host.attachShadow({ mode: "open" });
        teamMount = { host, signature: "" };
        this.#teamMounts.set(teamAnchor.team.id, teamMount);
        renderTeam(shadow, teamAnchor.team);
        teamMount.signature = summary.signature;
        updated += 1;
      } else if (teamMount.signature !== summary.signature) {
        renderTeam(teamMount.host.shadowRoot as ShadowRoot, teamAnchor.team);
        teamMount.signature = summary.signature;
        updated += 1;
      }
      if (teamAnchor.firstHolder.previousElementSibling !== teamMount.host) {
        teamAnchor.parent.insertBefore(teamMount.host, teamAnchor.firstHolder);
      }

      for (const anchor of teamAnchor.players) {
        const rows = eligibleMatches(playerMatches.get(anchor.player.id) ?? []);
        const signature = playerSignature(match, anchor.player, rows, settings);
        let mount = this.#playerMounts.get(anchor.player.id);
        if (!mount || !mount.host.isConnected || mount.host.parentElement !== anchor.holder) {
          mount?.host.remove();
          const host = this.#document.createElement("div");
          host.setAttribute(INLINE_PLAYER_ATTRIBUTE, anchor.player.id);
          const shadow = host.attachShadow({ mode: "open" });
          mount = { host, signature: "" };
          this.#playerMounts.set(anchor.player.id, mount);
          renderPlayer(shadow, match, anchor.player, rows, settings);
          mount.signature = signature;
          updated += 1;
        } else if (mount.signature !== signature) {
          renderPlayer(mount.host.shadowRoot as ShadowRoot, match, anchor.player, rows, settings);
          mount.signature = signature;
          updated += 1;
        }
        if (anchor.card.nextElementSibling !== mount.host) {
          anchor.card.insertAdjacentElement("afterend", mount.host);
        }
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
    for (const mount of this.#playerMounts.values()) mount.host.remove();
    for (const mount of this.#teamMounts.values()) mount.host.remove();
    this.#playerMounts.clear();
    this.#teamMounts.clear();
    this.#document.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}], [${INLINE_TEAM_ATTRIBUTE}]`)
      .forEach((host) => host.remove());
  }

  destroy(): void {
    this.cleanup();
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
        players.push({ player, card, holder });
      }
      const parent = players[0]?.holder.parentElement;
      if (!parent || !roster.contains(parent) || players.some(({ holder }) => holder.parentElement !== parent)) {
        return { status: "incompatible", reason: "player-holder-contract" };
      }
      const playerHolders = new Set(players.map(({ holder }) => holder));
      const firstHolder = Array.from(parent.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && playerHolders.has(child));
      if (!firstHolder) return { status: "incompatible", reason: "player-holder-contract" };
      teams.push({ team, roster, parent, firstHolder, players });
    }

    return { status: "ready", teams };
  }

  #removeStale(mounts: Map<string, Mount>, expectedIds: ReadonlySet<string>): void {
    for (const [id, mount] of mounts) {
      if (expectedIds.has(id)) continue;
      mount.host.remove();
      mounts.delete(id);
    }
  }

  #removeOrphans(expectedPlayerIds: ReadonlySet<string>, expectedTeamIds: ReadonlySet<string>): void {
    const playerHosts = new Set(Array.from(this.#playerMounts.values(), ({ host }) => host));
    const teamHosts = new Set(Array.from(this.#teamMounts.values(), ({ host }) => host));
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_PLAYER_ATTRIBUTE);
      if (!id || !expectedPlayerIds.has(id) || !playerHosts.has(host)) host.remove();
    });
    this.#document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}]`).forEach((host) => {
      const id = host.getAttribute(INLINE_TEAM_ATTRIBUTE);
      if (!id || !expectedTeamIds.has(id) || !teamHosts.has(host)) host.remove();
    });
  }
}
