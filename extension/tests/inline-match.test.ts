import {
  classifyPlayerRole,
  getEloTierPresentation,
  type MatchContext,
  type PlayerMapStats,
  type PlayerMatch,
  type PlayerRole,
} from "@eloscope/core";
import { describe, expect, it } from "vitest";

import {
  INLINE_BATTERY_ATTRIBUTE,
  INLINE_ENCOUNTER_ATTRIBUTE,
  INLINE_MAP_WINRATE_ATTRIBUTE,
  INLINE_PLAYER_ATTRIBUTE,
  INLINE_ROLE_ATTRIBUTE,
  INLINE_STREAK_ATTRIBUTE,
  INLINE_TEAM_ATTRIBUTE,
  INLINE_TIER_ATTRIBUTE,
  InlineMatchRenderer,
  type InlineMatchSettings,
} from "../src/inline-match";

const settings: InlineMatchSettings = {
  statsWindow: 30,
  mapWinRateWindow: 30,
  showExtendedTier: true,
  showPlayerRoles: true,
  showPlayerStreak: true,
  showMapWinRates: true,
};

function nativePlayer(nickname: string): string {
  const level = nickname === "BravoFive"
    ? 8
    : ["BravoTwo", "BravoThree", "BravoFour"].includes(nickname) ? 9 : 10;
  return `
    <div class="styles__Holder-sc-fixture-1">
      <article class="ListContentPlayer__Background-sc-fixture-0">
        <div class="ListContentPlayer__SlotWrapper-sc-fixture-1">
          <div class="styles__PlayerCardContainer-sc-fixture-1">
            <div class="styles__PlayerCard-sc-fixture-1"></div>
            <div size="40" class="Avatar__AvatarHolder-sc-fixture-1" style="position: relative; width: 40px; height: 40px;">
              <span class="styles__Container-sc-fixture-avatar-badges">
                <i data-testid="membership badge" role="img" aria-label="Membership badge"></i>
                <i data-testid="anti-cheat badge" role="img" aria-label="Anti-cheat badge"></i>
              </span>
              <img
                aria-label="avatar"
                draggable="false"
                data-avatar-for="${encodeURIComponent(nickname)}"
                class="Avatar__Image-sc-fixture-1"
                src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22%3E%3Crect width=%2240%22 height=%2240%22 fill=%22%232b313b%22/%3E%3C/svg%3E"
              >
            </div>
          </div>
        </div>
        <div class="styles__NicknameContainer-sc-fixture-1">
          <div class="Nickname__Container-sc-fixture-1">
            <a class="Nickname__Name-sc-fixture-1" href="/en/players/${encodeURIComponent(nickname)}">${nickname}</a>
          </div>
        </div>
        <div class="styles__EndSlotContainer-sc-fixture-1">
          <svg class="SkillIcon__StyledSvg-sc-fixture-1"><title>Skill level ${level}</title></svg>
        </div>
      </article>
    </div>
  `;
}

function nativeMatchHeader(leftName = "Alpha", rightName = "Bravo"): string {
  return `
    <div class="styles__HeaderWrapper-sc-fixture-1">
      <div
        class="styles__Container-sc-fixture-match-header"
        style="position: relative; width: 1090px; height: 180px;"
      >
        <div class="styles__HeaderMeta-sc-fixture-1">Match header</div>
        <div class="styles__Container-sc-fixture-factions">
          <div class="styles__Faction-sc-fixture-left">
            <div class="styles__FactionInfo-sc-fixture-left">
              <span class="styles__StyledFactionName-sc-fixture-left">${leftName}</span>
            </div>
          </div>
          <span class="styles__Versus-sc-fixture-1">vs</span>
          <div class="styles__Faction-sc-fixture-right">
            <div class="styles__FactionInfo-sc-fixture-right">
              <span class="styles__StyledFactionName-sc-fixture-right">${rightName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function mountNativeRoom(
  left: readonly string[],
  right: readonly string[],
  headerNames: readonly [string, string] = ["Alpha", "Bravo"],
): void {
  document.body.innerHTML = `
    <main>
      ${nativeMatchHeader(...headerNames)}
      <section class="Roster__Group-sc-left"><div class="team-list">${left.map(nativePlayer).join("")}</div></section>
      <aside>server and map</aside>
      <section class="Roster__Group-sc-right"><div class="team-list">${right.map(nativePlayer).join("")}</div></section>
    </main>
  `;
}

function applyMixedPremadeLayout(): void {
  const rosters = Array.from(document.querySelectorAll<HTMLElement>('[class*="Roster__Group"]'));
  for (const [rosterIndex, roster] of rosters.entries()) {
    const list = roster.querySelector<HTMLElement>(".team-list");
    const holders = list
      ? Array.from(list.children).filter((child): child is HTMLElement =>
          child instanceof HTMLElement && child.matches('[class*="styles__Holder"]'))
      : [];
    if (!list || holders.length !== 5) throw new Error("fixture roster is incomplete");

    const party = (partyIndex: number, first: HTMLElement, second: HTMLElement): HTMLElement => {
      const container = document.createElement("div");
      container.className = `RosterParty__Container-sc-live-${rosterIndex}-${partyIndex}`;
      const start = document.createElement("div");
      start.className = "RosterParty__PartyStart-sc-live";
      const end = document.createElement("div");
      end.className = "RosterParty__PartyEnd-sc-live";
      start.append(first);
      end.append(second);
      container.append(start, end);
      return container;
    };

    list.replaceChildren(
      party(0, holders[0] as HTMLElement, holders[1] as HTMLElement),
      holders[2] as HTMLElement,
      party(1, holders[3] as HTMLElement, holders[4] as HTMLElement),
    );
  }
}

const LEFT_PLAYERS = ["AlphaOne", "AlphaTwo", "AlphaThree", "AlphaFour", "AlphaFive"] as const;
const RIGHT_PLAYERS = ["BravoOne", "BravoTwo", "BravoThree", "BravoFour", "BravoFive"] as const;
const ROLE_SCORE_ORDER = ["sniper", "entry", "rifler", "support", "anchor"] as const satisfies readonly PlayerRole[];
const ROLE_SCORE_LABELS: Readonly<Record<PlayerRole, string>> = {
  sniper: "SNIPER",
  entry: "ENTRY",
  rifler: "RIFLER",
  support: "SUPPORT",
  anchor: "ANCHOR",
};
const EXTENDED_TIER_FLOORS = [
  { tier: 11, elo: 2_251 },
  { tier: 12, elo: 2_501 },
  { tier: 13, elo: 2_751 },
  { tier: 14, elo: 3_001 },
  { tier: 15, elo: 3_251 },
  { tier: 16, elo: 3_501 },
  { tier: 17, elo: 3_751 },
  { tier: 18, elo: 4_001 },
  { tier: 19, elo: 4_251 },
  { tier: 20, elo: 4_501 },
] as const;

function matchContext(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    id: "fixture-match",
    game: "cs2",
    status: "ongoing",
    mapPool: ["dust2", "mirage"],
    selectedMap: "dust2",
    teams: [
      {
        id: "team-alpha",
        name: "Alpha",
        players: [
          { id: "alpha-one", nickname: "AlphaOne", game: "cs2", elo: 2_511, officialLevel: 10 },
          { id: "alpha-two", nickname: "AlphaTwo", game: "cs2", elo: 2_305, officialLevel: 10 },
          { id: "alpha-three", nickname: "AlphaThree", game: "cs2", elo: 2_200, officialLevel: 10 },
          { id: "alpha-four", nickname: "AlphaFour", game: "cs2", elo: 2_100, officialLevel: 10 },
          { id: "alpha-five", nickname: "AlphaFive", game: "cs2", elo: 2_000, officialLevel: 10 },
        ],
      },
      {
        id: "team-bravo",
        name: "Bravo",
        players: [
          { id: "bravo-one", nickname: "BravoOne", game: "cs2", elo: 2_020, officialLevel: 10 },
          { id: "bravo-two", nickname: "BravoTwo", game: "cs2", elo: 1_910, officialLevel: 9 },
          { id: "bravo-three", nickname: "BravoThree", game: "cs2", elo: 1_850, officialLevel: 9 },
          { id: "bravo-four", nickname: "BravoFour", game: "cs2", elo: 1_800, officialLevel: 9 },
          { id: "bravo-five", nickname: "BravoFive", game: "cs2", elo: 1_750, officialLevel: 8 },
        ],
      },
    ],
    ...overrides,
  };
}

function playerMatches(playerId: string, map = "dust2"): PlayerMatch[] {
  const now = Date.now();
  return Array.from({ length: 20 }, (_, index) => ({
    id: `${playerId}-match-${index}`,
    playerId,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - index * 24 * 60 * 60 * 1_000,
    result: index % 3 === 2 ? "loss" as const : "win" as const,
    map,
    roundsPlayed: 24,
    kills: 18 + (index % 4),
    assists: 4 + (index % 3),
    deaths: 13 + (index % 3),
    damage: 1_920 + (index % 4) * 48,
    headshots: 8 + (index % 3),
    firstKills: 3 + (index % 2),
    survivedRounds: 9 + (index % 3),
  }));
}

function encounterMatch(
  playerId: string,
  matchId: string,
  teamId: string,
  result: PlayerMatch["result"],
  daysAgo: number,
  map = "dust2",
): PlayerMatch {
  return {
    id: matchId,
    playerId,
    teamId,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: Date.now() - daysAgo * 24 * 60 * 60 * 1_000,
    result,
    map,
    roundsPlayed: 24,
    kills: 18,
    assists: 5,
    deaths: 14,
    damage: 1_920,
    headshots: 8,
    firstKills: 3,
    survivedRounds: 9,
  };
}

function matchRows(match: MatchContext): ReadonlyMap<string, PlayerMatch[]> {
  return new Map(match.teams.flatMap((team) => team.players.map((player) => [player.id, playerMatches(player.id)] as const)));
}

function fiftyMatchesWithFixedRecentWinRate(playerId: string): PlayerMatch[] {
  const now = Date.now();
  const eligible = Array.from({ length: 50 }, (_, index): PlayerMatch => ({
    id: `${playerId}-fixed-window-${index}`,
    playerId,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - index * 24 * 60 * 60 * 1_000,
    // The latest 20 are 15 W / 5 L (75%). Every older match is a loss,
    // making a settings-driven 30- or 50-match aggregate observably wrong.
    result: index < 15 ? "win" : "loss",
    map: index % 2 === 0 ? "dust2" : "mirage",
    roundsPlayed: 24,
    kills: 18,
    assists: 5,
    deaths: 14,
    damage: 1_920,
    headshots: 8,
    firstKills: 3,
    survivedRounds: 9,
  }));
  const newerButIneligible: PlayerMatch = {
    ...eligible[0]!,
    id: `${playerId}-ongoing-newer`,
    status: "ongoing",
    finishedAt: now + 60_000,
    result: "win",
  };

  // Deliberately unsorted: the renderer must use the latest eligible rows,
  // rather than trusting transport order or counting the ongoing match.
  return [...eligible.slice(20).reverse(), newerButIneligible, ...eligible.slice(0, 20).reverse()];
}

function playerMapRows(match: MatchContext): ReadonlyMap<string, PlayerMapStats[]> {
  return new Map(match.teams.flatMap((team) => team.players.map((player) => [player.id, [
    { map: "dust2", matches: 300, wins: 165, kills: 5_700, assists: 1_200, deaths: 4_900, roundsPlayed: 7_200, damage: 612_000 },
    { map: "mirage", matches: 116, wins: 62, kills: 2_150, assists: 440, deaths: 1_900, roundsPlayed: 2_760, damage: 232_000 },
  ]] as const)));
}

function playerHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}]`));
}

function teamHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}]`));
}

function batteryHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}]`));
}

function encounterHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_ENCOUNTER_ATTRIBUTE}]`));
}

function streakHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_STREAK_ATTRIBUTE}]`));
}

function tierHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}]`));
}

function roleHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}]`));
}

function thresholdMatches(
  playerId: string,
  values: Readonly<{ wins: number; kills: number; deaths: number }>,
): PlayerMatch[] {
  return playerMatches(playerId).map((match, index) => ({
    ...match,
    result: index < values.wins ? "win" as const : "loss" as const,
    kills: values.kills,
    deaths: values.deaths,
  }));
}

function batteryTooltipMatches(playerId: string): PlayerMatch[] {
  const now = Date.now();
  const match = (
    id: string,
    daysAgo: number,
    result: PlayerMatch["result"],
    values: Readonly<{ damage: number; kills: number; deaths: number }>,
  ): PlayerMatch => ({
    id,
    playerId,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - daysAgo * 24 * 60 * 60 * 1_000,
    result,
    map: "dust2",
    roundsPlayed: 20,
    kills: values.kills,
    assists: 5,
    deaths: values.deaths,
    damage: values.damage,
    headshots: 8,
    firstKills: 3,
    survivedRounds: 7,
  });
  const recent = Array.from({ length: 5 }, (_, index) => match(
    `${playerId}-battery-recent-${index}`,
    index + 1,
    index === 0 ? "win" : "loss",
    { damage: 1_800, kills: 16, deaths: 10 },
  ));
  const baseline = Array.from({ length: 4 }, (_, index) => match(
    `${playerId}-battery-baseline-${index}`,
    index + 10,
    "win",
    { damage: 1_400, kills: 12, deaths: 15 },
  ));
  return [...baseline.reverse(), ...recent.reverse()];
}

function metricByLabel(shadow: ShadowRoot, label: string): HTMLElement {
  const metric = Array.from(shadow.querySelectorAll<HTMLElement>('[data-es-stat="overall"] .stat'))
    .find((candidate) => candidate.querySelector("small")?.textContent === label);
  if (!metric) throw new Error(`Missing inline metric: ${label}`);
  return metric;
}

