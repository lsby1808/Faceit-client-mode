import {
  getEloTierPresentation,
  type MatchContext,
  type PlayerMapStats,
  type PlayerMatch,
} from "@eloscope/core";
import { describe, expect, it } from "vitest";

import {
  INLINE_BATTERY_ATTRIBUTE,
  INLINE_PLAYER_ATTRIBUTE,
  INLINE_ROLE_ATTRIBUTE,
  INLINE_TEAM_ATTRIBUTE,
  INLINE_TIER_ATTRIBUTE,
  InlineMatchRenderer,
  type InlineMatchSettings,
} from "../src/inline-match";

const settings: InlineMatchSettings = {
  statsWindow: 30,
  showExtendedTier: true,
  showPlayerRoles: true,
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

const LEFT_PLAYERS = ["AlphaOne", "AlphaTwo", "AlphaThree", "AlphaFour", "AlphaFive"] as const;
const RIGHT_PLAYERS = ["BravoOne", "BravoTwo", "BravoThree", "BravoFour", "BravoFive"] as const;
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

function tierHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_TIER_ATTRIBUTE}]`));
}

function roleHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_ROLE_ATTRIBUTE}]`));
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
      updated: 34,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(teamHosts()).toHaveLength(2);

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
    expect(leftTeamHost?.shadowRoot?.textContent).toContain("AVG ELO 2223 · 5");
    expect(rightTeamHost?.shadowRoot?.textContent).toContain("AVG ELO 1866 · 5");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("Alpha");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("coverage");
    expect(leftTeamHost?.shadowRoot?.textContent).not.toContain("2000–2511");
    expect(document.querySelectorAll(`[class*="Roster__Group-sc-"] [${INLINE_TEAM_ATTRIBUTE}]`)).toHaveLength(0);
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

  it("maps compact header metrics by exact team name even when native sides are reversed", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS, ["Bravo", "Alpha"]);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    renderer.render(match, matchRows(match), playerMapRows(match), settings);

    const alpha = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`);
    const bravo = document.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-bravo"]`);
    expect(alpha?.getAttribute("data-eloscope-team-side")).toBe("right");
    expect(bravo?.getAttribute("data-eloscope-team-side")).toBe("left");
    expect(alpha?.shadowRoot?.textContent).toContain("AVG ELO 2223 · 5");
    expect(bravo?.shadowRoot?.textContent).toContain("AVG ELO 1866 · 5");
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
    expect(alphaMetric?.shadowRoot?.textContent).toContain("AVG ELO 2339 · 3");
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

    expect(renderer.render(match, rows, maps, settings)).toMatchObject({ status: "rendered", updated: 4 });
    expect(document.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}]`)).toHaveLength(10);
    expect(batteryHosts()).toHaveLength(10);
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

  it("ignores a hidden responsive roster but fails closed when a third roster becomes rendered", () => {
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

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
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

  it("fails closed and removes stale stats when a nickname becomes ambiguous", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), playerMapRows(match), settings);
    expect(playerHosts()).toHaveLength(10);

    const duplicate = document.createElement("span");
    duplicate.className = "Nickname__Name-sc-duplicate";
    duplicate.textContent = "AlphaOne";
    document.querySelector('[class*="Roster__Group-sc-left"]')?.append(duplicate);

    expect(renderer.render(match, matchRows(match), playerMapRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
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
