import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EloScopeSettingsPanel,
  discoverVisibleMapIds,
  SETTINGS_PANEL_HOST_ID,
  type DiagnosticsPanelPort
} from "../src/settings-panel";
import { loadSettings } from "../src/settings";

const panels: EloScopeSettingsPanel[] = [];

function createPanel(options: ConstructorParameters<typeof EloScopeSettingsPanel>[0] = {}): EloScopeSettingsPanel {
  const panel = new EloScopeSettingsPanel(options);
  panels.push(panel);
  panel.mount();
  return panel;
}

function change(element: HTMLInputElement | HTMLSelectElement, value: string | boolean): void {
  if (typeof value === "boolean" && element instanceof HTMLInputElement) element.checked = value;
  else element.value = String(value);
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}

function diagnosticsPort(
  overrides: Partial<DiagnosticsPanelPort> = {}
): DiagnosticsPanelPort {
  return {
    getSummary: async () => ({ eventCount: 0 }),
    copyToClipboard: async () => 0,
    saveToFile: async () => "saved",
    clear: async () => undefined,
    ...overrides
  };
}

afterEach(() => {
  for (const panel of panels.splice(0)) panel.destroy();
});

describe("EloScope settings panel", () => {
  it("mounts one global accessible launcher and dialog", async () => {
    const panel = createPanel({ mapIds: () => ["mirage"] });
    panel.mount();
    expect(document.querySelectorAll(`#${SETTINGS_PANEL_HOST_ID}`)).toHaveLength(1);
    expect(panel.launcher.getAttribute("aria-label")).toBe("Открыть настройки EloScope");
    expect(panel.launcher.getAttribute("aria-haspopup")).toBe("dialog");

    await panel.open();
    const dialog = panel.shadow.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("eloscope-settings-title");
    expect(panel.shadow.activeElement).toBe(dialog);
    expect(panel.launcher.tabIndex).toBe(-1);
    expect(panel.shadow.textContent).toContain("Окно статистики");
    expect(panel.shadow.textContent).toContain("Приложение Windows");
    expect(panel.shadow.textContent).toContain("Запускать вместе с Windows");
    expect(panel.shadow.textContent).toContain("Сворачивать в системный трей");
    expect(panel.shadow.textContent).toContain("Окно WR по картам");
    expect(panel.shadow.textContent).toContain(
      "Количество последних матчей каждого игрока для расчёта сравнения карт"
    );
    expect(
      panel.shadow.querySelector<HTMLSelectElement>('[aria-label="Окно WR по картам"]')?.value
    ).toBe("30");
    expect(panel.shadow.textContent).toContain("Расширенная шкала 1–20");
    expect(panel.shadow.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(
      panel.shadow.querySelector('[data-section="general"]')?.getAttribute("aria-selected")
    ).toBe("true");
    expect(panel.shadow.querySelector('[data-section="match-room"]')?.textContent)
      .toContain("Матч-комната");
    expect(panel.shadow.querySelector('[data-section="automations"]')?.textContent)
      .toContain("Автоматизации");
    expect(panel.shadow.querySelector('[data-section="positions"]')?.textContent)
      .toContain("Быстрые позиции");
    expect(panel.shadow.querySelector('[data-section="diagnostics"]')?.textContent)
      .toContain("Диагностика");
    expect(panel.shadow.querySelector('[data-testid="settings-reset"]')).not.toBeNull();
    expect(
      panel.shadow.querySelector<HTMLSelectElement>('[aria-label="Окно статистики профиля"]')?.value
    ).toBe("20");
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-shell-autostart")?.checked).toBe(false);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-shell-minimize-to-tray")?.checked).toBe(false);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-player-stats")?.checked).toBe(true);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-player-form-battery")?.checked).toBe(true);
    expect(panel.shadow.textContent).toContain("Роли игроков");
    expect(panel.shadow.textContent).toContain("Роль вместо аватара и пять оценок при наведении");
    expect(panel.shadow.textContent).toContain("Серии побед и поражений");
    expect(panel.shadow.textContent).toContain("Текущая зелёная или красная серия");
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-player-streak")?.checked).toBe(true);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-player-encounters")?.checked).toBe(true);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-team-average-elo")?.checked).toBe(true);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-elo-stake")?.checked).toBe(true);
    expect(panel.shadow.textContent).toContain("Сводка команд");
    expect(panel.shadow.textContent).toContain(
      "Шансы, общая форма, FIREPOWER, AVG KILLS и K/D над составами"
    );
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-team-summary")?.checked).toBe(true);
    expect(panel.shadow.textContent).toContain("Сравнение карт");
    expect(panel.shadow.textContent).toContain("Винрейт обеих команд по каждой карте");
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-map-win-rates")?.checked).toBe(true);
    expect(panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-selected-map-wins")?.checked).toBe(true);
    expect(panel.shadow.querySelector("#eloscope-visibility-profile")).toBeNull();
    expect(panel.shadow.querySelector("#eloscope-visibility-history")).toBeNull();
    expect(
      panel.shadow.querySelector<HTMLInputElement>("#eloscope-visibility-profileStatsBanner")?.checked
    ).toBe(true);
    expect(panel.shadow.querySelector("#eloscope-visibility-matchRoom")).not.toBeNull();
    expect(
      panel.shadow.querySelector<HTMLInputElement>("#eloscope-visibility-quickPositionsPanel")?.checked
    ).toBe(false);
    expect(panel.shadow.textContent).toContain("Расширения матч-комнаты");
  });

  it("closes on Escape and backdrop click and restores launcher focus", async () => {
    const panel = createPanel();
    await panel.open();
    const dialog = panel.shadow.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true
    }));
    expect(panel.isOpen).toBe(false);
    expect(panel.shadow.activeElement).toBe(panel.launcher);
    expect(panel.launcher.tabIndex).toBe(0);

    await panel.open();
    const backdrop = panel.shadow.querySelector<HTMLElement>(".es-settings-backdrop");
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(panel.isOpen).toBe(false);
  });

  it("switches between readable settings pages and restores defaults in the draft", async () => {
    const panel = createPanel();
    await panel.open();

    const matchTab = panel.shadow.querySelector<HTMLButtonElement>(
      '#eloscope-settings-tab-match-room'
    )!;
    matchTab.click();
    expect(matchTab.getAttribute("aria-selected")).toBe("true");
    expect(
      panel.shadow.querySelector<HTMLElement>("#eloscope-settings-page-match-room")?.hidden
    ).toBe(false);
    expect(
      panel.shadow.querySelector<HTMLElement>("#eloscope-settings-page-general")?.hidden
    ).toBe(true);

    change(panel.shadow.querySelector("#eloscope-show-player-stats") as HTMLInputElement, false);
    panel.shadow.querySelector<HTMLButtonElement>('[data-testid="settings-reset"]')?.click();
    expect(
      panel.shadow.querySelector<HTMLInputElement>("#eloscope-show-player-stats")?.checked
    ).toBe(true);
    expect(
      panel.shadow.querySelector<HTMLButtonElement>("#eloscope-settings-tab-match-room")
        ?.getAttribute("aria-selected")
    ).toBe("true");
  });

  it("traps keyboard focus inside the modal dialog", async () => {
    const panel = createPanel();
    await panel.open();
    const dialog = panel.shadow.querySelector<HTMLElement>('[role="dialog"]')!;
    const first = dialog.querySelector<HTMLButtonElement>(".es-settings-close")!;
    const last = dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;

    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      composed: true
    }));
    expect(panel.shadow.activeElement).toBe(last);

    last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      composed: true
    }));
    expect(panel.shadow.activeElement).toBe(first);
    expect(panel.shadow.activeElement).not.toBe(panel.launcher);
  });

  it("saves interface and every automation control then refreshes the client", async () => {
    const onSaved = vi.fn(async () => undefined);
    const shellApply = vi.fn(() => true);
    const panel = createPanel({ onSaved, mapIds: () => ["mirage"], shell: { apply: shellApply } });
    await panel.open();

    const shadow = panel.shadow;
    change(shadow.querySelector('[aria-label="Окно статистики"]') as HTMLSelectElement, "50");
    change(shadow.querySelector('[aria-label="Окно статистики профиля"]') as HTMLSelectElement, "10");
    change(shadow.querySelector('[aria-label="Окно WR по картам"]') as HTMLSelectElement, "100");
    change(shadow.querySelector("#eloscope-shell-autostart") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-shell-minimize-to-tray") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-show-extended-tier") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-show-player-stats") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-player-form-battery") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-player-roles") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-player-encounters") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-player-streak") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-team-average-elo") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-elo-stake") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-team-summary") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-map-win-rates") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-show-selected-map-wins") as HTMLInputElement, false);
    change(shadow.querySelector("#eloscope-visibility-matchRoom") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-visibility-quickPositionsPanel") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-partyAccept") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-readyUp") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-autoConnect") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-copyServerData") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-map-veto") as HTMLInputElement, true);
    change(shadow.querySelector("#eloscope-automation-server-veto") as HTMLInputElement, true);

    const ban = shadow.querySelector<HTMLInputElement>('[data-testid="map-ban-order"]')!;
    ban.value = "mirage, nuke";
    ban.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const pick = shadow.querySelector<HTMLInputElement>('[data-testid="map-pick-order"]')!;
    pick.value = "ancient";
    pick.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const servers = shadow.querySelector<HTMLInputElement>('[data-testid="server-order"]')!;
    servers.value = "warsaw, frankfurt";
    servers.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

    const save = shadow.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    save.dataset.eloscopeSettingsGesture = "0123456789abcdef0123456789abcdef0123456789abcdef";
    const form = shadow.querySelector("form")!;
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, composed: true }));
    await vi.waitFor(() => expect(panel.isOpen).toBe(false));
    expect(onSaved).toHaveBeenCalledOnce();

    const stored = await loadSettings();
    expect(stored.statsWindow).toBe(50);
    expect(stored.profileStatsWindow).toBe(10);
    expect(stored.mapWinRateWindow).toBe(100);
    expect(stored.showExtendedTier).toBe(true);
    expect(stored.showPlayerStats).toBe(false);
    expect(stored.showPlayerFormBattery).toBe(false);
    expect(stored.showPlayerRoles).toBe(false);
    expect(stored.showPlayerEncounters).toBe(false);
    expect(stored.showPlayerStreak).toBe(false);
    expect(stored.showTeamAverageElo).toBe(false);
    expect(stored.showEloStake).toBe(false);
    expect(stored.showTeamSummary).toBe(false);
    expect(stored.showMapWinRates).toBe(false);
    expect(stored.showSelectedMapWins).toBe(false);
    expect(stored.shell).toEqual({
      autostart: true,
      minimizeToTray: true
    });
    expect(stored.interfaceVisibility).toEqual({
      profile: false,
      history: false,
      profileStatsBanner: true,
      matchRoom: true,
      quickPositionsPanel: true
    });
    expect(stored.automations).toMatchObject({
      partyAccept: true,
      readyUp: true,
      autoConnect: true,
      copyServerData: true,
      mapVeto: { enabled: true, banOrder: ["mirage", "nuke"], pickOrder: ["ancient"] },
      serverVeto: { enabled: true, order: ["warsaw", "frankfurt"] }
    });
    expect(shellApply).toHaveBeenCalledWith(stored.shell, "0123456789abcdef0123456789abcdef0123456789abcdef");
  });

  it("edits dynamic quick positions and keeps confirm as the safe default", async () => {
    const panel = createPanel({ mapIds: () => ["mirage", "nuke"] });
    await panel.open();
    const card = panel.shadow.querySelector<HTMLElement>('[data-map="mirage"]')!;
    const enabled = card.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    change(enabled, true);
    const message = card.querySelector<HTMLTextAreaElement>("textarea")!;
    message.value = "I play A connector";
    message.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const mode = card.querySelector<HTMLSelectElement>("select")!;
    expect(mode.value).toBe("confirm");
    change(mode, "prefill");

    panel.shadow.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      composed: true
    }));
    await vi.waitFor(() => expect(panel.isOpen).toBe(false));
    const stored = await loadSettings();
    expect(stored.automations.positions.mirage).toEqual({
      enabled: true,
      message: "I play A connector",
      mode: "prefill"
    });
    expect(stored.automations.positions.nuke?.mode).toBe("confirm");
  });

  it("prefers the complete controller map pool over the selected DOM map", async () => {
    document.body.innerHTML = `
      <div data-testid="matchPreference" data-eloscope-visible="true">Germany</div>
      <div><span data-testid="mapsVetoHistory">Veto</span></div>
      <div data-testid="matchPreference" data-eloscope-visible="true">Dust2</div>
    `;
    const panel = createPanel({ mapIds: () => ["Mirage", "nuke"] });
    await panel.open();

    expect([
      ...panel.shadow.querySelectorAll<HTMLElement>(".es-position-card")
    ].map((card) => card.dataset.map)).toEqual(["mirage", "nuke"]);
  });

  it("falls back to the selected DOM map while the controller pool is loading", async () => {
    document.body.innerHTML = `
      <div data-testid="matchPreference" data-eloscope-visible="true">Germany</div>
      <div><span data-testid="mapsVetoHistory">Veto</span></div>
      <div data-testid="matchPreference" data-eloscope-visible="true">Dust2</div>
    `;
    const panel = createPanel({ mapIds: () => [] });
    await panel.open();

    expect(panel.shadow.querySelector<HTMLElement>(".es-position-card")?.dataset.map).toBe("dust2");
  });

  it("restores focus inside the dialog after removing a dynamic map", async () => {
    const panel = createPanel({ mapIds: () => ["mirage", "nuke"] });
    await panel.open();
    const remove = panel.shadow.querySelector<HTMLButtonElement>('[data-map="mirage"] .es-position-remove')!;
    remove.focus();
    remove.click();

    const focused = panel.shadow.activeElement as HTMLElement | null;
    expect(focused?.classList.contains("es-position-remove")).toBe(true);
    expect(focused?.closest<HTMLElement>(".es-position-card")?.dataset.map).toBe("nuke");
    focused?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      composed: true
    }));
    expect(panel.isOpen).toBe(false);
  });

  it("discovers map ids from the current FACEIT contract without guessing", () => {
    document.body.innerHTML = `
      <div data-map-id="mirage"></div>
      <button data-testid="veto-map-nuke"></button>
      <div data-map-id="MIRAGE"></div>
    `;
    expect(discoverVisibleMapIds()).toEqual(["mirage", "nuke"]);
  });

  it("adds the currently selected FACEIT map to quick-position settings", () => {
    document.body.innerHTML = `
      <div data-testid="matchPreference" data-eloscope-visible="true">Germany</div>
      <div><span data-testid="mapsVetoHistory">Veto</span></div>
      <div data-testid="matchPreference" data-eloscope-visible="true">Dust2</div>
    `;
    expect(discoverVisibleMapIds()).toEqual(["dust2"]);
  });

  it("keeps the dialog open and reports a storage failure", async () => {
    const panel = createPanel();
    await panel.open();
    const storageSpy = vi.spyOn(chrome.storage.local, "set").mockRejectedValueOnce(new Error("disk"));
    panel.shadow.querySelector("form")?.dispatchEvent(new SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      composed: true
    }));
    await vi.waitFor(() => {
      expect(panel.shadow.querySelector(".es-settings-status")?.textContent).toContain("Не удалось");
    });
    expect(panel.isOpen).toBe(true);
    expect(panel.shadow.activeElement).toBe(panel.shadow.querySelector('button[type="submit"]'));
    storageSpy.mockRestore();
  });

  it("shows the local redacted diagnostic summary and copies it without closing", async () => {
    const getSummary = vi.fn(async () => ({
      eventCount: 12,
      oldestAt: Date.UTC(2026, 6, 20, 10),
      newestAt: Date.UTC(2026, 6, 23, 12)
    }));
    const copyToClipboard = vi.fn(async () => 12);
    const panel = createPanel({
      diagnostics: diagnosticsPort({ getSummary, copyToClipboard })
    });
    await panel.open();

    const summary = panel.shadow.querySelector<HTMLElement>('[data-testid="debug-log-summary"]')!;
    await vi.waitFor(() => expect(summary.textContent).toContain("12 событий"));
    expect(panel.shadow.textContent).toContain("Локальный журнал действий");
    expect(panel.shadow.textContent).toContain("до 7 дней");
    expect(panel.shadow.textContent).toContain("чувствительные значения и токены удаляются");

    const copy = panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-copy"]')!;
    const save = panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-save"]')!;
    const clear = panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-clear"]')!;
    expect([copy.type, save.type, clear.type]).toEqual(["button", "button", "button"]);

    copy.click();
    await vi.waitFor(() => {
      expect(panel.shadow.querySelector('[data-testid="debug-log-status"]')?.textContent)
        .toBe("Скопировано событий: 12");
    });
    expect(copyToClipboard).toHaveBeenCalledOnce();
    expect(panel.isOpen).toBe(true);
  }, 15_000);

  it("reports diagnostic summary and copy failures without closing settings", async () => {
    const copyToClipboard = vi.fn(async (): Promise<number> => {
      throw new Error("clipboard");
    });
    const panel = createPanel({
      diagnostics: diagnosticsPort({
        getSummary: async () => {
          throw new Error("storage");
        },
        copyToClipboard
      })
    });
    await panel.open();

    await vi.waitFor(() => {
      expect(panel.shadow.querySelector('[data-testid="debug-log-summary"]')?.textContent)
        .toBe("Не удалось загрузить сводку журнала");
    });
    panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-copy"]')?.click();
    await vi.waitFor(() => {
      const status = panel.shadow.querySelector<HTMLElement>('[data-testid="debug-log-status"]');
      expect(status?.textContent).toBe("Не удалось скопировать журнал");
      expect(status?.dataset.error).toBe("true");
    });
    expect(panel.isOpen).toBe(true);
  });

  it("saves diagnostics and reports the clipboard fallback", async () => {
    const outcomes: Array<"saved" | "copied"> = ["saved", "copied"];
    const saveToFile = vi.fn(async (): Promise<"saved" | "copied"> => outcomes.shift() ?? "saved");
    const panel = createPanel({
      diagnostics: diagnosticsPort({ saveToFile })
    });
    await panel.open();

    const save = panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-save"]')!;
    const status = panel.shadow.querySelector<HTMLElement>('[data-testid="debug-log-status"]')!;
    save.click();
    await vi.waitFor(() => expect(status.textContent).toBe("Файл диагностики сохранён"));
    save.click();
    await vi.waitFor(() => {
      expect(status.textContent).toBe("Сохранение файла недоступно — журнал скопирован");
    });
    expect(saveToFile).toHaveBeenCalledTimes(2);
    expect(panel.isOpen).toBe(true);
  });

  it("clears diagnostics and refreshes the visible summary", async () => {
    const clear = vi.fn(async () => undefined);
    const panel = createPanel({
      diagnostics: diagnosticsPort({
        getSummary: async () => ({ eventCount: 4, newestAt: Date.UTC(2026, 6, 23, 12) }),
        clear
      })
    });
    await panel.open();

    const summary = panel.shadow.querySelector<HTMLElement>('[data-testid="debug-log-summary"]')!;
    await vi.waitFor(() => expect(summary.textContent).toContain("4 событий"));
    panel.shadow.querySelector<HTMLButtonElement>('[data-testid="debug-log-clear"]')?.click();
    await vi.waitFor(() => {
      expect(summary.textContent).toBe("Событий пока нет");
      expect(panel.shadow.querySelector('[data-testid="debug-log-status"]')?.textContent)
        .toBe("Журнал очищен");
    });
    expect(clear).toHaveBeenCalledOnce();
    expect(panel.isOpen).toBe(true);
  });
});
