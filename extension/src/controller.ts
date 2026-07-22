import {
  CACHE_TTLS,
  RequestCache,
  type DataState,
  type MatchContext,
  type MatchStats,
  type Player,
  type PlayerMapStats,
  type PlayerMatch,
  type StatsWindow
} from "@eloscope/core";
import { VisibleDomAutomationRunner } from "./automations";
import { FaceitBridgeAdapter } from "./bridge-client";
import { BUILT_IN_CAPABILITIES, loadCompatibility, type Capabilities, type CompatibilityStatus } from "./compatibility";
import { observeScopedDom } from "./dom";
import { isSelectedMapVisible, QuickPositionSender, visibleSelectedMap } from "./positions";
import { MAIN_SOURCE, PROTOCOL_VERSION, type MainMessage } from "./protocol";
import { parseFaceitRoute, type FaceitRoute } from "./routes";
import { loadSettings, saveSettings, type ExtensionSettings } from "./settings";
import { EloSnapshotStore } from "./snapshots";
import { EloScopeOverlay, type HistoryDetailData } from "./ui";

type CachedState = DataState<unknown>;

function requestedWindow(window: StatsWindow): StatsWindow {
  return window < 30 ? 30 : window;
}

export function routeIdentity(route: FaceitRoute): string {
  if (route.kind === "profile" || route.kind === "history") return `${route.kind}:${route.nickname.toLowerCase()}`;
  if (route.kind === "match") return `match:${route.matchId}`;
  return route.kind;
}

export class EloScopeController {
  readonly #adapter = new FaceitBridgeAdapter(location.origin);
  readonly #cache = new RequestCache<string, CachedState>({ concurrency: 4, maxBytes: 50 * 1024 * 1024 });
  readonly #automations = new VisibleDomAutomationRunner();
  readonly #positionSender = new QuickPositionSender();
  readonly #snapshots = new EloSnapshotStore();
  #overlay!: EloScopeOverlay;
  #settings!: ExtensionSettings;
  #capabilities: Capabilities = { ...BUILT_IN_CAPABILITIES };
  #compatibilityStatus: CompatibilityStatus = "built-in";
  #route: FaceitRoute = { kind: "other" };
  #routeIdentity = "other";
  #currentMatch: MatchContext | undefined;
  #currentPlayerMatches = new Map<string, PlayerMatch[]>();
  #routeRevision = 0;
  #stopObserver: (() => void) | undefined;

