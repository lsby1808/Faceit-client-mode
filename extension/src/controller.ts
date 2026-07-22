import {
  CACHE_TTLS,
  RequestCache,
  type DataState,
  type MatchContext,
  type MatchStats,
  type MapId,
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
import { loadSettings, positionForMap, saveSettings, type ExtensionSettings } from "./settings";
import { EloSnapshotStore } from "./snapshots";
import { EloScopeOverlay, type HistoryDetailData } from "./ui";

type CachedState = DataState<unknown>;

export type ControllerOptions = {
  onMapPoolChange?: (mapIds: readonly MapId[]) => void;
};

function requestedWindow(window: StatsWindow): StatsWindow {
  return window < 30 ? 30 : window;
}

const AUTOMATIC_POSITION_MATCH_STATES = new Set(["voting", "configuring", "ready"]);

export function allowsAutomaticPosition(status: string): boolean {
  return AUTOMATIC_POSITION_MATCH_STATES.has(status.trim().toLowerCase());
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
  #currentPlayerMapStats = new Map<string, PlayerMapStats[]>();
  #routeRevision = 0;
  #stopObserver: (() => void) | undefined;
  #destroyed = false;
  readonly #lifecycle = new AbortController();

  constructor(private readonly options: ControllerOptions = {}) {}

  async start(): Promise<void> {
    if (this.#destroyed) return;
    this.#settings = await loadSettings();
    if (this.#destroyed) return;
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
        if (this.#destroyed || this.#route.kind !== "match" || !this.#capabilities.quickPositions) return "chat-unavailable";
        const position = positionForMap(this.#settings, map);
        if (
          !this.#currentMatch?.selectedMap ||
          this.#currentMatch.selectedMap.toLowerCase() !== map.toLowerCase() ||
          !position?.enabled ||
          !isSelectedMapVisible(document, map)
        ) return "chat-unavailable";
        return this.#positionSender.send(document, this.#route.matchId, map, message, mode, this.#lifecycle.signal);
      },
      onHistoryDetail: (matchId) => this.#loadHistoryDetail(matchId)
    });

    const compatibility = await loadCompatibility({ signal: this.#lifecycle.signal });
    if (this.#destroyed) return;
    this.#capabilities = compatibility.capabilities;
    this.#compatibilityStatus = compatibility.status;
    this.#overlay.setCompatibility(this.#compatibilityStatus);

    window.addEventListener("message", this.#routeMessage);
    this.#stopObserver = observeScopedDom(() => { void this.#handleDomMutation(); });
    await this.navigate(location.pathname);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#lifecycle.abort();
    this.#routeRevision += 1;
    window.removeEventListener("message", this.#routeMessage);
    this.#stopObserver?.();
    this.#adapter.destroy();
    this.#cache.clear();
    this.#overlay?.destroy();
    this.#publishMapPool([]);
  }

  readonly #routeMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window || event.origin !== location.origin) return;
    const message = event.data as Partial<MainMessage>;
    if (message.source !== MAIN_SOURCE || message.version !== PROTOCOL_VERSION || message.type !== "route") return;
    if (typeof message.pathname !== "string" || !message.pathname.startsWith("/") || message.pathname.length > 2_048) return;
    if (message.pathname !== location.pathname) return;
    if (routeIdentity(parseFaceitRoute(message.pathname)) === this.#routeIdentity) return;
    void this.navigate(location.pathname);
  };

  async navigate(pathname: string): Promise<void> {
    if (this.#destroyed) return;
    const revision = ++this.#routeRevision;
    const nextRoute = parseFaceitRoute(pathname);
    const nextIdentity = routeIdentity(nextRoute);
    this.#route = nextRoute;
    if (nextIdentity !== this.#routeIdentity) {
      this.#routeIdentity = nextIdentity;
      this.#automations.resetForRoute();
      if (nextRoute.kind === "match") {
        this.#currentMatch = undefined;
        this.#currentPlayerMatches.clear();
        this.#currentPlayerMapStats.clear();
        this.#publishMapPool([]);
      }
    }
    if (nextRoute.kind !== "match") {
      this.#currentMatch = undefined;
      this.#currentPlayerMatches.clear();
      this.#currentPlayerMapStats.clear();
      this.#publishMapPool([]);
    }

    switch (this.#route.kind) {
      case "logged-out":
      case "other":
        this.#overlay.hideRoutePanels();
        break;
      case "profile":
        if (!this.#capabilities.profile || !this.#settings.interfaceVisibility.profile) this.#overlay.hideRoutePanels();
        else await this.#loadProfile(this.#route.nickname, false, revision);
        break;
      case "history":
        if (!this.#capabilities.history || !this.#settings.interfaceVisibility.history) this.#overlay.hideRoutePanels();
        else await this.#loadProfile(this.#route.nickname, true, revision);
        break;
      case "match":
        if (!this.#capabilities.matchRoom) this.#overlay.hideRoutePanels();
        else await this.#loadMatch(
          this.#route.matchId,
          revision,
          this.#settings.interfaceVisibility.matchRoom
        );
        break;
    }
    if (this.#isCurrent(revision)) this.#runAutomations();
  }

  async #loadProfile(nickname: string, history: boolean, revision: number): Promise<void> {
    const mode = history ? "history" : "profile";
    this.#overlay.showLoading(history ? "Расширенная история" : "Профиль", mode);
    const playerState = await this.#cached<Player>(
      `player:${nickname.toLowerCase()}`,
      () => this.#adapter.getPlayer(nickname),
      CACHE_TTLS.playerStats
    );
    if (!this.#isCurrent(revision)) return;
    if (playerState.status !== "ready" || !playerState.data) {
      this.#overlay.showState(history ? "Расширенная история" : "Профиль", playerState.status === "restricted" ? "restricted" : "error", mode);
      return;
    }
    await this.#snapshots.recordPlayer(playerState.data);
    if (!this.#isCurrent(revision)) return;

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
    if (!this.#isCurrent(revision)) return;
    if (matchesState.status !== "ready") {
      this.#overlay.showState(history ? "Расширенная история" : "Профиль", matchesState.status === "restricted" ? "restricted" : "error", mode);
      return;
    }
    const matches = await this.#snapshots.hydrateMatchElos(playerState.data.id, matchesState.data);
    if (!this.#isCurrent(revision)) return;
    await this.#snapshots.rememberMatchElos(playerState.data.id, matches);
    if (!this.#isCurrent(revision)) return;
    const maps = mapsState.status === "ready" ? mapsState.data : [];
    if (history) this.#overlay.showHistory(playerState.data, matches);
    else this.#overlay.showProfile(playerState.data, matches, maps);
  }

  async #loadMatch(matchId: string, revision: number, renderOverlay: boolean): Promise<void> {
    this.#overlay.hideRoutePanels();
    const matchState = await this.#cached<MatchContext>(
      `match:${matchId}`,
      () => this.#adapter.getMatch(matchId),
      CACHE_TTLS.activeMatch
    );
    if (!this.#isCurrent(revision)) return;
    if (matchState.status !== "ready" || !matchState.data) {
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
    this.#publishMapPool(match.mapPool);
    if (match.status === "finished") this.#cache.set(`match:${matchId}`, matchState, CACHE_TTLS.finishedMatch);
    const limit = requestedWindow(this.#settings.statsWindow);
    const players = match.teams.flatMap((team) => team.players);
    await Promise.all(players.map((player) => this.#snapshots.recordPlayer(player)));
    if (!this.#isCurrent(revision)) return;
    if (!renderOverlay) {
      this.#currentPlayerMatches.clear();
      this.#currentPlayerMapStats.clear();
      await this.#maybeSendAutomaticPosition();
      return;
    }

    const states = await Promise.all(players.map(async (player) => [
      player.id,
      await this.#cached<PlayerMatch[]>(
        `matches:${player.id}:${limit}`,
        () => this.#adapter.getRecentMatches(player.id, limit),
        CACHE_TTLS.playerStats,
      ),
    ] as const));
    if (!this.#isCurrent(revision)) return;
    const matches = new Map<string, PlayerMatch[]>();
    for (const [playerId, matchesState] of states) {
      if (matchesState.status !== "ready") {
        matches.set(playerId, []);
        continue;
      }
      const hydrated = await this.#snapshots.hydrateMatchElos(playerId, matchesState.data);
      if (!this.#isCurrent(revision)) return;
      await this.#snapshots.rememberMatchElos(playerId, hydrated);
      if (!this.#isCurrent(revision)) return;
      matches.set(playerId, hydrated);
    }
    if (!this.#isCurrent(revision)) return;
    const mapStats = this.#cachedPlayerMapStats(players);
    this.#currentPlayerMatches = matches;
    this.#currentPlayerMapStats = mapStats;
    this.#overlay.showMatch(match, matches, mapStats);
    void this.#loadPlayerMapStats(match, players, revision).catch(() => undefined);
    await this.#maybeSendAutomaticPosition();
  }

  #cachedPlayerMapStats(players: readonly Player[]): Map<string, PlayerMapStats[]> {
    const result = new Map<string, PlayerMapStats[]>();
    for (const player of players) {
      const state = this.#cache.peek(`maps:${player.id}`) as DataState<PlayerMapStats[]> | undefined;
      if (state?.status === "ready") result.set(player.id, state.data);
    }
    return result;
  }

  async #loadPlayerMapStats(match: MatchContext, players: readonly Player[], revision: number): Promise<void> {
    const states = await Promise.all(players.map(async (player) => [
      player.id,
      await this.#loadRoomPlayerMapStats(match.id, player.id, revision),
    ] as const));
    const currentMatch = this.#currentMatch;
    if (!this.#isCurrent(revision) || currentMatch?.id !== match.id) return;

    const mapStats = new Map<string, PlayerMapStats[]>();
    for (const [playerId, state] of states) {
      if (state.status === "ready") mapStats.set(playerId, state.data);
    }
    this.#currentPlayerMapStats = mapStats;
    if (this.#settings.interfaceVisibility.matchRoom) {
      this.#overlay.syncMatchInline(currentMatch, this.#currentPlayerMatches, mapStats);
    }
  }

  async #loadRoomPlayerMapStats(
    matchId: string,
    playerId: string,
    revision: number,
  ): Promise<DataState<PlayerMapStats[]>> {
    const cacheKey = `maps:${playerId}`;
    const cached = this.#cache.peek(cacheKey) as DataState<PlayerMapStats[]> | undefined;
    if (cached) return cached;

    const requestKey = `room-maps:${matchId}:${revision}:${playerId}`;
    return this.#cache.get(requestKey, async () => {
      if (!this.#isCurrent(revision) || this.#currentMatch?.id !== matchId) {
        return {
          status: "error",
          error: { code: "stale-route", message: "Route changed before the request started", retryable: false },
        } satisfies DataState<PlayerMapStats[]>;
      }
      const state = await this.#adapter.getPlayerMapStats(playerId);
      if (this.#isCurrent(revision) && this.#currentMatch?.id === matchId) {
        this.#cache.set(cacheKey, state, CACHE_TTLS.playerStats);
      }
      return state;
    }, { ttlMs: 0, cache: false }) as Promise<DataState<PlayerMapStats[]>>;
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
    if (this.#destroyed) return;
    this.#runAutomations();
    if (this.#route.kind === "profile") {
      if (this.#capabilities.profile && this.#settings.interfaceVisibility.profile) {
        this.#overlay.syncProfileInline("profile");
      }
      return;
    }
    if (this.#route.kind === "history") {
      if (this.#capabilities.history && this.#settings.interfaceVisibility.history) {
        this.#overlay.syncProfileInline("history");
      }
      return;
    }
    if (this.#route.kind !== "match" || !this.#currentMatch) return;
    if (this.#settings.interfaceVisibility.matchRoom) {
      this.#overlay.syncMatchInline(this.#currentMatch, this.#currentPlayerMatches, this.#currentPlayerMapStats);
    }
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
    this.#publishMapPool(this.#currentMatch.mapPool);
    if (this.#settings.interfaceVisibility.matchRoom) {
      this.#overlay.showMatch(this.#currentMatch, this.#currentPlayerMatches, this.#currentPlayerMapStats);
    }
    await this.#maybeSendAutomaticPosition();
  }

  async #maybeSendAutomaticPosition(): Promise<void> {
    if (this.#destroyed) return;
    const selected = this.#currentMatch?.selectedMap;
    const status = this.#currentMatch?.status;
    if (
      !selected ||
      !status ||
      !allowsAutomaticPosition(status) ||
      !this.#capabilities.quickPositions ||
      !isSelectedMapVisible(document, selected)
    ) return;
    const position = positionForMap(this.#settings, selected);
    if (position?.enabled && position.mode === "auto") {
      await this.#positionSender.send(
        document,
        this.#currentMatch?.id ?? "",
        selected,
        position.message,
        "auto",
        this.#lifecycle.signal
      );
    }
  }

  #runAutomations(): void {
    if (this.#destroyed) return;
    this.#automations.run(document, this.#route, this.#settings.automations, this.#capabilities);
  }

  #isCurrent(revision: number): boolean {
    return !this.#destroyed && revision === this.#routeRevision;
  }

  #publishMapPool(mapIds: readonly MapId[]): void {
    try {
      this.options.onMapPoolChange?.([...new Set(mapIds)]);
    } catch {
      // UI integration callbacks must never break the native FACEIT route.
    }
  }
}
