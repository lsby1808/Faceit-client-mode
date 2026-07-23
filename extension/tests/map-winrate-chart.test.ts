import type { MatchContext, PlayerMapStats } from "@eloscope/core";
import { describe, expect, it } from "vitest";

import { InlineMatchRenderer } from "../src/inline-match";
import {
  INLINE_MAP_WINRATE_ATTRIBUTE,
  INLINE_SELECTED_MAP_WINS_ATTRIBUTE,
  MatchMapWinRateChartRenderer,
} from "../src/map-winrate-chart";

const player = (team: "left" | "right", index: number) => ({
  id: `${team}-${index}`,
  nickname: `${team}${index}`,
  game: "cs2" as const,
});

function matchContext(overrides: Partial<MatchContext> = {}): MatchContext {
  return {
    id: "map-chart-match",
    game: "cs2",
    status: "ongoing",
    selectedMap: "de_dust2",
    mapPool: ["mirage", "dust2", "inferno"],
    teams: [
      { id: "left", name: "Alpha", players: Array.from({ length: 5 }, (_, index) => player("left", index)) },
      { id: "right", name: "Bravo", players: Array.from({ length: 5 }, (_, index) => player("right", index)) },
    ],
    ...overrides,
  };
}

function row(map: string, matches: number, wins: number): PlayerMapStats {
  return {
    map,
    matches,
    wins,
    kills: matches * 18,
    assists: matches * 4,
    deaths: matches * 15,
    roundsPlayed: matches * 24,
    damage: matches * 1_900,
  };
}

function mapRows(match: MatchContext): ReadonlyMap<string, PlayerMapStats[]> {
  const rows = new Map<string, PlayerMapStats[]>();
  for (const member of match.teams[0]?.players ?? []) {
    rows.set(member.id, [row("dust2", 10, 6), row("mirage", 8, 4)]);
  }
  for (const member of match.teams[1]?.players ?? []) {
    rows.set(member.id, [row("de_dust2", 20, 8)]);
  }
  return rows;
}

function mountExplicit(map = "dust2"): HTMLElement {
  document.body.innerHTML = `
    <main id="center">
      <div id="selected" data-testid="selected-map" data-map-id="${map}" data-eloscope-visible="true">${map}</div>
      <a
        id="native-action"
        data-testid="connect-to-server"
        data-eloscope-visible="true"
        href="steam://connect/127.0.0.1:27015"
      >Connect to server</a>
    </main>
  `;
  return document.querySelector<HTMLElement>("#selected") as HTMLElement;
}

function chartHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`);
}

function selectedWinsHost(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`);
}

function selectedWinsSummary(): HTMLElement {
  const summary = selectedWinsHost()?.shadowRoot?.querySelector<HTMLElement>("[data-es-selected-map-wins]");
  expect(summary).toBeInstanceOf(HTMLElement);
  return summary as HTMLElement;
}

