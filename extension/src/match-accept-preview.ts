import type { PendingMatchPreview } from "@eloscope/core";

function formatMapLabel(map: string): string {
  const label = map.replace(/^de_/iu, "");
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : map;
}

export class MatchAcceptPreviewRenderer {
  readonly #host: HTMLElement;
  #visible = false;

  constructor(private readonly shadow: ShadowRoot) {
    this.#host = document.createElement("section");
    this.#host.className = "es-match-accept-preview";
    this.#host.hidden = true;
    this.#host.setAttribute("aria-live", "polite");
    this.shadow.querySelector(".es-shell")?.append(this.#host);
  }

  destroy(): void {
    this.#host.remove();
  }

  cleanup(): void {
    this.#visible = false;
    this.#host.hidden = true;
    this.#host.replaceChildren();
  }

  render(preview: PendingMatchPreview): boolean {
    this.#visible = true;
    this.#host.hidden = false;
    this.#host.replaceChildren(this.#build(preview));
    return true;
  }

  sync(): boolean {
    return this.#visible && !this.#host.hidden;
  }

  #build(preview: PendingMatchPreview): DocumentFragment {
    const fragment = document.createDocumentFragment();
    const card = document.createElement("article");
    card.className = "es-match-accept-card";

    const head = document.createElement("header");
    head.className = "es-match-accept-head";
    const title = document.createElement("strong");
    title.textContent = "До принятия";
    const badge = document.createElement("span");
    badge.className = "es-badge";
    badge.textContent = preview.phase;
    head.append(title, badge);
    card.append(head);

    if (preview.regions.length) {
      card.append(this.#section(
        "Регион / серверы",
        preview.regions.join(" · "),
      ));
    }

    if (preview.mapPool.length) {
      const maps = document.createElement("div");
      maps.className = "es-match-accept-maps";
      for (const map of preview.mapPool) {
        const pill = document.createElement("span");
        pill.className = "es-match-accept-map";
        pill.textContent = formatMapLabel(map);
        maps.append(pill);
      }
      const section = document.createElement("section");
      section.className = "es-match-accept-section";
      const label = document.createElement("span");
      label.className = "es-match-accept-label";
      label.textContent = "Map pool";
      section.append(label, maps);
      card.append(section);
    }

    if (preview.teams?.length) {
      const teams = document.createElement("div");
      teams.className = "es-match-accept-teams";
      for (const team of preview.teams) {
        const row = document.createElement("div");
        row.className = "es-match-accept-team";
        const name = document.createElement("span");
        name.className = "es-match-accept-team-name";
        name.textContent = team.name ?? team.id;
        row.append(name);

        if (team.averageElo !== undefined) {
          const elo = document.createElement("span");
          elo.className = "es-match-accept-team-elo";
          const coverage = team.eloKnown !== undefined && team.eloTotal !== undefined && team.eloKnown < team.eloTotal
            ? ` (${team.eloKnown}/${team.eloTotal})`
            : "";
          elo.textContent = `avg ${team.averageElo}${coverage}`;
          row.append(elo);
        } else {
          const muted = document.createElement("span");
          muted.className = "es-muted";
          muted.textContent = "ELO скрыт";
          row.append(muted);
        }
        teams.append(row);

        if (team.players.some((player) => player.elo !== undefined)) {
          const players = document.createElement("div");
          players.className = "es-match-accept-players";
          for (const player of team.players) {
            const chip = document.createElement("span");
            chip.className = "es-match-accept-player";
            chip.textContent = player.elo !== undefined
              ? `${player.nickname} · ${player.elo}`
              : player.nickname;
            players.append(chip);
          }
          teams.append(players);
        }
      }
      const section = document.createElement("section");
      section.className = "es-match-accept-section";
      const label = document.createElement("span");
      label.className = "es-match-accept-label";
      label.textContent = "ELO команд";
      section.append(label, teams);
      card.append(section);
    }

    const note = document.createElement("p");
    note.className = "es-match-accept-note";
    note.textContent = "Данные перехвачены из ответа FACEIT до принятия матча. Состав может быть неполным.";
    card.append(note);
    fragment.append(card);
    return fragment;
  }

  #section(labelText: string, valueText: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "es-match-accept-section";
    const label = document.createElement("span");
    label.className = "es-match-accept-label";
    label.textContent = labelText;
    const value = document.createElement("span");
    value.className = "es-match-accept-value";
    value.textContent = valueText;
    section.append(label, value);
    return section;
  }
}