  async start(): Promise<void> {
    this.#settings = await loadSettings();
    this.#overlay = new EloScopeOverlay(this.#settings, {
      onSettingsChange: async (settings) => {
        this.#settings = settings;
        this.#overlay.updateSettings(settings);
        await saveSettings(settings);
        this.#automations.resetForRoute();
        await this.navigate(location.pathname);
      },
      onStatsWindow: (window) => {
        this.#settings = { ...this.#settings, statsWindow: window };
        this.#overlay.updateSettings(this.#settings);
        void saveSettings(this.#settings);
        void this.navigate(location.pathname);
      },
      onPositionSend: async (map, message, mode) => {
        if (this.#route.kind !== "match" || !this.#capabilities.quickPositions) return "chat-unavailable";
        const position = this.#settings.automations.positions[map];
        if (
          !this.#currentMatch?.selectedMap ||
          this.#currentMatch.selectedMap.toLowerCase() !== map.toLowerCase() ||
          !position?.enabled ||
          !isSelectedMapVisible(document, map)
        ) return "chat-unavailable";
        return this.#positionSender.send(document, this.#route.matchId, map, message, mode);
      },
      onHistoryDetail: (matchId) => this.#loadHistoryDetail(matchId)
    });

    const compatibility = await loadCompatibility();
    this.#capabilities = compatibility.capabilities;
    this.#compatibilityStatus = compatibility.status;
    this.#overlay.setCompatibility(this.#compatibilityStatus);

    window.addEventListener("message", this.#routeMessage);
    this.#stopObserver = observeScopedDom(() => { void this.#handleDomMutation(); });
    await this.navigate(location.pathname);
  }

  destroy(): void {
    window.removeEventListener("message", this.#routeMessage);
    this.#stopObserver?.();
    this.#adapter.destroy();
    this.#cache.clear();
    this.#overlay?.destroy();
  }

  readonly #routeMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data as Partial<MainMessage>;
    if (message.source !== MAIN_SOURCE || message.version !== PROTOCOL_VERSION || message.type !== "route") return;
    if (typeof message.pathname !== "string" || !message.pathname.startsWith("/") || message.pathname.length > 2_048) return;
    if (message.pathname !== location.pathname) return;
    void this.navigate(location.pathname);
  };

  async navigate(pathname: string): Promise<void> {
    const revision = ++this.#routeRevision;
    const nextRoute = parseFaceitRoute(pathname);
    const nextIdentity = routeIdentity(nextRoute);
    this.#route = nextRoute;
    if (nextIdentity !== this.#routeIdentity) {
      this.#routeIdentity = nextIdentity;
      this.#automations.resetForRoute();
    }
    if (nextRoute.kind !== "match") {
      this.#currentMatch = undefined;
      this.#currentPlayerMatches.clear();
    }

    switch (this.#route.kind) {
      case "logged-out":
      case "other":
        this.#overlay.hideRoutePanels();
        break;
      case "profile":
        if (!this.#capabilities.profile) this.#overlay.hideRoutePanels();
        else await this.#loadProfile(this.#route.nickname, false, revision);
        break;
      case "history":
        if (!this.#capabilities.history) this.#overlay.hideRoutePanels();
        else await this.#loadProfile(this.#route.nickname, true, revision);
        break;
      case "match":
        if (!this.#capabilities.matchRoom) this.#overlay.hideRoutePanels();
        else await this.#loadMatch(this.#route.matchId, revision);
        break;
    }
    if (revision === this.#routeRevision) this.#runAutomations();
  }

  async #loadProfile(nickname: string, history: boolean, revision: number): Promise<void> {
    this.#overlay.showLoading(history ? "Расширенная история" : "Профиль");
    const playerState = await this.#cached<Player>(
      `player:${nickname.toLowerCase()}`,
      () => this.#adapter.getPlayer(nickname),
      CACHE_TTLS.playerStats
    );
    if (revision !== this.#routeRevision) return;
    if (playerState.status !== "ready" || !playerState.data) {
      this.#overlay.showState(history ? "Расширенная история" : "Профиль", playerState.status === "restricted" ? "restricted" : "error");
      return;
    }
    await this.#snapshots.recordPlayer(playerState.data);

    const limit = requestedWindow(this.#settings.statsWindow);
    const [matchesState, mapsState] = await Promise.all([
      this.#cached<PlayerMatch[]>(
        `matches:${playerState.data.id}:${limit}`,
        () => this.#adapter.getRecentMatches(playerState.data.id, limit),
        CACHE_TTLS.playerStats
      ),
      history
        ? Promise.resolve<DataState<PlayerMapStats[]>>({ status: "ready", data: [], fetchedAt: Date.now() })
        : this.#cached<PlayerMapStats[]>(
            `maps:${playerState.data.id}`,
            () => this.#adapter.getPlayerMapStats(playerState.data.id),
            CACHE_TTLS.playerStats
          )
    ]);
    if (revision !== this.#routeRevision) return;
    if (matchesState.status !== "ready") {
      this.#overlay.showState(history ? "Расширенная история" : "Профиль", matchesState.status === "restricted" ? "restricted" : "error");
      return;
    }
    const matches = await this.#snapshots.hydrateMatchElos(playerState.data.id, matchesState.data);
    await this.#snapshots.rememberMatchElos(playerState.data.id, matches);
    const maps = mapsState.status === "ready" ? mapsState.data : [];
    if (history) this.#overlay.showHistory(playerState.data, matches);
    else this.#overlay.showProfile(playerState.data, matches, maps);
  }

  async #loadMatch(matchId: string, revision: number): Promise<void> {
    this.#overlay.showLoading("Match room");
    const matchState = await this.#cached<MatchContext>(
      `match:${matchId}`,
      () => this.#adapter.getMatch(matchId),
      CACHE_TTLS.activeMatch
    );
    if (revision !== this.#routeRevision) return;
    if (matchState.status !== "ready" || !matchState.data) {
      this.#overlay.showState("Match room", matchState.status === "restricted" ? "restricted" : "error");
      return;
    }

    const visibleMap = visibleSelectedMap(document);
    const match = visibleMap
      ? {
          ...matchState.data,
          selectedMap: visibleMap,
          mapPool: matchState.data.mapPool.includes(visibleMap)
            ? matchState.data.mapPool
            : [...matchState.data.mapPool, visibleMap],
        }
      : matchState.data;
    this.#currentMatch = match;
    if (match.status === "finished") this.#cache.set(`match:${matchId}`, matchState, CACHE_TTLS.finishedMatch);
    const limit = requestedWindow(this.#settings.statsWindow);
    const players = match.teams.flatMap((team) => team.players);
    await Promise.all(players.map((player) => this.#snapshots.recordPlayer(player)));
    const states = await Promise.all(
      players.map(async (player) => [
        player.id,
        await this.#cached<PlayerMatch[]>(
          `matches:${player.id}:${limit}`,
          () => this.#adapter.getRecentMatches(player.id, limit),
          CACHE_TTLS.playerStats
        )
      ] as const)
    );
    if (revision !== this.#routeRevision) return;
    const matches = new Map<string, PlayerMatch[]>();
    for (const [playerId, state] of states) {
      if (state.status !== "ready") {
        matches.set(playerId, []);
        continue;
      }
      const hydrated = await this.#snapshots.hydrateMatchElos(playerId, state.data);
      await this.#snapshots.rememberMatchElos(playerId, hydrated);
      matches.set(playerId, hydrated);
    }
    this.#currentPlayerMatches = matches;
    this.#overlay.showMatch(match, matches);
    await this.#maybeSendAutomaticPosition();
  }

  async #cached<T>(key: string, loader: () => Promise<DataState<T>>, ttlMs: number): Promise<DataState<T>> {
    return this.#cache.get(key, loader as () => Promise<CachedState>, { ttlMs }) as Promise<DataState<T>>;
  }

  async #loadHistoryDetail(matchId: string): Promise<DataState<HistoryDetailData>> {
    const [match, stats] = await Promise.all([
      this.#cached<MatchContext>(
        `match:${matchId}`,
        () => this.#adapter.getMatch(matchId),
        CACHE_TTLS.finishedMatch
      ),
      this.#cached<MatchStats>(
        `match-stats:${matchId}`,
        () => this.#adapter.getMatchStats(matchId),
        CACHE_TTLS.finishedMatch
      )
    ]);
    if (match.status === "restricted" || stats.status === "restricted") {
      return { status: "restricted", reason: "match-detail-unavailable" };
    }
    if (match.status === "ready" && stats.status === "ready") {
      return { status: "ready", data: { match: match.data, stats: stats.data }, fetchedAt: Date.now() };
    }
    return {
      status: "error",
      error: { code: "match-detail", message: "Match detail is unavailable", retryable: true }
    };
  }

  async #handleDomMutation(): Promise<void> {
    this.#runAutomations();
    if (this.#route.kind !== "match" || !this.#currentMatch) return;
    const selected = visibleSelectedMap(document);
    if (!selected) return;
    if (this.#currentMatch.selectedMap?.toLowerCase() === selected.toLowerCase()) {
      await this.#maybeSendAutomaticPosition();
      return;
    }
    this.#currentMatch = {
      ...this.#currentMatch,
      selectedMap: selected,
      mapPool: this.#currentMatch.mapPool.includes(selected)
        ? this.#currentMatch.mapPool
        : [...this.#currentMatch.mapPool, selected],
    };
    this.#overlay.showMatch(this.#currentMatch, this.#currentPlayerMatches);
    await this.#maybeSendAutomaticPosition();
  }

  async #maybeSendAutomaticPosition(): Promise<void> {
    const selected = this.#currentMatch?.selectedMap;
    if (!selected || !this.#capabilities.quickPositions || !isSelectedMapVisible(document, selected)) return;
    const position = this.#settings.automations.positions[selected];
    if (position?.enabled && position.mode === "auto") {
      await this.#positionSender.send(document, this.#currentMatch?.id ?? "", selected, position.message, "auto");
    }
  }

  #runAutomations(): void {
    this.#automations.run(document, this.#route, this.#settings.automations, this.#capabilities);
  }
}
