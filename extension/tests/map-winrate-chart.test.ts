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
      <a id="native-action" href="#queue">Native action</a>
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
  it("mounts after the selected map and renders selected-first weighted team comparisons", () => {
    const selected = mountExplicit();
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();

    expect(renderer.render(match, mapRows(match))).toEqual({ status: "rendered", updated: 1 });
    const host = chartHost();
    expect(selected.nextElementSibling).toBe(host);
    expect(selected.lastElementChild).toBe(selectedWinsHost());
    expect(host?.nextElementSibling?.id).toBe("native-action");
    expect(host?.getAttribute(INLINE_MAP_WINRATE_ATTRIBUTE)).toBe(match.id);

    const chart = host?.shadowRoot?.querySelector<HTMLElement>("[data-es-map-winrates]");
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

  it("uses only the validated live Finished > Section > Preferences chain", () => {
    document.body.innerHTML = `
      <div class="Finished__Container-sc-live">
        <section class="Finished__Section-sc-live">
          <div class="Preferences__Container-sc-live" id="preferences">
            <div><span data-testid="mapsVetoHistory">Veto</span></div>
            <div data-testid="matchPreference">Dust2</div>
          </div>
        </section>
        <button id="demo">Demo</button>
      </div>
    `;
    const match = matchContext();
    const renderer = new MatchMapWinRateChartRenderer();
    expect(renderer.render(match, mapRows(match)).status).toBe("rendered");

    const preferences = document.querySelector("#preferences");
    const host = chartHost();
    expect(preferences?.nextElementSibling).toBe(host);
    expect(document.querySelector('[data-testid="matchPreference"]')?.lastElementChild).toBe(selectedWinsHost());
    expect(host?.parentElement?.matches('[class*="Finished__Section"]')).toBe(true);
    expect(document.querySelector("#demo")?.previousElementSibling?.matches('[class*="Finished__Section"]')).toBe(true);
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
    expect(document.querySelector("#selected-2")?.nextElementSibling).toBe(chartHost());
    expect(document.querySelector("#selected-2")?.lastElementChild).toBe(selectedWinsHost());
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
    expect(selected.nextElementSibling).toBe(originalHost);
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
      showExtendedTier: false,
      showPlayerRoles: false,
      showMapWinRates: true,
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
});