describe("InlineMatchRenderer", () => {
  it("mounts aggregate, battery, role and extended-tier stats without a selected-map strip or removing native badges", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toEqual({
      status: "rendered",
      players: 10,
      teams: 2,
      updated: 44,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(teamHosts()).toHaveLength(2);
    expect(streakHosts()).toHaveLength(10);

    const alphaHost = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const nativeCard = alphaHost?.previousElementSibling;
    expect(nativeCard?.matches('[class*="ListContentPlayer__Background-sc-"]')).toBe(true);
    expect(alphaHost?.parentElement?.matches('[class*="styles__Holder-sc-"]')).toBe(true);
    expect(alphaHost?.shadowRoot?.querySelector('[data-es-stat="selected-map"]')).toBeNull();
    expect(alphaHost?.shadowRoot?.querySelector(".map")).toBeNull();
    const overall = alphaHost?.shadowRoot?.querySelector('[data-es-stat="overall"]');
    expect(overall?.textContent).toContain("416матчи");
    expect(overall?.textContent).toContain("19.5AVG KILLS");
    expect(overall?.textContent).not.toContain("K/A/D");
    expect(alphaHost?.shadowRoot?.querySelector("[data-es-form-battery]")).toBeNull();
    expect(alphaHost?.shadowRoot?.querySelector("[data-es-tier]")).toBeNull();

    const nicknameContainer = nativeCard?.querySelector<HTMLElement>('[class*="Nickname__Container-sc-"]');
    const batteryHost = document.querySelector<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`);
    expect(nicknameContainer?.nextElementSibling).toBe(batteryHost);
    expect(batteryHost?.shadowRoot?.querySelector("[data-es-form-battery]")).not.toBeNull();

    const nativeAvatar = nativeCard?.querySelector<HTMLImageElement>('img[class*="Avatar__Image-sc-"][aria-label="avatar"]');
    const avatarHolder = nativeAvatar?.parentElement;
    const roleHost = document.querySelector<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`);
    expect(roleHost?.parentElement).toBe(avatarHolder);
    expect(avatarHolder?.firstElementChild).toBe(roleHost);
    expect(nativeAvatar?.style.getPropertyValue("display")).toBe("none");
    expect(nativeAvatar?.style.getPropertyPriority("display")).toBe("important");
    expect(nativeAvatar?.getAttribute("aria-hidden")).toBe("true");
    expect(roleHost?.shadowRoot?.querySelector("[data-es-role]")).not.toBeNull();
    expect(avatarHolder?.querySelector('[data-testid="membership badge"]')).not.toBeNull();
    expect(avatarHolder?.querySelector('[data-testid="anti-cheat badge"]')).not.toBeNull();

    const nativeLevel = nativeCard?.querySelector<SVGSVGElement>('[class*="SkillIcon__StyledSvg-sc-"]');
    const tierHost = document.querySelector<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`);
    const streakHost = document.querySelector<HTMLElement>(`[${INLINE_STREAK_ATTRIBUTE}="alpha-one"]`);
    const streak = streakHost?.shadowRoot?.querySelector<HTMLElement>("[data-es-match-streak]");
    expect(streak?.dataset.esMatchStreak).toBe("win");
    expect(streak?.querySelector(".count")?.textContent).toBe("2");
    expect(streak?.getAttribute("aria-label")).toContain("Текущая серия побед: 2");
    expect(streakHost?.nextElementSibling).toBe(tierHost);
    expect(nativeLevel?.previousElementSibling).toBe(tierHost);
    expect(nativeLevel?.style.getPropertyValue("display")).toBe("none");
    expect(nativeLevel?.getAttribute("aria-hidden")).toBe("true");
    expect(tierHost?.shadowRoot?.querySelector("[data-es-tier]")?.textContent).toBe("12");
    expect(tierHost?.style.getPropertyValue("--es-tier-size")).toBe("30px");
    expect(tierHost?.shadowRoot?.querySelector("[data-es-tier]")?.getAttribute("role")).toBe("img");
    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="alpha-three"]`)).toBeNull();

    const headerContainer = document.querySelector<HTMLElement>('[class*="styles__Container-sc-fixture-match-header"]');
    const leftTeamHost = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`);
    const rightTeamHost = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-bravo"]`);
    expect(leftTeamHost?.parentElement).toBe(headerContainer);
    expect(rightTeamHost?.parentElement).toBe(headerContainer);
    expect(leftTeamHost?.getAttribute("data-eloscope-team-side")).toBe("left");
    expect(rightTeamHost?.getAttribute("data-eloscope-team-side")).toBe("right");
    expect(leftTeamHost?.shadowRoot?.textContent).toContain("AVG ELO 2223");
    expect(rightTeamHost?.shadowRoot?.textContent).toContain("AVG ELO 1866");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("·");
    expect(leftTeamHost?.shadowRoot?.querySelector("style")?.textContent).toContain("font-size: 14px");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("Alpha");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("coverage");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("2000–2511");
    expect(document.querySelectorAll(`[class*="Roster__Group-sc-"] [${INLINE_TEAM_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it("mounts verified teammate and opponent counts before native ELO controls and exposes an accessible rich tooltip", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const viewerMatches = [
      encounterMatch("alpha-one", "shared-opponent-new", "historic-alpha", "win", 2, "nuke"),
      encounterMatch("alpha-one", "shared-teammate", "historic-alpha", "win", 3, "mirage"),
      encounterMatch("alpha-one", "shared-bravo-teammate", "historic-mix", "win", 4, "ancient"),
      encounterMatch("alpha-one", "shared-opponent-old", "historic-alpha", "loss", 6, "dust2"),
      ...(rows.get("alpha-one") ?? []),
    ];
    rows.set("alpha-one", viewerMatches);
    rows.set("alpha-two", [
      encounterMatch("alpha-two", "shared-teammate", "historic-alpha", "win", 3, "mirage"),
      ...(rows.get("alpha-two") ?? []),
    ]);
    rows.set("bravo-one", [
      encounterMatch("bravo-one", "shared-opponent-new", "historic-bravo", "loss", 2, "nuke"),
      encounterMatch("bravo-one", "shared-bravo-teammate", "historic-mix", "win", 4, "ancient"),
      encounterMatch("bravo-one", "shared-opponent-old", "historic-bravo", "win", 6, "dust2"),
      ...(rows.get("bravo-one") ?? []),
    ]);
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: viewerMatches },
    )).toMatchObject({ status: "rendered", players: 10 });

    expect(encounterHosts()).toHaveLength(2);
    expect(document.querySelector(`[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    const teammateHost = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    const opponentHost = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="bravo-one"]`,
    ) as HTMLElement;
    const teammateEndSlot = teammateHost.parentElement as HTMLElement;
    expect(teammateEndSlot.matches('[class*="styles__EndSlotContainer"]')).toBe(true);
    expect(teammateEndSlot.firstElementChild).toBe(teammateHost);
    const teammateTier = document.querySelector<HTMLElement>(
      `[${INLINE_TIER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    const teammateNativeLevel = teammateEndSlot.querySelector<SVGSVGElement>(
      '[class*="SkillIcon__StyledSvg"]',
    ) as SVGSVGElement;
    const teammateStreak = document.querySelector<HTMLElement>(
      `[${INLINE_STREAK_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    expect(Array.from(teammateEndSlot.children).slice(0, 4)).toEqual([
      teammateHost,
      teammateStreak,
      teammateTier,
      teammateNativeLevel,
    ]);
    expect(teammateHost.shadowRoot?.querySelector('[data-es-encounter="teammate"] .count')?.textContent).toBe("1");
    expect(teammateHost.shadowRoot?.querySelector('[data-es-encounter="teammate"] svg')).not.toBeNull();

    const opponentTrigger = opponentHost.shadowRoot?.querySelector<HTMLElement>(
      '[data-es-encounter="opponent"]',
    ) as HTMLElement;
    const tooltip = opponentHost.shadowRoot?.querySelector<HTMLElement>(
      '[data-es-encounter-tooltip="opponent"]',
    ) as HTMLElement;
    expect(opponentHost.parentElement?.firstElementChild).toBe(opponentHost);
    const opponentNativeLevel = opponentHost.parentElement?.querySelector<SVGSVGElement>(
      '[class*="SkillIcon__StyledSvg"]',
    ) as SVGSVGElement;
    const opponentStreak = document.querySelector<HTMLElement>(
      `[${INLINE_STREAK_ATTRIBUTE}="bravo-one"]`,
    ) as HTMLElement;
    expect(Array.from(opponentHost.parentElement?.children ?? []).slice(0, 3)).toEqual([
      opponentHost,
      opponentStreak,
      opponentNativeLevel,
    ]);
    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="bravo-one"]`)).toBeNull();
    expect(opponentHost.shadowRoot?.querySelectorAll("[data-es-encounter]")).toHaveLength(2);
    const historicalTeammateTrigger = opponentHost.shadowRoot?.querySelector<HTMLElement>(
      '[data-es-encounter="teammate"]',
    ) as HTMLElement;
    const historicalTeammateTooltip = opponentHost.shadowRoot?.querySelector<HTMLElement>(
      '[data-es-encounter-tooltip="teammate"]',
    ) as HTMLElement;
    expect(historicalTeammateTrigger.querySelector(".count")?.textContent).toBe("1");
    expect(historicalTeammateTrigger.getAttribute("aria-describedby")).toBe(historicalTeammateTooltip.id);
    expect(opponentTrigger.tagName).toBe("SPAN");
    expect(opponentTrigger.getAttribute("role")).toBe("img");
    expect(opponentTrigger.tabIndex).toBe(0);
    expect(opponentTrigger.querySelector(".count")?.textContent).toBe("2");
    expect(opponentTrigger.getAttribute("aria-describedby")).toBe(tooltip.id);
    expect(opponentTrigger.getAttribute("aria-label")).toContain(
      "найдено в доступной истории, до 100 матчей каждого игрока",
    );
    expect(tooltip.getAttribute("role")).toBe("tooltip");
    expect(tooltip.getAttribute("popover")).toBe("manual");
    expect(tooltip.textContent).toContain("Соперник");
    expect(tooltip.textContent).toContain("Найдено в доступной истории (до 100 матчей каждого)");
    expect(tooltip.textContent).toContain("2");
    expect(tooltip.textContent).toContain("1 – 1");
    expect(tooltip.textContent).toContain("50.0%");
    expect(tooltip.textContent).toContain("Nuke");
    expect(tooltip.textContent).toContain("Dust2");
    expect(tooltip.textContent).toContain("Победа");
    expect(tooltip.textContent).toContain("Поражение");
    expect(tooltip.textContent).not.toMatch(/\d+\s*\/\s*\d+/u);

    opponentTrigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltip.dataset.open).toBe("true");
    expect(tooltip.style.left).toMatch(/px$/u);
    expect(tooltip.style.top).toMatch(/px$/u);
    historicalTeammateTrigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltip.dataset.open).toBeUndefined();
    expect(historicalTeammateTooltip.dataset.open).toBe("true");
    historicalTeammateTrigger.dispatchEvent(new MouseEvent("mouseleave"));
    opponentTrigger.dispatchEvent(new MouseEvent("mouseleave"));
    expect(tooltip.dataset.open).toBeUndefined();
    opponentTrigger.focus();
    expect(tooltip.dataset.open).toBe("true");
    opponentTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(tooltip.dataset.open).toBeUndefined();
    opponentTrigger.blur();
    expect(tooltip.dataset.open).toBeUndefined();

    let nativeClicks = 0;
    opponentHost.closest('[class*="ListContentPlayer__Background"]')
      ?.addEventListener("click", () => { nativeClicks += 1; });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
    opponentTrigger.dispatchEvent(click);
    expect(nativeClicks).toBe(1);
    expect(click.defaultPrevented).toBe(false);

    renderer.destroy();
    expect(encounterHosts()).toHaveLength(0);
    expect(streakHosts()).toHaveLength(0);
  });

  it("renders a red loss streak, updates it, and removes all streaks when the setting is disabled", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const alphaRows = [...(rows.get("alpha-one") ?? [])].map((row, index) => ({
      ...row,
      result: (index < 3 ? "loss" : index === 3 ? "win" : row.result) as PlayerMatch["result"],
    }));
    rows.set("alpha-one", alphaRows);
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, rows, playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    const lossHost = document.querySelector<HTMLElement>(
      `[${INLINE_STREAK_ATTRIBUTE}="alpha-one"]`,
    ) as HTMLElement;
    const loss = lossHost.shadowRoot?.querySelector<HTMLElement>("[data-es-match-streak]") as HTMLElement;
    expect(loss.dataset.esMatchStreak).toBe("loss");
    expect(loss.dataset.result).toBe("loss");
    expect(loss.querySelector(".count")?.textContent).toBe("3");
    expect(loss.getAttribute("aria-label")).toContain("Текущая серия поражений: 3");
    expect(loss.shadowRoot).toBeNull();

    const newestWinRows = alphaRows.map((row, index) => ({
      ...row,
      result: (index < 2 ? "win" : row.result) as PlayerMatch["result"],
    }));
    rows.set("alpha-one", newestWinRows);
    renderer.render(match, rows, playerMapRows(match), settings);
    const updated = lossHost.shadowRoot?.querySelector<HTMLElement>("[data-es-match-streak]") as HTMLElement;
    expect(updated.dataset.esMatchStreak).toBe("win");
    expect(updated.querySelector(".count")?.textContent).toBe("2");

    rows.set("alpha-one", alphaRows.map((row, index) => ({
      ...row,
      result: (index === 0 ? "win" : "loss") as PlayerMatch["result"],
    })));
    renderer.render(match, rows, playerMapRows(match), settings);
    expect(document.querySelector(`[${INLINE_STREAK_ATTRIBUTE}="alpha-one"]`)).toBeNull();

    renderer.render(match, rows, playerMapRows(match), {
      ...settings,
      showPlayerStreak: false,
    });
    expect(streakHosts()).toHaveLength(0);
  });

  it("uses the full bounded history for a streak beyond the 30-row display window", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const now = Date.now();
    const fullHistory = Array.from({ length: 40 }, (_, index): PlayerMatch => ({
      id: `long-streak-${index}`,
      playerId: "alpha-one",
      game: "cs2",
      mode: "5v5",
      status: "finished",
      finishedAt: now - index * 60_000,
      result: index < 35 ? "win" : "loss",
      map: "dust2",
      roundsPlayed: 24,
      kills: 18,
      assists: 5,
      deaths: 14,
      damage: 1_920,
    }));
    rows.set("alpha-one", fullHistory.slice(0, 30));
    const renderer = new InlineMatchRenderer();

    renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      {
        histories: new Map([["alpha-one", fullHistory]]),
      },
    );

    const streak = document.querySelector<HTMLElement>(
      `[${INLINE_STREAK_ATTRIBUTE}="alpha-one"]`,
    )?.shadowRoot?.querySelector<HTMLElement>("[data-es-match-streak]");
    expect(streak?.dataset.esMatchStreak).toBe("win");
    expect(streak?.querySelector(".count")?.textContent).toBe("35");
  });

  it("marks an uninterrupted full 100-match bridge sample as a lower bound", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const now = Date.now();
    const fullHistory = Array.from({ length: 100 }, (_, index): PlayerMatch => ({
      id: `bounded-streak-${index}`,
      playerId: "alpha-one",
      game: "cs2",
      mode: "5v5",
      status: "finished",
      finishedAt: now - index * 60_000,
      result: "win",
      map: "dust2",
      roundsPlayed: 24,
      kills: 18,
      assists: 5,
      deaths: 14,
      damage: 1_920,
    }));
    const renderer = new InlineMatchRenderer();

    renderer.render(
      match,
      matchRows(match),
      playerMapRows(match),
      settings,
      undefined,
      {
        histories: new Map([["alpha-one", fullHistory]]),
      },
    );

    const streak = document.querySelector<HTMLElement>(
      `[${INLINE_STREAK_ATTRIBUTE}="alpha-one"]`,
    )?.shadowRoot?.querySelector<HTMLElement>("[data-es-match-streak]");
    expect(streak?.querySelector(".count")?.textContent).toBe("100+");
    expect(streak?.getAttribute("aria-label")).toContain("не менее 100 матчей");
  });

  it("hides encounter UI for the viewer, missing histories and verified histories without intersections", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const viewerMatches = [
      encounterMatch("alpha-one", "shared-stale", "historic-alpha", "win", 2),
      ...(rows.get("alpha-one") ?? []),
    ];
    rows.set("alpha-one", viewerMatches);
    rows.set("alpha-two", [
      encounterMatch("alpha-two", "shared-stale", "historic-alpha", "win", 2),
      ...(rows.get("alpha-two") ?? []),
    ]);
    const renderer = new InlineMatchRenderer();

    renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: viewerMatches },
    );
    const stale = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    expect(stale).not.toBeNull();
    expect(document.querySelector(`[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-one"]`)).toBeNull();

    renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one" },
    );
    expect(encounterHosts()).toHaveLength(0);
    expect(stale.isConnected).toBe(false);

    renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: viewerMatches },
    );
    const restored = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    expect(restored).not.toBeNull();

    const missingTarget = new Map(rows);
    missingTarget.delete("alpha-two");
    renderer.render(
      match,
      missingTarget,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: viewerMatches },
    );
    expect(encounterHosts()).toHaveLength(0);
    expect(restored.isConnected).toBe(false);

    const noOverlap = matchRows(match);
    renderer.render(
      match,
      noOverlap,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: noOverlap.get("alpha-one") },
    );
    expect(encounterHosts()).toHaveLength(0);
  });

  it("fails closed only for an ambiguous native end slot", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const shared = encounterMatch("alpha-one", "shared-teammate", "historic-alpha", "win", 2);
    const targetShared = encounterMatch("alpha-two", "shared-teammate", "historic-alpha", "win", 2);
    const viewerMatches = [shared, ...(rows.get("alpha-one") ?? [])];
    rows.set("alpha-one", viewerMatches);
    rows.set("alpha-two", [targetShared, ...(rows.get("alpha-two") ?? [])]);
    const alphaTwoCard = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/players/"]'))
      .find((link) => link.textContent === "AlphaTwo")
      ?.closest<HTMLElement>('[class*="ListContentPlayer__Background"]') as HTMLElement;
    const endSlot = alphaTwoCard.querySelector<HTMLElement>('[class*="styles__EndSlotContainer"]') as HTMLElement;
    alphaTwoCard.append(endSlot.cloneNode(true));
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      { id: "alpha-one", matches: viewerMatches },
    )).toMatchObject({ status: "rendered", players: 10 });
    expect(document.querySelector(`[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`)).toBeNull();
    expect(document.querySelector(`[${INLINE_STREAK_ATTRIBUTE}="alpha-two"]`)).toBeNull();
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-two"]`)).not.toBeNull();
    expect(document.querySelector(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-two"]`)).not.toBeNull();
  });

  it("remounts an encounter host after React replaces its verified player row", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const viewerMatches = [
      encounterMatch("alpha-one", "shared-teammate", "historic-alpha", "win", 2),
      ...(rows.get("alpha-one") ?? []),
    ];
    rows.set("alpha-one", viewerMatches);
    rows.set("alpha-two", [
      encounterMatch("alpha-two", "shared-teammate", "historic-alpha", "win", 2),
      ...(rows.get("alpha-two") ?? []),
    ]);
    const renderer = new InlineMatchRenderer();
    const viewer = { id: "alpha-one", matches: viewerMatches } as const;
    renderer.render(match, rows, playerMapRows(match), settings, undefined, viewer);
    const original = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    const holder = original.closest<HTMLElement>('[class*="styles__Holder"]') as HTMLElement;
    const template = document.createElement("template");
    template.innerHTML = nativePlayer("AlphaTwo");
    const replacement = template.content.firstElementChild as HTMLElement;
    holder.replaceWith(replacement);

    expect(renderer.render(
      match,
      rows,
      playerMapRows(match),
      settings,
      undefined,
      viewer,
    )).toMatchObject({ status: "rendered", players: 10 });
    const remounted = document.querySelector<HTMLElement>(
      `[${INLINE_ENCOUNTER_ATTRIBUTE}="alpha-two"]`,
    ) as HTMLElement;
    expect(original.isConnected).toBe(false);
    expect(remounted).not.toBe(original);
    expect(remounted.parentElement?.firstElementChild).toBe(remounted);
    expect(remounted.nextElementSibling).toBe(
      document.querySelector(`[${INLINE_STREAK_ATTRIBUTE}="alpha-two"]`),
    );
  });

  it("explains the battery with actual recent, baseline and signed delta values", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const batteryRows = batteryTooltipMatches("alpha-one");
    const duplicate = batteryRows.find(({ id }) => id.endsWith("recent-0"));
    if (!duplicate) throw new Error("Missing duplicate battery fixture row");
    rows.set("alpha-one", [...batteryRows, { ...duplicate }]);
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const battery = document.querySelector<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`)
      ?.shadowRoot?.querySelector<HTMLElement>("[data-es-form-battery]");
    const title = battery?.title ?? "";

    expect(title).toContain("Форма ");
    expect(title).toContain("· уверенность ");
    expect(title).toContain("Свежие (взвешенно) — 5 матчей за 7 дней");
    expect(title).toContain("ADR 90.0 · K/R 0.80 · K/D 1.60 · WR 29.7%");
    expect(title).toContain("База — 4 следующих матча за 90 дней");
    expect(title).toContain("ADR 70.0 · K/R 0.60 · K/D 0.80 · WR 100.0%");
    expect(title).toContain("Изменение (свежие − база)");
    expect(title).toContain("ADR +20.0 · K/R +0.20 · K/D +0.80 · WR -70.3 п.п.");
    expect(title).not.toContain("recent");
    expect(title).not.toContain("baseline");
    expect(battery?.getAttribute("aria-label")).toBe(title);
  });

  it("explains why the battery is unknown and keeps its accessible label in sync", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", batteryTooltipMatches("alpha-one").filter((row) =>
      row.id.includes("baseline") || row.id.endsWith("recent-0")));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const battery = document.querySelector<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`)
      ?.shadowRoot?.querySelector<HTMLElement>("[data-es-form-battery]");
    const title = battery?.title ?? "";

    expect(title).toContain("Форма неизвестна · уверенность 0%");
    expect(title).toContain("Свежие (взвешенно) — 1 матч за 7 дней");
    expect(title).toContain("База — 4 следующих матча за 90 дней");
    expect(title).toContain("Для расчёта нужно минимум 2 свежих матча");
    expect(title).not.toContain("ADR —");
    expect(battery?.getAttribute("aria-label")).toBe(title);
  });

  it("renders a zero battery delta without a misleading positive or negative sign", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", batteryTooltipMatches("alpha-one").map((row) => ({
      ...row,
      result: "win" as const,
      damage: 1_400,
      kills: 12,
      deaths: 15,
    })));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const title = document.querySelector<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`)
      ?.shadowRoot?.querySelector<HTMLElement>("[data-es-form-battery]")?.title ?? "";

    expect(title).toContain("ADR 0.0 · K/R 0.00 · K/D 0.00 · WR 0.0 п.п.");
    expect(title).not.toContain("+0.0");
    expect(title).not.toContain("-0.0");
  });

  it("keeps five 20-match role scores beside the aggregate and swaps panels through hover and focus CSS only", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const shadow = host?.shadowRoot;
    const card = shadow?.querySelector<HTMLElement>('.card[data-has-role-scores="true"]');
    const overall = card?.querySelector<HTMLElement>('[data-es-stat="overall"]');
    const roles = card?.querySelector<HTMLElement>('[data-es-stat="roles"]');
    const tiles = Array.from(roles?.querySelectorAll<HTMLElement>("[data-es-role-score]") ?? []);
    const analysis = classifyPlayerRole(rows.get("alpha-one") ?? []);

    expect(card?.tabIndex).toBe(0);
    expect(overall).not.toBeNull();
    expect(roles).not.toBeNull();
    expect(tiles.map(({ dataset }) => dataset.esRoleScore)).toEqual(ROLE_SCORE_ORDER);
    expect(tiles.map((tile) => tile.querySelector("small")?.textContent)).toEqual(
      ROLE_SCORE_ORDER.map((role) => ROLE_SCORE_LABELS[role]),
    );
    expect(analysis.status).toBe("known");
    if (analysis.status === "known") {
      expect(tiles.map((tile) => tile.querySelector("b")?.textContent)).toEqual(
        ROLE_SCORE_ORDER.map((role) => {
          const score = analysis.scores[role];
          return score === null ? "—" : String(Math.round(score * 100));
        }),
      );
    }

    const styles = shadow?.querySelector("style")?.textContent ?? "";
    expect(styles).toContain('.card[data-has-role-scores="true"]:hover');
    expect(styles).toContain('.card[data-has-role-scores="true"]:focus-visible');

    const originalOverall = overall;
    const originalRoles = roles;
    card?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    card?.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    card?.focus();
    card?.blur();
    expect(card?.querySelector('[data-es-stat="overall"]')).toBe(originalOverall);
    expect(card?.querySelector('[data-es-stat="roles"]')).toBe(originalRoles);
  });

  it("keeps role scores fixed to the newest 20 eligible matches when the visible stats window changes", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const alphaRows = fiftyMatchesWithFixedRecentWinRate("alpha-one");
    rows.set("alpha-one", alphaRows);
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), { ...settings, statsWindow: 5 });
    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const readScores = (): string[] => Array.from(
      host?.shadowRoot?.querySelectorAll<HTMLElement>('[data-es-stat="roles"] [data-es-role-score] b') ?? [],
      (node) => node.textContent ?? "",
    );
    const fiveMatchWindowScores = readScores();

    renderer.render(match, rows, playerMapRows(match), { ...settings, statsWindow: 50 });

    expect(fiveMatchWindowScores).toHaveLength(5);
    expect(readScores()).toEqual(fiveMatchWindowScores);
    const analysis = classifyPlayerRole(alphaRows);
    expect(analysis).toMatchObject({ status: "known", sampleSize: 20, requiredMatches: 20 });
  });

  it("does not invent unavailable role scores and removes the hover panel with the player-role setting", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", (rows.get("alpha-one") ?? []).map((row) => {
      const copy = { ...row };
      delete copy.firstKills;
      delete copy.headshots;
      return copy;
    }));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const shadow = host?.shadowRoot;
    const scores = shadow?.querySelector<HTMLElement>('[data-es-stat="roles"]');
    expect(scores?.querySelector('[data-es-role-score="sniper"] b')?.textContent).toBe("—");
    expect(scores?.querySelector('[data-es-role-score="entry"] b')?.textContent).toBe("—");
    expect(scores?.textContent).not.toContain("NaN");

    renderer.render(match, rows, playerMapRows(match), { ...settings, showPlayerRoles: false });

    expect(shadow?.querySelector('[data-es-stat="roles"]')).toBeNull();
    expect(shadow?.querySelector('[data-es-stat="overall"]')).not.toBeNull();
  });

  it("refreshes the hover scores when role-only source metrics change", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, playerMapRows(match), settings);

    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const entryScore = (): string | null | undefined => host?.shadowRoot
      ?.querySelector('[data-es-role-score="entry"] b')?.textContent;
    const before = entryScore();
    rows.set("alpha-one", (rows.get("alpha-one") ?? []).map((row) => ({
      ...row,
      firstKills: 0,
      survivedRounds: row.roundsPlayed,
    })));

    renderer.render(match, rows, playerMapRows(match), settings);

    expect(before).toBeDefined();
    expect(entryScore()).not.toBe(before);
  });

  it.each(EXTENDED_TIER_FLOORS)(
    "replaces official level 10 exactly once at EloScope tier $tier floor $elo",
    ({ tier, elo }) => {
      mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
      const base = matchContext();
      const match: MatchContext = {
        ...base,
        teams: base.teams.map((team) => ({
          ...team,
          players: team.players.map((player) => {
            if (player.id === "alpha-one") return { ...player, elo, officialLevel: 10 };
            if (player.id === "alpha-two") return { ...player, elo: 2_250, officialLevel: 10 };
            return player;
          }),
        })),
      };
      const renderer = new InlineMatchRenderer();

      renderer.render(match, matchRows(match), playerMapRows(match), settings);

      const nativeLevel = document.querySelector<SVGSVGElement>(
        '[class*="Roster__Group-sc-left"] [class*="SkillIcon__StyledSvg-sc-"]',
      );
      const replacements = document.querySelectorAll<HTMLElement>(
        `[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`,
      );
      const replacement = replacements[0];
      const tierNode = replacement?.shadowRoot?.querySelector<HTMLElement>("[data-es-tier]");

      expect(nativeLevel?.querySelector("title")?.textContent).toBe("Skill level 10");
      expect(replacements).toHaveLength(1);
      expect(tierHosts()).toHaveLength(1);
      expect(nativeLevel?.previousElementSibling).toBe(replacement);
      expect(tierNode?.dataset.esTier).toBe(String(tier));
      expect(tierNode?.textContent).toBe(String(tier));
      expect(tierNode?.style.getPropertyValue("--es-tier-color")).toBe(
        getEloTierPresentation(tier).foreground,
      );
    },
  );

  it("uses a distinct palette foreground for every EloScope tier from 11 through 20", () => {
    const colors = EXTENDED_TIER_FLOORS.map(({ tier }) => getEloTierPresentation(tier).foreground);

    expect(new Set(colors).size).toBe(EXTENDED_TIER_FLOORS.length);
  });

  it.each([30, 50] as const)(
    "calculates WINS from exactly the latest 20 eligible matches when statsWindow is %i",
    (statsWindow) => {
      mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
      const match = matchContext();
      const rows = new Map(matchRows(match));
      rows.set("alpha-one", fiftyMatchesWithFixedRecentWinRate("alpha-one"));
      const renderer = new InlineMatchRenderer();

      renderer.render(match, rows, playerMapRows(match), { ...settings, statsWindow });

      const overall = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)
        ?.shadowRoot?.querySelector<HTMLElement>('[data-es-stat="overall"]');
      const metrics = Array.from(overall?.querySelectorAll<HTMLElement>(".stat") ?? []);
      const wins = overall?.querySelector<HTMLElement>('[data-es-metric="win-rate-20"]');
      expect(metrics[0]?.querySelector("b")?.textContent).toBe("416");
      expect(wins).toBe(metrics[1]);
      expect(wins?.querySelector("b")?.textContent).toBe("75.0%");
      expect(wins?.title).toContain("последние 20 завершённых матчей");
    },
  );

  it("colors below-threshold K/D, 20-match win rate and average kills red", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", thresholdMatches("alpha-one", {
      wins: 8,
      kills: 14,
      deaths: 16,
    }));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const shadow = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)?.shadowRoot;
    expect(shadow).not.toBeNull();
    if (!shadow) throw new Error("Missing alpha-one inline ShadowRoot");

    const winRate = shadow.querySelector<HTMLElement>('[data-es-metric="win-rate-20"]');
    const averageKills = metricByLabel(shadow, "AVG KILLS");
    const kd = metricByLabel(shadow, "K/D");

    expect(winRate?.querySelector("b")).toMatchObject({
      textContent: "40.0%",
      dataset: expect.objectContaining({ tone: "bad" }),
    });
    expect(averageKills.querySelector("b")).toMatchObject({
      textContent: "14.0",
      dataset: expect.objectContaining({ tone: "bad" }),
    });
    expect(kd.querySelector("b")).toMatchObject({
      textContent: "0.88",
      dataset: expect.objectContaining({ tone: "bad" }),
    });
    expect(shadow.querySelector("style")?.textContent).toContain(
      '.stat b[data-tone="bad"] { color: #ff4655; }',
    );
  });

  it("colors K/D, 20-match win rate and average kills green at their inclusive thresholds", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", thresholdMatches("alpha-one", {
      wins: 10,
      kills: 15,
      deaths: 15,
    }));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const shadow = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)?.shadowRoot;
    expect(shadow).not.toBeNull();
    if (!shadow) throw new Error("Missing alpha-one inline ShadowRoot");

    const winRate = shadow.querySelector<HTMLElement>('[data-es-metric="win-rate-20"]');
    const averageKills = metricByLabel(shadow, "AVG KILLS");
    const kd = metricByLabel(shadow, "K/D");

    expect(winRate?.querySelector("b")).toMatchObject({
      textContent: "50.0%",
      dataset: expect.objectContaining({ tone: "good" }),
    });
    expect(averageKills.querySelector("b")).toMatchObject({
      textContent: "15.0",
      dataset: expect.objectContaining({ tone: "good" }),
    });
    expect(kd.querySelector("b")).toMatchObject({
      textContent: "1.00",
      dataset: expect.objectContaining({ tone: "good" }),
    });
    expect(shadow.querySelector("style")?.textContent).toContain(
      '.stat b[data-tone="good"] { color: #21d07a; }',
    );
  });

  it("keeps unavailable K/D, win rate and average kills neutral", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", []);
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);

    const shadow = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)?.shadowRoot;
    expect(shadow).not.toBeNull();
    if (!shadow) throw new Error("Missing alpha-one inline ShadowRoot");

    const metrics = [
      shadow.querySelector<HTMLElement>('[data-es-metric="win-rate-20"]'),
      metricByLabel(shadow, "AVG KILLS"),
      metricByLabel(shadow, "K/D"),
    ];
    for (const metric of metrics) {
      const value = metric?.querySelector<HTMLElement>("b");
      expect(value?.textContent).toBe("—");
      expect(value?.hasAttribute("data-tone")).toBe(false);
    }
    expect(shadow.querySelector("style")?.textContent).toContain(
      ".stat b { display: block; overflow: hidden; color: #e8eaed;",
    );
  });

  it("maps compact header metrics by exact team name even when native sides are reversed", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS, ["Bravo", "Alpha"]);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    const alpha = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`);
    const bravo = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-bravo"]`);
    expect(alpha?.getAttribute("data-eloscope-team-side")).toBe("right");
    expect(bravo?.getAttribute("data-eloscope-team-side")).toBe("left");
    expect(alpha?.shadowRoot?.textContent).toContain("AVG ELO 2223");
    expect(bravo?.shadowRoot?.textContent).toContain("AVG ELO 1866");
    expect(alpha?.shadowRoot?.textContent).not.toContain("·");
  });

  it("shows the known-player count for partial ELO and never invents a zero average", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const base = matchContext();
    const alpha = base.teams[0] as MatchContext["teams"][number];
    const partialPlayers = alpha.players.map((player, index) => {
      if (index < 3) return player;
      const { elo: _elo, ...withoutElo } = player;
      return withoutElo;
    });
    const match = matchContext({
      teams: [
        { ...alpha, players: partialPlayers },
        base.teams[1] as MatchContext["teams"][number],
      ],
    });
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    const alphaMetric = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`);
    expect(alphaMetric?.shadowRoot?.textContent).toContain("AVG ELO 2339");
    expect(alphaMetric?.shadowRoot?.textContent).not.toContain("·");
    expect(alphaMetric?.shadowRoot?.textContent).not.toContain("AVG ELO 0");
  });

  it("omits a team metric when every player ELO is unavailable", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const base = matchContext();
    const alpha = base.teams[0] as MatchContext["teams"][number];
    const playersWithoutElo = alpha.players.map((player) => {
      const { elo: _elo, ...withoutElo } = player;
      return withoutElo;
    });
    const match = matchContext({
      teams: [
        { ...alpha, players: playersWithoutElo },
        base.teams[1] as MatchContext["teams"][number],
      ],
    });
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    expect(document.querySelector(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`)).toBeNull();
    expect(document.querySelector(`[${INLINE_TEAM_ATTRIBUTE}="team-bravo"]`)).not.toBeNull();
    expect(teamHosts().some((host) => host.shadowRoot?.textContent?.includes("AVG ELO 0"))).toBe(false);
    expect(playerHosts()).toHaveLength(10);
  });

  it("reattaches both metrics after a native React header replacement", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    const oldHeader = document.querySelector<HTMLElement>('[class*="styles__HeaderWrapper-sc-"]') as HTMLElement;
    const oldAlphaMetric = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`) as HTMLElement;
    const oldBravoMetric = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-bravo"]`) as HTMLElement;
    const alphaPlayer = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const alphaBattery = document.querySelector<HTMLElement>(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const alphaTier = document.querySelector<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const alphaRole = document.querySelector<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const template = document.createElement("template");
    template.innerHTML = nativeMatchHeader();
    oldHeader.replaceWith(template.content.firstElementChild as HTMLElement);

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", updated: 2 });
    expect(oldAlphaMetric.isConnected).toBe(false);
    expect(oldBravoMetric.isConnected).toBe(false);
    expect(teamHosts()).toHaveLength(2);
    expect(document.querySelector(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`)).not.toBe(oldAlphaMetric);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).toBe(alphaPlayer);
    expect(document.querySelector(`[${INLINE_BATTERY_ATTRIBUTE}="alpha-one"]`)).toBe(alphaBattery);
    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`)).toBe(alphaTier);
    expect(document.querySelector(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`)).toBe(alphaRole);
  });

  it("removes only header metrics when the native header contract is ambiguous", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    expect(teamHosts()).toHaveLength(2);
    const header = document.querySelector<HTMLElement>('[class*="styles__HeaderWrapper-sc-"]') as HTMLElement;
    const duplicate = header.cloneNode(true) as HTMLElement;
    duplicate.querySelectorAll(`[${INLINE_TEAM_ATTRIBUTE}]`).forEach((host) => host.remove());
    document.body.append(duplicate);

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", players: 10 });
    expect(teamHosts()).toHaveLength(0);
    expect(playerHosts()).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
    expect(tierHosts()).toHaveLength(2);
    expect(roleHosts()).toHaveLength(10);
  });

  it("keeps unchanged hosts intact and only rerenders signatures that changed", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const originalCard = host.shadowRoot?.querySelector(".card");

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", updated: 0 });
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).toBe(host);
    expect(host.shadowRoot?.querySelector(".card")).toBe(originalCard);

    const updatedMatch = { ...match, selectedMap: "mirage" };
    expect(renderer.render(updatedMatch, rows, maps, settings)).toMatchObject({ status: "rendered", updated: 0 });
    expect(host.shadowRoot?.querySelector(".card")).toBe(originalCard);
    expect(host.shadowRoot?.querySelector('[data-es-stat="selected-map"]')).toBeNull();
  });

  it("repairs a detached player host after a native React card rerender", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    const originalAlpha = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const originalBravo = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="bravo-one"]`) as HTMLElement;
    const originalHolder = originalAlpha.parentElement as HTMLElement;
    const originalNativeAvatar = originalHolder.querySelector<HTMLImageElement>('img[class*="Avatar__Image-sc-"]') as HTMLImageElement;
    const template = document.createElement("template");
    template.innerHTML = nativePlayer("AlphaOne");
    const replacementHolder = template.content.firstElementChild as HTMLElement;

    originalHolder.replaceWith(replacementHolder);

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", updated: 5 });
    expect(document.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}]`)).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
    expect(streakHosts()).toHaveLength(10);
    expect(tierHosts()).toHaveLength(2);
    expect(roleHosts()).toHaveLength(10);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).not.toBe(originalAlpha);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="bravo-one"]`)).toBe(originalBravo);
    expect(replacementHolder.lastElementChild?.getAttribute(INLINE_PLAYER_ATTRIBUTE)).toBe("alpha-one");
    const replacementAvatar = replacementHolder.querySelector<HTMLImageElement>('img[class*="Avatar__Image-sc-"]');
    const replacementRole = replacementHolder.querySelector<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`);
    expect(replacementRole?.parentElement).toBe(replacementAvatar?.parentElement);
    expect(replacementAvatar?.style.getPropertyValue("display")).toBe("none");
    expect(originalNativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(originalNativeAvatar.hasAttribute("aria-hidden")).toBe(false);
  });

  it("restores the exact native avatar state when player roles are disabled", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const nativeAvatar = document.querySelector<HTMLImageElement>(
      '[class*="Roster__Group-sc-left"] img[class*="Avatar__Image-sc-"][aria-label="avatar"]',
    ) as HTMLImageElement;
    nativeAvatar.style.setProperty("display", "inline-block", "important");
    nativeAvatar.setAttribute("aria-hidden", "false");
    const avatarHolder = nativeAvatar.parentElement as HTMLElement;
    avatarHolder.title = "Native FACEIT avatar";
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, maps, settings);
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("none");
    expect(nativeAvatar.style.getPropertyPriority("display")).toBe("important");
    expect(nativeAvatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatarHolder.title).not.toBe("Native FACEIT avatar");

    expect(renderer.render(match, rows, maps, {
      ...settings,
      showPlayerRoles: false,
    })).toMatchObject({ status: "rendered" });
    expect(roleHosts()).toHaveLength(0);
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("inline-block");
    expect(nativeAvatar.style.getPropertyPriority("display")).toBe("important");
    expect(nativeAvatar.getAttribute("aria-hidden")).toBe("false");
    expect(avatarHolder.title).toBe("Native FACEIT avatar");
  });

  it("keeps the FACEIT avatar when fewer than 20 eligible matches are available", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = new Map(matchRows(match));
    rows.set("alpha-one", (rows.get("alpha-one") ?? []).slice(0, 19));
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, rows, playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(roleHosts()).toHaveLength(9);
    expect(document.querySelector(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    const playerHost = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    expect(playerHost?.shadowRoot?.querySelector('[data-es-stat="roles"]')).toBeNull();
    expect(playerHost?.shadowRoot?.querySelector('[data-es-stat="overall"]')).not.toBeNull();
    const nativeAvatar = document.querySelector<HTMLImageElement>(
      '[data-avatar-for="AlphaOne"]',
    ) as HTMLImageElement;
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(nativeAvatar.hasAttribute("aria-hidden")).toBe(false);
  });

  it("supports FACEIT's default avatar icon while preserving its holder badges", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const image = document.querySelector<HTMLImageElement>('[data-avatar-for="AlphaOne"]') as HTMLImageElement;
    const avatarHolder = image.parentElement as HTMLElement;
    const defaultAvatar = document.createElement("i");
    defaultAvatar.className = "Avatar__AvatarIcon-sc-fixture-1";
    defaultAvatar.setAttribute("aria-label", "avatar");
    defaultAvatar.dataset.avatarFor = "AlphaOne-default";
    image.replaceWith(defaultAvatar);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    const roleHost = document.querySelector<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`);
    expect(roleHost?.parentElement).toBe(avatarHolder);
    expect(defaultAvatar.style.getPropertyValue("display")).toBe("none");
    expect(defaultAvatar.style.getPropertyPriority("display")).toBe("important");
    expect(defaultAvatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatarHolder.querySelector('[data-testid="membership badge"]')).not.toBeNull();

    renderer.destroy();
    expect(defaultAvatar.style.getPropertyValue("display")).toBe("");
    expect(defaultAvatar.hasAttribute("aria-hidden")).toBe(false);
  });

  it("keeps the FACEIT avatar when CSS drift makes its holder unsafe for an absolute overlay", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const nativeAvatar = document.querySelector<HTMLImageElement>('[data-avatar-for="AlphaOne"]') as HTMLImageElement;
    const avatarHolder = nativeAvatar.parentElement as HTMLElement;
    avatarHolder.style.position = "static";
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    expect(document.querySelector(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    expect(roleHosts()).toHaveLength(9);
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(nativeAvatar.hasAttribute("aria-hidden")).toBe(false);
    expect(playerHosts()).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
  });

  it("fails closed for an ambiguous primary avatar and restores an already hidden native image", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    const nativeAvatar = document.querySelector<HTMLImageElement>('[data-avatar-for="AlphaOne"]') as HTMLImageElement;
    const avatarHolder = nativeAvatar.parentElement as HTMLElement;
    const duplicate = nativeAvatar.cloneNode(true) as HTMLImageElement;
    duplicate.removeAttribute("style");
    duplicate.removeAttribute("aria-hidden");
    duplicate.dataset.avatarFor = "AlphaOne-duplicate";
    avatarHolder.append(duplicate);

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", players: 10 });
    expect(document.querySelector(`[${INLINE_ROLE_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    expect(roleHosts()).toHaveLength(9);
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(nativeAvatar.hasAttribute("aria-hidden")).toBe(false);
    expect(duplicate.style.getPropertyValue("display")).toBe("");
    expect(playerHosts()).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
  });

  it("restores the native FACEIT level when the extended scale is disabled", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const maps = playerMapRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, maps, settings);
    const nativeLevel = document.querySelector<SVGSVGElement>(
      '[class*="Roster__Group-sc-left"] [class*="SkillIcon__StyledSvg-sc-"]',
    ) as SVGSVGElement;
    expect(nativeLevel.style.getPropertyValue("display")).toBe("none");

    expect(renderer.render(match, rows, maps, {
      ...settings,
      showExtendedTier: false,
    })).toMatchObject({ status: "rendered", updated: 2 });
    expect(tierHosts()).toHaveLength(0);
    expect(nativeLevel.style.getPropertyValue("display")).toBe("");
    expect(nativeLevel.hasAttribute("aria-hidden")).toBe(false);
  });

  it("keeps the native level when its verified label does not match the player", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const nativeLevel = document.querySelector<SVGSVGElement>(
      '[class*="Roster__Group-sc-left"] [class*="SkillIcon__StyledSvg-sc-"]',
    ) as SVGSVGElement;
    const title = nativeLevel.querySelector("title") as Element;
    title.textContent = "Skill level 9";
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    expect(nativeLevel.style.getPropertyValue("display")).toBe("");
    expect(batteryHosts()).toHaveLength(10);
  });

  it("does not reveal a native level that FACEIT hid for the current layout", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const nativeLevel = document.querySelector<SVGSVGElement>(
      '[class*="Roster__Group-sc-left"] [class*="SkillIcon__StyledSvg-sc-"]',
    ) as SVGSVGElement;
    nativeLevel.style.display = "none";
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`)).toBeNull();
    expect(nativeLevel.style.display).toBe("none");
    expect(batteryHosts()).toHaveLength(10);
  });

  it("does not substitute the selected-window count when lifetime map stats are unavailable", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), new Map(), settings);
    const overall = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)
      ?.shadowRoot?.querySelector('[data-es-stat="overall"]');

    expect(overall?.textContent).toContain("—матчи");
    expect(overall?.textContent).not.toContain("4матчи");
  });

  it("ignores hidden responsive and visible empty or foreign third rosters", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    const responsiveShell = document.createElement("div");
    responsiveShell.hidden = true;
    const responsiveCopy = document.createElement("section");
    responsiveCopy.className = "Roster__Group-sc-responsive";
    responsiveShell.append(responsiveCopy);
    document.body.append(responsiveShell);

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({ status: "rendered", players: 10 });
    responsiveShell.hidden = false;
    responsiveCopy.innerHTML = '<div class="unrelated-widget">Server and map details</div>';

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
    expect(roleHosts()).toHaveLength(10);
  });

  it("renders all players when FACEIT splits each team across mixed premade containers", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    applyMixedPremadeLayout();
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    const holderParents = new Set(
      Array.from(document.querySelectorAll<HTMLElement>('[class*="Roster__Group-sc-left"] [class*="styles__Holder"]'))
        .map((holder) => holder.parentElement),
    );
    expect(holderParents.size).toBeGreaterThan(1);
    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
      teams: 2,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
    expect(roleHosts()).toHaveLength(10);
    expect(document.querySelector(`[${INLINE_TIER_ATTRIBUTE}="alpha-one"]`)).not.toBeNull();
    for (const holder of Array.from(document.querySelectorAll<HTMLElement>('[class*="styles__Holder"]'))) {
      expect(holder.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}]`)).toHaveLength(1);
    }
  });

  it("keeps the same-match enhancements mounted when React regroups players into premades", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    const originalHosts = new Map(playerHosts().map((host) => [
      host.getAttribute(INLINE_PLAYER_ATTRIBUTE),
      host,
    ]));

    applyMixedPremadeLayout();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    for (const host of playerHosts()) {
      expect(originalHosts.get(host.getAttribute(INLINE_PLAYER_ATTRIBUTE))).toBe(host);
      expect(host.parentElement?.matches('[class*="styles__Holder"]')).toBe(true);
    }
  });

  it("fails closed and removes stale stats when a full visible team roster is duplicated", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), playerMapRows(match), settings);
    expect(playerHosts()).toHaveLength(10);

    const alphaRoster = document.querySelector<HTMLElement>('[class*="Roster__Group-sc-left"]') as HTMLElement;
    const duplicate = alphaRoster.cloneNode(true) as HTMLElement;
    duplicate.className = "Roster__Group-sc-visible-copy";
    duplicate.querySelectorAll(
      `[${INLINE_PLAYER_ATTRIBUTE}], [${INLINE_BATTERY_ATTRIBUTE}], [${INLINE_TIER_ATTRIBUTE}], [${INLINE_ROLE_ATTRIBUTE}]`,
    ).forEach((host) => host.remove());
    document.body.append(duplicate);

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "team-roster-ambiguous",
    });
    expect(playerHosts()).toHaveLength(0);
    expect(teamHosts()).toHaveLength(0);
    expect(batteryHosts()).toHaveLength(0);
    expect(tierHosts()).toHaveLength(0);
    expect(roleHosts()).toHaveLength(0);
    const nativeAvatar = document.querySelector<HTMLImageElement>('[data-avatar-for="AlphaOne"]') as HTMLImageElement;
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(nativeAvatar.hasAttribute("aria-hidden")).toBe(false);
  });

  it("ignores a hidden duplicate nickname inside a verified player card", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const duplicate = document.createElement("span");
    duplicate.className = "Nickname__Name-sc-hidden-copy";
    duplicate.hidden = true;
    duplicate.textContent = "AlphaOne";
    document.querySelector('[data-avatar-for="AlphaOne"]')
      ?.closest('[class*="ListContentPlayer__Background"]')
      ?.append(duplicate);
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(document.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).toHaveLength(1);
  });

  it("supports a profile-link wrapper and structural player rows after holder class drift", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    for (const holder of Array.from(document.querySelectorAll<HTMLElement>('[class*="styles__Holder"]'))) {
      const card = Array.from(holder.children).find((child): child is HTMLElement =>
        child instanceof HTMLElement && child.matches('[class*="ListContentPlayer__Background"]'));
      const nicknameLink = card?.querySelector<HTMLAnchorElement>('a[href*="/players/"]');
      if (!card || !nicknameLink) throw new Error("fixture player card is incomplete");
      const wrapper = document.createElement("a");
      wrapper.className = "PlayerCardLink__Wrapper-sc-drift";
      wrapper.href = nicknameLink.href;
      card.replaceWith(wrapper);
      wrapper.append(card);
      holder.className = "PlayerRow__Shell-drift";
    }
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    const alphaHost = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const wrapper = alphaHost.previousElementSibling as HTMLElement;
    expect(wrapper.matches("a.PlayerCardLink__Wrapper-sc-drift")).toBe(true);
    expect(wrapper.querySelector('[class*="ListContentPlayer__Background"]')).not.toBeNull();
    expect(alphaHost.parentElement?.matches(".PlayerRow__Shell-drift")).toBe(true);
  });

  it("uses the verified profile href when the displayed nickname is stale", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const nicknameLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/players/"]'));
    nicknameLinks.forEach((link, index) => {
      link.textContent = `stale-player-${index + 1}`;
    });
    (nicknameLinks[0] as HTMLAnchorElement).href = "https://www.faceit.com/en-US/players/AlphaOne/cs2";
    (nicknameLinks[1] as HTMLAnchorElement).href = "https://faceit.com/ru/players/AlphaTwo/";
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).not.toBeNull();
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="bravo-five"]`)).not.toBeNull();
  });

  it.each([
    "https://evil.faceit.com/en/players/AlphaOne",
    "https://www.faceit.com:444/en/players/AlphaOne",
    "//evil.test/en/players/AlphaOne",
  ])("rejects an unverified profile origin instead of guessing the player: %s", (href) => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const link = document.querySelector<HTMLAnchorElement>('a[href="/en/players/AlphaOne"]') as HTMLAnchorElement;
    link.href = href;
    link.textContent = "stale-alpha";
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "incompatible",
    });
    expect(playerHosts()).toHaveLength(0);
  });

  it("discovers semantic roster1 and roster2 anchors after roster class drift", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const rosters = Array.from(document.querySelectorAll<HTMLElement>('[class*="Roster__Group"]'));
    expect(rosters).toHaveLength(2);
    (rosters[0] as HTMLElement).className = "FaceitTeamColumn-sc-drift-left";
    (rosters[0] as HTMLElement).setAttribute("name", "roster1");
    (rosters[1] as HTMLElement).className = "FaceitTeamColumn-sc-drift-right";
    (rosters[1] as HTMLElement).setAttribute("name", "roster2");
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(document.querySelectorAll('[name="roster1"] [data-eloscope-inline-player]')).toHaveLength(5);
    expect(document.querySelectorAll('[name="roster2"] [data-eloscope-inline-player]')).toHaveLength(5);
  });

  it("deduplicates nested semantic and class roster roots by their five verified player rows", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const rosters = Array.from(document.querySelectorAll<HTMLElement>('[class*="Roster__Group"]'));
    rosters.forEach((roster, index) => {
      const semantic = document.createElement("div");
      semantic.setAttribute("name", index === 0 ? "roster1" : "roster2");
      roster.replaceWith(semantic);
      semantic.append(roster);
    });
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
  });

  it("keeps complete class rosters when unrelated semantic roster markers are partial", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const partialLeft = document.createElement("div");
    partialLeft.setAttribute("name", "roster1");
    partialLeft.innerHTML = nativePlayer("UnrelatedOne");
    const partialRight = document.createElement("div");
    partialRight.setAttribute("name", "roster2");
    partialRight.innerHTML = nativePlayer("UnrelatedTwo");
    document.body.append(partialLeft, partialRight);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
  });

  it("renders the ten visible cards when an API team also contains a reserve player", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const mapAnchor = document.createElement("div");
    mapAnchor.innerHTML = `
      <span data-testid="selected-map" data-map-id="dust2" data-eloscope-visible="true">dust2</span>
      <a
        data-testid="connect-to-server"
        data-eloscope-visible="true"
        href="steam://connect/127.0.0.1:27015"
      >Connect</a>
    `;
    document.body.prepend(mapAnchor);
    const base = matchContext();
    const alpha = base.teams[0] as MatchContext["teams"][number];
    const match = matchContext({
      teams: [
        {
          ...alpha,
          players: [
            ...alpha.players,
            { id: "alpha-reserve", nickname: "AlphaReserve", game: "cs2", elo: 2_275, officialLevel: 10 },
          ],
        },
        base.teams[1] as MatchContext["teams"][number],
      ],
    });
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toMatchObject({
      status: "rendered",
      players: 10,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-reserve"]`)).toBeNull();
    const chart = document.querySelector<HTMLElement>(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`)?.shadowRoot;
    expect(chart?.querySelector('[data-es-team-id="team-alpha"]')?.textContent).toContain("5/5");
    expect(chart?.textContent).not.toContain("6/6");
  });

  it("calculates map win rates from the dedicated recent-match window instead of lifetime rows", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const mapAnchor = document.createElement("div");
    mapAnchor.innerHTML = `
      <span data-testid="selected-map" data-map-id="dust2" data-eloscope-visible="true">dust2</span>
      <a
        data-testid="connect-to-server"
        data-eloscope-visible="true"
        href="steam://connect/127.0.0.1:27015"
      >Connect</a>
    `;
    document.body.prepend(mapAnchor);
    const match = matchContext();
    const now = Date.now();
    const rows = new Map(match.teams.flatMap((team) => team.players.map((player) => [
      player.id,
      Array.from({ length: 30 }, (_, index): PlayerMatch => ({
        id: `${player.id}-map-window-${index}`,
        playerId: player.id,
        game: "cs2",
        mode: "5v5",
        status: "finished",
        finishedAt: now - index * 60_000,
        result: index < 5 ? "win" : "loss",
        map: "de_dust2",
        roundsPlayed: 20,
        kills: 15,
        assists: 4,
        deaths: 12,
        damage: 1_600,
      })),
    ] as const)));
    const renderer = new InlineMatchRenderer();

    renderer.render(match, rows, playerMapRows(match), settings);
    const chart = document.querySelector<HTMLElement>(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`)?.shadowRoot;
    expect(chart?.querySelector('[data-es-team-id="team-alpha"] .wr')?.textContent).toBe("16.7%");
    expect(chart?.textContent).toContain("30");

    renderer.render(match, rows, playerMapRows(match), { ...settings, mapWinRateWindow: 5 });
    expect(chart?.querySelector('[data-es-team-id="team-alpha"] .wr')?.textContent).toBe("100.0%");
    expect(chart?.textContent).toContain("5");
  });

  it("does not mount on an incomplete native roster contract", () => {
    document.body.innerHTML = `
      <section class="Roster__Group-only">${nativePlayer("AlphaOne")}${nativePlayer("AlphaTwo")}</section>
    `;
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
    });
    expect(playerHosts()).toHaveLength(0);
    expect(roleHosts()).toHaveLength(0);
  });

  it("cleans up every owned player and team host on destroy", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), playerMapRows(match), settings);
    const nativeLevel = document.querySelector<SVGSVGElement>(
      '[class*="Roster__Group-sc-left"] [class*="SkillIcon__StyledSvg-sc-"]',
    ) as SVGSVGElement;
    const nativeAvatar = document.querySelector<HTMLImageElement>('[data-avatar-for="AlphaOne"]') as HTMLImageElement;
    expect(nativeLevel.style.getPropertyValue("display")).toBe("none");
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("none");
    renderer.destroy();
    expect(playerHosts()).toHaveLength(0);
    expect(teamHosts()).toHaveLength(0);
    expect(batteryHosts()).toHaveLength(0);
    expect(tierHosts()).toHaveLength(0);
    expect(roleHosts()).toHaveLength(0);
    expect(nativeLevel.style.getPropertyValue("display")).toBe("");
    expect(nativeLevel.hasAttribute("aria-hidden")).toBe(false);
    expect(nativeAvatar.style.getPropertyValue("display")).toBe("");
    expect(nativeAvatar.hasAttribute("aria-hidden")).toBe(false);
  });
});
