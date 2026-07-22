import type { MatchContext, PlayerMatch } from "@eloscope/core";
import { describe, expect, it } from "vitest";

import {
  INLINE_PLAYER_ATTRIBUTE,
  INLINE_TEAM_ATTRIBUTE,
  InlineMatchRenderer,
  type InlineMatchSettings,
} from "../src/inline-match";

const settings: InlineMatchSettings = {
  statsWindow: 30,
  showExtendedTier: true,
};

function nativePlayer(nickname: string): string {
  return `
    <div class="styles__Holder-sc-fixture-1">
      <article class="ListContentPlayer__Background-sc-fixture-0">
        <a class="Nickname__Name-sc-fixture-1" href="/en/players/${encodeURIComponent(nickname)}">${nickname}</a>
      </article>
    </div>
  `;
}

function mountNativeRoom(left: readonly string[], right: readonly string[]): void {
  document.body.innerHTML = `
    <main>
      <section class="Roster__Group-sc-left"><div class="team-list">${left.map(nativePlayer).join("")}</div></section>
      <aside>server and map</aside>
      <section class="Roster__Group-sc-right"><div class="team-list">${right.map(nativePlayer).join("")}</div></section>
    </main>
  `;
}

const LEFT_PLAYERS = ["AlphaOne", "AlphaTwo", "AlphaThree", "AlphaFour", "AlphaFive"] as const;
const RIGHT_PLAYERS = ["BravoOne", "BravoTwo", "BravoThree", "BravoFour", "BravoFive"] as const;

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
  return [0, 1, 8, 12].map((daysAgo, index) => ({
    id: `${playerId}-match-${index}`,
    playerId,
    game: "cs2",
    mode: "5v5",
    status: "finished",
    finishedAt: now - daysAgo * 24 * 60 * 60 * 1_000,
    result: index === 2 ? "loss" as const : "win" as const,
    map,
    roundsPlayed: 24,
    kills: 18 + index,
    assists: 5,
    deaths: 14,
    damage: 1_920 + index * 48,
    headshots: 9,
  }));
}

function matchRows(match: MatchContext): ReadonlyMap<string, PlayerMatch[]> {
  return new Map(match.teams.flatMap((team) => team.players.map((player) => [player.id, playerMatches(player.id)] as const)));
}

function playerHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}]`));
}

function teamHosts(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}]`));
}