describe("MatchMapWinRateChartRenderer", () => {
  it("mounts after the native connect CTA and renders selected-first weighted team comparisons", () => {
    const selected = mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match), undefined, 30)).toEqual({ status: "rendered", updated: 1 });
    const host = chartHost();
    const nativeAction = document.querySelector("#native-action");
    expect(selected.nextElementSibling).toBe(nativeAction);
    expect(selected.lastElementChild).toBe(selectedWinsHost());
    expect(nativeAction?.nextElementSibling).toBe(host);
    expect(host?.getAttribute(INLINE_MAP_WINRATE_ATTRIBUTE)).toBe(match.id);

    const chart = host?.shadowRoot?.querySelector<HTMLElement>("[data-es-map-winrates]");
    expect(chart?.querySelector(".footnote")?.textContent).toContain("последним 30 матчам");
    const winsSummary = selectedWinsSummary();
    expect(winsSummary.dataset.esSelectedMapWins).toBe("dust2");
    expect(winsSummary.querySelector<HTMLElement>('[data-es-wins-team-id="left"] .wins-label')?.textContent)
      .toBe("Alpha");
    expect(winsSummary.querySelector<HTMLElement>('[data-es-wins-team-id="left"] .wins-value')?.textContent)
      .toContain("30");
    expect(winsSummary.querySelector<HTMLElement>('[data-es-wins-team-id="right"] .wins-label')?.textContent)
      .toBe("Bravo");
    expect(winsSummary.querySelector<HTMLElement>('[data-es-wins-team-id="right"] .wins-value')?.textContent)
      .toContain("40");
    const mapRowsNodes = Array.from(chart?.querySelectorAll<HTMLElement>("[data-es-map-row]") ?? []);
    expect(mapRowsNodes.map((entry) => entry.dataset.esMapRow)).toEqual(["dust2", "mirage", "inferno"]);
    expect(mapRowsNodes[0]?.dataset.selected).toBe("true");

    const dust2 = mapRowsNodes[0] as HTMLElement;
    const left = dust2.querySelector<HTMLElement>('[data-es-team-id="left"]');
    const right = dust2.querySelector<HTMLElement>('[data-es-team-id="right"]');
    expect(left?.textContent).toContain("60.0%");
    expect(left?.textContent).toContain("50 матчей · 5/5");
    expect(right?.textContent).toContain("40.0%");
    expect(right?.textContent).toContain("100 матчей · 5/5");
    expect(dust2.querySelector<HTMLElement>('[data-es-advantage]')?.textContent).toBe("← +20.0 п.п.");
    expect(dust2.querySelector<HTMLElement>('[data-es-advantage]')?.title).toBe("Alpha: преимущество 20.0 п.п.");
    expect(dust2.querySelector<HTMLElement>('.track.left .fill')?.style.width).toBe("60%");
    expect(dust2.querySelector<HTMLElement>('.track.right .fill')?.style.width).toBe("40%");

    const mirage = mapRowsNodes[1] as HTMLElement;
    expect(mirage.querySelector<HTMLElement>('[data-es-team-id="left"]')?.textContent).toContain("50.0%");
    expect(mirage.querySelector<HTMLElement>('[data-es-team-id="right"]')?.textContent).toContain("— матчей · 0/5");
    expect(mirage.querySelector<HTMLElement>('[data-es-advantage]')?.textContent)
      .toBe("—");
    expect(mirage.querySelector<HTMLElement>('[data-es-advantage]')?.title)
      .toBe("Недостаточно данных для сравнения");
    expect(mirage.querySelector<HTMLElement>('.track.right .fill')?.hidden).toBe(true);
  });

  it("orders the selected-map totals from the viewer's team perspective", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match), "right")).toEqual({ status: "rendered", updated: 1 });
    const summary = selectedWinsSummary();
    const teams = Array.from(summary.querySelectorAll<HTMLElement>("[data-es-wins-team-id]"));
    expect(teams.map((team) => team.dataset.esWinsTeamId)).toEqual(["right", "left"]);
    expect(teams.map((team) => team.querySelector(".wins-label")?.textContent)).toEqual([
      "Наша команда",
      "Соперники",
    ]);
    expect(teams[0]?.querySelector(".wins-value")?.textContent).toContain("40");
    expect(teams[1]?.querySelector(".wins-value")?.textContent).toContain("30");

    const headers = Array.from(
      chartHost()?.shadowRoot?.querySelectorAll<HTMLElement>(".header .team") ?? [],
    );
    expect(headers.map(({ textContent }) => textContent)).toEqual(["Bravo", "Alpha"]);
    const selectedRowTeams = Array.from(
      chartHost()?.shadowRoot?.querySelectorAll<HTMLElement>(
        '[data-es-map-row="dust2"] [data-es-team-id]',
      ) ?? [],
    );
    expect(selectedRowTeams.map((team) => team.dataset.esTeamId)).toEqual(["right", "left"]);
  });

  it("does not present a partial total when only four of five players have map data", () => {
    mountExplicit();
    const match = matchContext();
    const incompleteRows = new Map(mapRows(match));
    incompleteRows.delete("left-4");
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, incompleteRows)).toEqual({ status: "rendered", updated: 1 });
    const summary = selectedWinsSummary();
    const left = summary.querySelector<HTMLElement>('[data-es-wins-team-id="left"]');
    const right = summary.querySelector<HTMLElement>('[data-es-wins-team-id="right"]');
    expect(left?.dataset.status).toBe("unavailable");
    expect(left?.querySelector(".wins-value")?.textContent).toContain("—");
    expect(left?.querySelector(".wins-value")?.textContent).not.toContain("24");
    expect(left?.title).toContain("4/5");
    expect(right?.dataset.status).toBe("ready");
    expect(right?.querySelector(".wins-value")?.textContent).toContain("40");
  });

  it("updates the in-card totals when FACEIT selects another map", () => {
    const selected = mountExplicit();
    const match = matchContext();
    const rows = new Map(mapRows(match));
    for (const member of match.teams[1]?.players ?? []) {
      rows.set(member.id, [...(rows.get(member.id) ?? []), row("mirage", 10, 7)]);
    }
    const renderer = new MatchMapWinRateChartRenderer();
    renderer.render(match, rows);
    const host = selectedWinsHost();

    selected.dataset.mapId = "mirage";
    expect(renderer.render({ ...match, selectedMap: "mirage" }, rows)).toEqual({
      status: "rendered",
      updated: 1,
    });
    expect(selectedWinsHost()).toBe(host);
    const summary = selectedWinsSummary();
    expect(summary.dataset.esSelectedMapWins).toBe("mirage");
    expect(summary.querySelector('[data-es-wins-team-id="left"] .wins-value')?.textContent).toContain("20");
    expect(summary.querySelector('[data-es-wins-team-id="right"] .wins-value')?.textContent).toContain("35");
    const mapRowsNodes = Array.from(
      chartHost()?.shadowRoot?.querySelectorAll<HTMLElement>("[data-es-map-row]") ?? [],
    );
    expect(mapRowsNodes[0]?.dataset.esMapRow).toBe("mirage");
  });

  it("mounts after the native back-to-matchmaking CTA in the validated finished container", () => {
    document.body.innerHTML = `
      <div class="Finished__Container-sc-live">
        <section class="Finished__Section-sc-live">
          <div class="Preferences__Container-sc-live" id="preferences">
            <div><span data-testid="mapsVetoHistory">Veto</span></div>
            <div data-testid="matchPreference">Dust2</div>
          </div>
        </section>
        <button id="demo">Demo</button>
        <div id="native-actions">
          <a
            id="native-action"
            data-testid="back-to-matchmaking"
            data-eloscope-visible="true"
            href="/en/matchmaking/cs2"
          >Back to matchmaking</a>
        </div>
      </div>
    `;
    const match = matchContext({ status: "finished" });
    const renderer = new MatchMapWinRateChartRenderer();
    expect(renderer.render(match, mapRows(match)).status).toBe("rendered");

    const nativeAction = document.querySelector("#native-action");
    const nativeActions = document.querySelector("#native-actions");
    const host = chartHost();
    expect(nativeAction?.parentElement).toBe(nativeActions);
    expect(nativeActions?.nextElementSibling).toBe(host);
    expect(document.querySelector('[data-testid="matchPreference"]')?.lastElementChild).toBe(selectedWinsHost());
    expect(host?.parentElement?.matches('[class*="Finished__Container"]')).toBe(true);
    expect(document.querySelector("#demo")?.nextElementSibling).toBe(nativeActions);
  });

  it("ignores a hidden native CTA clone when one visible CTA matches the selected-map container", () => {
    const selected = mountExplicit();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<aside hidden>
        <a data-testid="connect-to-server" href="steam://connect/127.0.0.2:27015">Hidden clone</a>
      </aside>`,
    );
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(document.querySelector("#native-action")?.nextElementSibling).toBe(chartHost());
    expect(selected.lastElementChild).toBe(selectedWinsHost());
  });

  it("fails closed when more than one matching native CTA is visible", () => {
    mountExplicit();
    document.querySelector("#center")?.insertAdjacentHTML(
      "beforeend",
      `<a
        id="native-action-duplicate"
        data-testid="connect-to-server"
        data-eloscope-visible="true"
        href="steam://connect/127.0.0.2:27015"
      >Duplicate connect</a>`,
    );
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "incompatible", updated: 0 });
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();
  });

  it("ignores non-rendered native CTA clones with opacity zero or no layout box", () => {
    const selected = mountExplicit();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<aside>
        <a
          data-testid="connect-to-server"
          href="steam://connect/127.0.0.2:27015"
          style="opacity: 0"
        >Transparent clone</a>
        <a
          data-testid="connect-to-server"
          href="steam://connect/127.0.0.3:27015"
        >Zero-size fixture clone</a>
      </aside>`,
    );
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(document.querySelector("#native-action")?.nextElementSibling).toBe(chartHost());
    expect(selected.lastElementChild).toBe(selectedWinsHost());
  });

  it("fails closed for an explicit selected-map contract under a broad root container", () => {
    document.body.innerHTML = `
      <div data-testid="selected-map" data-map-id="dust2" data-eloscope-visible="true">dust2</div>
      <a
        data-testid="connect-to-server"
        data-eloscope-visible="true"
        href="steam://connect/127.0.0.1:27015"
      >Connect elsewhere</a>
    `;
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "incompatible", updated: 0 });
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();
  });

  it("fails closed when the native CTA is outside the selected-map container", () => {
    mountExplicit();
    const action = document.querySelector("#native-action");
    document.body.insertAdjacentHTML("beforeend", '<aside id="wrong-container"></aside>');
    document.querySelector("#wrong-container")?.append(action as Element);
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "incompatible", updated: 0 });
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();
  });

  it("fails closed on map mismatch or more than one visible selected-map candidate", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();
    expect(renderer.render(match, mapRows(match)).status).toBe("rendered");

    (document.querySelector("#selected") as HTMLElement).dataset.mapId = "mirage";
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "incompatible", updated: 1 });
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();

    (document.querySelector("#selected") as HTMLElement).dataset.mapId = "dust2";
    document.querySelector("#center")?.insertAdjacentHTML(
      "beforeend",
      '<div data-eloscope-contract="selected-map" data-map-id="dust2">Dust2</div>',
    );
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "incompatible", updated: 0 });
    expect(chartHost()).toBeNull();
  });

  it("rebinds after a FACEIT preference rerender and removes orphan hosts", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();
    renderer.render(match, mapRows(match));
    const originalHost = chartHost();

    document.querySelector("#selected")?.remove();
    document.querySelector("#center")?.insertAdjacentHTML(
      "afterbegin",
      '<div id="selected-2" data-testid="selected-map" data-map-id="dust2">Dust2</div>',
    );
    const orphan = document.createElement("div");
    orphan.setAttribute(INLINE_MAP_WINRATE_ATTRIBUTE, "orphan");
    document.body.append(orphan);

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(chartHost()).not.toBe(originalHost);
    expect(document.querySelectorAll(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelectorAll(`[${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelector("#native-action")?.nextElementSibling).toBe(chartHost());
    expect(document.querySelector("#selected-2")?.lastElementChild).toBe(selectedWinsHost());
  });

  it("remounts after React replaces the native CTA and keeps the chart directly below it", () => {
    const selected = mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    const originalHost = chartHost();
    const originalWinsHost = selectedWinsHost();

    const replacement = document.createElement("a");
    replacement.id = "native-action-replacement";
    replacement.dataset.testid = "connect-to-server";
    replacement.dataset.eloscopeVisible = "true";
    replacement.href = "steam://connect/127.0.0.3:27015";
    replacement.textContent = "Connect after React render";
    document.querySelector("#native-action")?.replaceWith(replacement);

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(chartHost()).not.toBe(originalHost);
    expect(selectedWinsHost()).not.toBe(originalWinsHost);
    expect(replacement.nextElementSibling).toBe(chartHost());
    expect(selected.lastElementChild).toBe(selectedWinsHost());
    expect(document.querySelectorAll(`[${INLINE_MAP_WINRATE_ATTRIBUTE}]`)).toHaveLength(1);
    expect(document.querySelectorAll(`[${INLINE_SELECTED_MAP_WINS_ATTRIBUTE}]`)).toHaveLength(1);
  });

  it("ignores hidden responsive clones and preserves the same host for unchanged data", () => {
    const selected = mountExplicit();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div style="display:none"><div data-testid="selected-map" data-map-id="dust2">Dust2</div></div>',
    );
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    const originalHost = chartHost();
    expect(document.querySelector("#native-action")?.nextElementSibling).toBe(originalHost);
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 0 });
    expect(chartHost()).toBe(originalHost);

    selected.append(document.createElement("i"));
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(selected.lastElementChild).toBe(selectedWinsHost());
    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 0 });

    renderer.destroy();
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();
  });

  it("updates the existing chart when deferred map statistics become available", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    renderer.render(match, new Map());
    const host = chartHost();
    expect(host?.shadowRoot?.textContent).not.toContain("0.0%");
    expect(host?.shadowRoot?.querySelector('[data-es-map-row="dust2"]')?.textContent).toContain("—");
    const initialSummary = selectedWinsSummary();
    expect(initialSummary.querySelector('[data-es-wins-team-id="left"]')?.textContent).toContain("—");
    expect(initialSummary.querySelector('[data-es-wins-team-id="right"]')?.textContent).toContain("—");

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    expect(chartHost()).toBe(host);
    expect(host?.shadowRoot?.querySelector('[data-es-map-row="dust2"]')?.textContent).toContain("60.0%");
    const updatedSummary = selectedWinsSummary();
    expect(updatedSummary.querySelector('[data-es-wins-team-id="left"] .wins-value')?.textContent).toContain("30");
    expect(updatedSummary.querySelector('[data-es-wins-team-id="right"] .wins-value')?.textContent).toContain("40");
  });

  it("remains independent from roster discovery and obeys the settings toggle", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new InlineMatchRenderer();
    const baseSettings = {
      statsWindow: 30 as const,
      mapWinRateWindow: 30 as const,
      showExtendedTier: false,
      showPlayerStats: false,
      showPlayerFormBattery: false,
      showPlayerRoles: false,
      showPlayerEncounters: false,
      showPlayerStreak: false,
      showTeamAverageElo: false,
      showEloStake: false,
      showTeamSummary: false,
      showMapWinRates: true,
      showSelectedMapWins: true,
    };

    expect(renderer.render(match, new Map(), mapRows(match), baseSettings)).toEqual({
      status: "incompatible",
      reason: "roster-contract",
    });
    expect(chartHost()).not.toBeNull();

    renderer.render(match, new Map(), mapRows(match), { ...baseSettings, showMapWinRates: false });
    expect(chartHost()).toBeNull();
    expect(selectedWinsHost()).toBeNull();
  });

  it("keeps map comparison visible while independently hiding selected-map win totals", () => {
    mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match), undefined, 30, false)).toEqual({
      status: "rendered",
      updated: 1,
    });
    expect(chartHost()).not.toBeNull();
    expect(selectedWinsHost()?.hidden).toBe(true);
    expect(selectedWinsHost()?.shadowRoot?.querySelector("[data-es-selected-map-wins]")).toBeNull();

    expect(renderer.render(match, mapRows(match), undefined, 30, true)).toEqual({
      status: "rendered",
      updated: 1,
    });
    expect(selectedWinsHost()?.hidden).toBe(false);
    expect(selectedWinsHost()?.shadowRoot?.querySelector("[data-es-selected-map-wins]")).not.toBeNull();
  });
});