describe("InlineMatchRenderer", () => {
  it("mounts selected-map, aggregate, battery and extended-tier stats directly under every native card", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();

    expect(renderer.render(match, matchRows(match), settings)).toEqual({
      status: "rendered",
      players: 10,
      teams: 2,
      updated: 12,
    });
    expect(playerHosts()).toHaveLength(10);
    expect(teamHosts()).toHaveLength(2);

    const alphaHost = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`);
    const nativeCard = alphaHost?.previousElementSibling;
    expect(nativeCard?.matches('[class*="ListContentPlayer__Background-sc-"]')).toBe(true);
    expect(alphaHost?.parentElement?.matches('[class*="styles__Holder-sc-"]')).toBe(true);
    expect(alphaHost?.shadowRoot?.querySelector('[data-es-stat="selected-map"]')?.textContent).toContain("dust2");
    expect(alphaHost?.shadowRoot?.querySelector('[data-es-stat="overall"]')?.textContent).toContain("K/A/D");
    expect(alphaHost?.shadowRoot?.querySelector("[data-es-form-battery]")).not.toBeNull();
    expect(alphaHost?.shadowRoot?.querySelector("[data-es-tier]")?.textContent).toBe("12");

    const leftRoster = document.querySelector<HTMLElement>('[class*="Roster__Group-sc-left"]');
    const leftTeamHost = leftRoster?.querySelector<HTMLElement>(`[${INLINE_TEAM_ATTRIBUTE}="team-alpha"]`);
    const firstHolder = leftRoster?.querySelector<HTMLElement>('[class*="styles__Holder-sc-"]');
    expect(leftTeamHost?.nextElementSibling).toBe(firstHolder);
    expect(leftTeamHost?.shadowRoot?.textContent).toContain("AVG 2223");
    expect(leftTeamHost?.shadowRoot?.textContent).toContain("2000–2511");
  });

  it("keeps unchanged hosts intact and only rerenders signatures that changed", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, settings);
    const host = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const originalCard = host.shadowRoot?.querySelector(".card");

    expect(renderer.render(match, rows, settings)).toMatchObject({ status: "rendered", updated: 0 });
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).toBe(host);
    expect(host.shadowRoot?.querySelector(".card")).toBe(originalCard);

    const updatedMatch = { ...match, selectedMap: "mirage" };
    expect(renderer.render(updatedMatch, rows, settings)).toMatchObject({ status: "rendered", updated: 10 });
    expect(host.shadowRoot?.querySelector('[data-es-stat="selected-map"]')?.textContent).toContain("mirage");
    expect(host.shadowRoot?.querySelector('[data-es-stat="selected-map"]')?.textContent).toContain("нет матчей");
  });

  it("repairs a detached player host after a native React card rerender", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const rows = matchRows(match);
    const renderer = new InlineMatchRenderer();
    renderer.render(match, rows, settings);
    const originalAlpha = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`) as HTMLElement;
    const originalBravo = document.querySelector<HTMLElement>(`[${INLINE_PLAYER_ATTRIBUTE}="bravo-one"]`) as HTMLElement;
    const originalHolder = originalAlpha.parentElement as HTMLElement;
    const template = document.createElement("template");
    template.innerHTML = nativePlayer("AlphaOne");
    const replacementHolder = template.content.firstElementChild as HTMLElement;

    originalHolder.replaceWith(replacementHolder);

    expect(renderer.render(match, rows, settings)).toMatchObject({ status: "rendered", updated: 1 });
    expect(document.querySelectorAll(`[${INLINE_PLAYER_ATTRIBUTE}]`)).toHaveLength(10);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="alpha-one"]`)).not.toBe(originalAlpha);
    expect(document.querySelector(`[${INLINE_PLAYER_ATTRIBUTE}="bravo-one"]`)).toBe(originalBravo);
    expect(replacementHolder.lastElementChild?.getAttribute(INLINE_PLAYER_ATTRIBUTE)).toBe("alpha-one");
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

    expect(renderer.render(match, matchRows(match), settings)).toMatchObject({ status: "rendered", players: 10 });
    responsiveShell.hidden = false;

    expect(renderer.render(match, matchRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
    });
    expect(playerHosts()).toHaveLength(0);
    expect(teamHosts()).toHaveLength(0);
  });

  it("fails closed and removes stale stats when a nickname becomes ambiguous", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), settings);
    expect(playerHosts()).toHaveLength(10);

    const duplicate = document.createElement("span");
    duplicate.className = "Nickname__Name-sc-duplicate";
    duplicate.textContent = "AlphaOne";
    document.querySelector('[class*="Roster__Group-sc-left"]')?.append(duplicate);

    expect(renderer.render(match, matchRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
    });
    expect(playerHosts()).toHaveLength(0);
    expect(teamHosts()).toHaveLength(0);
  });

  it("does not mount on an incomplete native roster contract", () => {
    document.body.innerHTML = `
      <section class="Roster__Group-only">${nativePlayer("AlphaOne")}${nativePlayer("AlphaTwo")}</section>
    `;
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    expect(renderer.render(match, matchRows(match), settings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
    });
    expect(playerHosts()).toHaveLength(0);
  });

  it("cleans up every owned player and team host on destroy", () => {
    mountNativeRoom(LEFT_PLAYERS, RIGHT_PLAYERS);
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    renderer.render(match, matchRows(match), settings);
    renderer.destroy();
    expect(playerHosts()).toHaveLength(0);
    expect(teamHosts()).toHaveLength(0);
  });
});
