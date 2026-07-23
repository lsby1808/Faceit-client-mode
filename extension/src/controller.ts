import {
  CACHE_TTLS,
  RequestCache,
  type DataState,
  type MatchContext,
  type MapId,
  type Player,
  type PlayerMapStats,
  type PlayerMatch,
  type StatsWindow,
  type Viewer,
  loadingState,
} from "@eloscope/core";
import { VisibleDomAutomationRunner } from "./automations";
import { FaceitBridgeAdapter } from "./bridge-client";
import { BUILT_IN_CAPABILITIES, loadCompatibility, type Capabilities, type CompatibilityStatus } from "./compatibility";
import { debugLog, type DebugStatus } from "./debug-log";
import { observeScopedDom } from "./dom";
import type { InlineMatchRenderResult } from "./inline-match";
import { isSelectedMapVisible, QuickPositionSender, visibleSelectedMap } from "./positions";
import { MAIN_SOURCE, PROTOCOL_VERSION, type MainMessage } from "./protocol";
import { parseFaceitRoute, type FaceitRoute } from "./routes";
import { loadSettings, positionForMap, saveSettings, type ExtensionSettings } from "./settings";
import { EloSnapshotStore } from "./snapshots";
import { EloScopeOverlay } from "./ui";

type CachedState = DataState<unknown>;

export type ControllerOptions = {
  onMapPoolChange?: (mapIds: readonly MapId[]) => void;
};

function requestedWindow(window: StatsWindow): StatsWindow {
  return window < 30 ? 30 : window;
}

const AUTOMATIC_POSITION_MATCH_STATES = new Set(["voting", "configuring", "ready"]);
const MATCH_BOOTSTRAP_RETRY_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000] as const;

export function allowsAutomaticPosition(status: string): boolean {
  return AUTOMATIC_POSITION_MATCH_STATES.has(status.trim().toLowerCase());
}

export function shouldRetryMatchBootstrap(state: DataState<MatchContext>): boolean {
  if (state.status === "restricted") return state.reason === "rate-limited";
  if (state.status !== "error") return false;
  return state.error.retryable
    || state.error.code === "upstream"
    || state.error.code === "upstream-shape";
}

function stateStatus(state: DataState<unknown>): DebugStatus {
  if (state.status === "ready") return "ready";
  if (state.status === "restricted") return "restricted";
  if (state.status === "loading") return "loading";
  return "error";
}

export function routeIdentity(route: FaceitRoute): string {
  if (route.kind === "profile") {
    return `${route.kind}:${route.nickname.toLowerCase()}:${route.section}`;
  }
  if (route.kind === "history") return `${route.kind}:${route.nickname.toLowerCase()}`;
  if (route.kind === "match") return `match:${route.matchId}`;
  return route.kind;
}

export function viewerTeamIdForMatch(match: MatchContext, viewer: Viewer): string | undefined {
  const matchingTeams = match.teams.filter((team) =>
    team.players.some((player) => player.id === viewer.id));
  return matchingTeams.length === 1 ? matchingTeams[0]?.id : undefined;
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
  #currentViewerTeamId: string | undefined;
  #currentTierPlayer: Player | undefined;
  #currentProfileMatches: DataState<PlayerMatch[]> | undefined;
  #routeRevision = 0;
  #matchRetryTimer: number | undefined;
  #matchRetryAttempt = 0;
  #lastAutomationSignature = "";
  #lastRenderSignature = "";
  #lastNativeRenderSignature = "";
  #stopObserver: (() => void) | undefined;
  #destroyed = false;
  readonly #lifecycle = new AbortController();

  constructor(private readonly options: ControllerOptions = {}) {}

  async start(): Promise<void> {
    if (this.#destroyed) return;
    debugLog.record({
      component: "controller",
      event: "controller.start",
      route: this.#route.kind,
      status: "started",
    });
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
        if (this.#destroyed || this.#route.kind !== "match" || !this.#capabilities.quickPositions) {
          debugLog.record({
            component: "position",
            event: "position.result",
            route: this.#route.kind,
            mode,
            status: "chat-unavailable",
          });
          return "chat-unavailable";
        }
        const position = positionForMap(this.#settings, map);
        if (
          !this.#currentMatch?.selectedMap ||
          this.#currentMatch.selectedMap.toLowerCase() !== map.toLowerCase() ||
          !position?.enabled ||
          !isSelectedMapVisible(document, map)
        ) {
          debugLog.record({
            component: "position",
            event: "position.result",
            route: this.#route.kind,
            mode,
            status: "chat-unavailable",
          });
          return "chat-unavailable";
        }
        const result = await this.#positionSender.send(
          document,
          this.#route.matchId,
          map,
          message,
          mode,
          this.#lifecycle.signal,
        );
        debugLog.record({
          component: "position",
          event: "position.result",
          route: this.#route.kind,
          mode,
          status: result,
        });
        return result;
      }
    });

    const compatibility = await loadCompatibility({ signal: this.#lifecycle.signal });
    if (this.#destroyed) return;
    this.#capabilities = compatibility.capabilities;
    this.#compatibilityStatus = compatibility.status;
    this.#overlay.setCompatibility(this.#compatibilityStatus);
    debugLog.record({
      component: "controller",
      event: "controller.compatibility",
      route: this.#route.kind,
      status: this.#compatibilityStatus,
      count: Object.values(this.#capabilities).filter(Boolean).length,
      total: Object.keys(this.#capabilities).length,
    });

    window.addEventListener("message", this.#routeMessage);
    this.#stopObserver = observeScopedDom(() => { void this.#handleDomMutation(); });
    await this.navigate(location.pathname);
    debugLog.record({
      component: "controller",
      event: "controller.ready",
      route: this.#route.kind,
      status: "ready",
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    debugLog.record({
      component: "controller",
      event: "controller.destroy",
      route: this.#route.kind,
    });
    this.#destroyed = true;
    this.#lifecycle.abort();
    this.#routeRevision += 1;
    this.#cancelMatchRetry();
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
    this.#cancelMatchRetry();
    this.#matchRetryAttempt = 0;
    const nextRoute = parseFaceitRoute(pathname);
    const nextIdentity = routeIdentity(nextRoute);
    this.#route = nextRoute;
    debugLog.record({
      component: "controller",
      event: "controller.navigate",
      route: nextRoute.kind,
      revision,
    });
    if (nextIdentity !== this.#routeIdentity) {
      this.#currentTierPlayer = undefined;
      this.#currentProfileMatches = undefined;
      this.#routeIdentity = nextIdentity;
      this.#automations.resetForRoute();
      this.#lastAutomationSignature = "";
      this.#lastRenderSignature = "";
      this.#lastNativeRenderSignature = "";
      if (nextRoute.kind === "match") {
        this.#currentMatch = undefined;
        this.#currentPlayerMatches.clear();
        this.#currentPlayerMapStats.clear();
        this.#currentViewerTeamId = undefined;
        this.#publishMapPool([]);
      }
    }
    if (nextRoute.kind !== "match") {
      this.#currentMatch = undefined;
      this.#currentPlayerMatches.clear();
      this.#currentPlayerMapStats.clear();
      this.#currentViewerTeamId = undefined;
      this.#publishMapPool([]);
    }

    switch (this.#route.kind) {
      case "logged-out":
      case "other":
        this.#currentTierPlayer = undefined;
        this.#overlay.hideRoutePanels();
        break;
      case "matchmaking":
        if (!this.#settings.showExtendedTier) {
          this.#currentTierPlayer = undefined;
          this.#overlay.hideRoutePanels();
        } else {
          await this.#loadMatchmakingTier(revision);
        }
        break;
      case "profile":
        if (
          !this.#capabilities.profile
          || (
            !this.#settings.showExtendedTier
            && !(
              this.#route.section === "summary"
              && this.#settings.interfaceVisibility.profileStatsBanner
            )
          )
        ) {
          this.#currentTierPlayer = undefined;
          this.#currentProfileMatches = undefined;
          this.#overlay.hideRoutePanels();
        } else await this.#loadProfile(
          this.#route.nickname,
          this.#route.section === "stats",
          this.#settings.showExtendedTier,
          this.#route.section === "summary"
            && this.#settings.interfaceVisibility.profileStatsBanner,
          revision,
        );
        break;
      case "history":
        if (!this.#capabilities.history || !this.#settings.showExtendedTier) {
          this.#currentTierPlayer = undefined;
          this.#overlay.hideRoutePanels();
        } else await this.#loadProfile(
          this.#route.nickname,
          false,
          true,
          false,
          revision,
        );
        break;
      case "match":
        if (!this.#capabilities.matchRoom) {
          debugLog.record({
            component: "controller",
            event: "controller.load",
            route: this.#route.kind,
            operation: "match",
            status: "disabled",
          });
          this.#overlay.hideRoutePanels();
        }
        else await this.#loadMatch(
          this.#route.matchId,
          revision,
          this.#settings.interfaceVisibility.matchRoom
        );
        break;
    }
    if (this.#isCurrent(revision)) this.#runAutomations();
  }

  async #loadMatchmakingTier(revision: number): Promise<void> {
    this.#currentTierPlayer = undefined;
    this.#overlay.hideRoutePanels();
    const viewerState = await this.#cached<Viewer>(
      "viewer",
      () => this.#adapter.getViewer(),
      CACHE_TTLS.playerStats,
    );
    if (!this.#isCurrent(revision) || viewerState.status !== "ready" || !viewerState.data) return;
    const playerState = await this.#cached<Player>(
      `player:${viewerState.data.nickname.toLowerCase()}`,
      () => this.#adapter.getPlayer(viewerState.data.nickname),
      CACHE_TTLS.playerStats,
    );
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "player",
      status: stateStatus(playerState),
    });
    if (!this.#isCurrent(revision) || playerState.status !== "ready" || !playerState.data) return;
    this.#currentTierPlayer = playerState.data;
    this.#recordNativeRender(
      "render.matchmaking",
      this.#overlay.showMatchmakingTier(playerState.data),
    );
  }

  async #loadProfile(
    nickname: string,
    includeProgressRail: boolean,
    renderTier: boolean,
    renderStatsBanner: boolean,
    revision: number,
  ): Promise<void> {
    this.#currentTierPlayer = undefined;
    this.#currentProfileMatches = undefined;
    this.#overlay.hideRoutePanels();
    const playerState = await this.#cached<Player>(
      `player:${nickname.toLowerCase()}`,
      () => this.#adapter.getPlayer(nickname),
      CACHE_TTLS.playerStats
    );
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "player",
      status: stateStatus(playerState),
    });
    if (!this.#isCurrent(revision)) return;
    if (playerState.status !== "ready" || !playerState.data) return;
    this.#currentTierPlayer = playerState.data;
    if (renderTier) {
      this.#recordNativeRender(
        "render.profile",
        this.#overlay.showProfileTier(playerState.data, includeProgressRail),
      );
    }
    await this.#snapshots.recordPlayer(playerState.data);
    if (!this.#isCurrent(revision) || !renderStatsBanner) return;

    this.#currentProfileMatches = loadingState<PlayerMatch[]>();
    this.#overlay.showProfileStats(playerState.data, this.#currentProfileMatches);
    const matchesState = await this.#cached<PlayerMatch[]>(
      `matches:${playerState.data.id}:30`,
      // Fetch a small buffer so duplicate or ineligible upstream rows do not
      // silently shrink the truthful newest-20 sample rendered by the model.
      () => this.#adapter.getRecentMatches(playerState.data.id, 30),
      CACHE_TTLS.playerStats,
    );
    if (!this.#isCurrent(revision) || this.#route.kind !== "profile" || this.#route.section !== "summary") {
      return;
    }
    this.#currentProfileMatches = matchesState;
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "recentMatches",
      status: stateStatus(matchesState),
      count: matchesState.status === "ready" ? matchesState.data.length : 0,
    });
    this.#overlay.showProfileStats(playerState.data, matchesState);
  }

  async #loadMatch(matchId: string, revision: number, renderOverlay: boolean): Promise<void> {
    this.#overlay.hideRoutePanels();
    const matchState = await this.#cached<MatchContext>(
      `match:${matchId}`,
      () => this.#adapter.getMatch(matchId),
      CACHE_TTLS.activeMatch
    );
    if (!this.#isCurrent(revision)) return;
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "match",
      status: stateStatus(matchState),
      count: matchState.status === "ready"
        ? matchState.data.teams.flatMap((team) => team.players).length
        : 0,
    });
    if (matchState.status !== "ready" || !matchState.data) {
      if (shouldRetryMatchBootstrap(matchState)) this.#scheduleMatchRetry(matchId, revision);
      return;
    }
    this.#cancelMatchRetry();
    this.#matchRetryAttempt = 0;

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
    void this.#loadMatchViewerTeam(match, revision).catch(() => {
      this.#recordControllerError();
    });

    const cachedMapStats = this.#cachedPlayerMapStats(players);
    this.#currentPlayerMatches = new Map();
    this.#currentPlayerMapStats = cachedMapStats;
    this.#recordRender(this.#overlay.showMatch(
      match,
      this.#currentPlayerMatches,
      cachedMapStats,
      this.#currentViewerTeamId,
    ));

    const states = await Promise.all(players.map(async (player) => [
      player.id,
      await this.#cached<PlayerMatch[]>(
        `matches:${player.id}:${limit}`,
        () => {
          if (!this.#isCurrent(revision) || this.#currentMatch?.id !== match.id) {
            return Promise.resolve({
              status: "error",
              error: { code: "stale-route", message: "Route changed before the request started", retryable: false },
            } satisfies DataState<PlayerMatch[]>);
          }
          return this.#adapter.getRecentMatches(player.id, limit);
        },
        CACHE_TTLS.playerStats,
      ),
    ] as const));
    if (!this.#isCurrent(revision)) return;
    const matches = new Map<string, PlayerMatch[]>();
    let readyMatchHistories = 0;
    for (const [playerId, matchesState] of states) {
      if (matchesState.status !== "ready") {
        matches.set(playerId, []);
        continue;
      }
      readyMatchHistories += 1;
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
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "recentMatches",
      status: readyMatchHistories === players.length ? "ready" : "error",
      count: readyMatchHistories,
      total: players.length,
    });
    this.#recordRender(this.#overlay.showMatch(
      match,
      matches,
      mapStats,
      this.#currentViewerTeamId,
    ));
    void this.#loadPlayerMapStats(match, players, revision).catch(() => {
      this.#recordControllerError();
    });
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

  async #loadMatchViewerTeam(match: MatchContext, revision: number): Promise<void> {
    const viewerState = await this.#cached<Viewer>(
      "viewer",
      () => this.#adapter.getViewer(),
      CACHE_TTLS.playerStats,
    );
    if (!this.#isCurrent(revision) || this.#currentMatch?.id !== match.id) return;
    this.#currentViewerTeamId = viewerState.status === "ready" && viewerState.data
      ? viewerTeamIdForMatch(match, viewerState.data)
      : undefined;
    if (this.#settings.interfaceVisibility.matchRoom && this.#currentPlayerMatches.size > 0) {
      this.#recordRender(this.#overlay.syncMatchInline(
        this.#currentMatch,
        this.#currentPlayerMatches,
        this.#currentPlayerMapStats,
        this.#currentViewerTeamId,
      ));
    }
  }

  async #loadPlayerMapStats(match: MatchContext, players: readonly Player[], revision: number): Promise<void> {
    const states = await Promise.all(players.map(async (player) => [
      player.id,
      await this.#loadRoomPlayerMapStats(match.id, player.id, revision),
    ] as const));
    const currentMatch = this.#currentMatch;
    if (!this.#isCurrent(revision) || currentMatch?.id !== match.id) return;

    const mapStats = new Map<string, PlayerMapStats[]>();
    let readyMapStats = 0;
    for (const [playerId, state] of states) {
      if (state.status === "ready") {
        mapStats.set(playerId, state.data);
        readyMapStats += 1;
      }
    }
    this.#currentPlayerMapStats = mapStats;
    debugLog.record({
      component: "controller",
      event: "controller.load",
      route: this.#route.kind,
      operation: "playerMapStats",
      status: readyMapStats === players.length ? "ready" : "error",
      count: readyMapStats,
      total: players.length,
    });
    if (this.#settings.interfaceVisibility.matchRoom) {
      this.#recordRender(this.#overlay.syncMatchInline(
        currentMatch,
        this.#currentPlayerMatches,
        mapStats,
        this.#currentViewerTeamId,
      ));
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
    const cached = this.#cache.peek(key) as DataState<T> | undefined;
    if (cached) return cached;
    const state = await this.#cache.get(
      key,
      loader as () => Promise<CachedState>,
      { ttlMs: 0, cache: false },
    ) as DataState<T>;
    if (state.status === "ready") this.#cache.set(key, state as CachedState, ttlMs);
    return state;
  }

  #scheduleMatchRetry(matchId: string, revision: number): void {
    if (
      this.#destroyed
      || !this.#isCurrent(revision)
      || this.#route.kind !== "match"
      || this.#route.matchId !== matchId
      || this.#matchRetryTimer !== undefined
      || this.#matchRetryAttempt >= MATCH_BOOTSTRAP_RETRY_DELAYS.length
    ) return;

    const delay = MATCH_BOOTSTRAP_RETRY_DELAYS[this.#matchRetryAttempt] as number;
    this.#matchRetryAttempt += 1;
    debugLog.record({
      level: "warn",
      component: "controller",
      event: "controller.retry",
      route: this.#route.kind,
      operation: "match",
      attempt: this.#matchRetryAttempt,
      delayMs: delay,
    });
    this.#matchRetryTimer = window.setTimeout(() => {
      this.#matchRetryTimer = undefined;
      if (
        this.#destroyed
        || !this.#isCurrent(revision)
        || this.#route.kind !== "match"
        || this.#route.matchId !== matchId
      ) return;
      this.#cache.delete(`match:${matchId}`);
      void this.#loadMatch(
        matchId,
        revision,
        this.#settings.interfaceVisibility.matchRoom,
      ).catch(() => {
        this.#recordControllerError();
        this.#scheduleMatchRetry(matchId, revision);
      });
    }, delay);
  }

  #cancelMatchRetry(): void {
    if (this.#matchRetryTimer === undefined) return;
    window.clearTimeout(this.#matchRetryTimer);
    this.#matchRetryTimer = undefined;
  }

  async #handleDomMutation(): Promise<void> {
    if (this.#destroyed) return;
    this.#runAutomations();
    if (this.#route.kind === "profile") {
      if (this.#currentTierPlayer && this.#settings.showExtendedTier) {
        this.#recordNativeRender(
          "render.profile",
          this.#overlay.syncProfileTier(
            this.#currentTierPlayer,
            this.#route.section === "stats",
          ),
        );
      }
      if (
        this.#route.section === "summary"
        && this.#settings.interfaceVisibility.profileStatsBanner
        && this.#currentTierPlayer
        && this.#currentProfileMatches
      ) {
        this.#overlay.syncProfileStats();
      }
      return;
    }
    if (this.#route.kind === "history") {
      if (this.#currentTierPlayer) {
        this.#recordNativeRender(
          "render.profile",
          this.#overlay.syncProfileTier(this.#currentTierPlayer, false),
        );
      }
      return;
    }
    if (this.#route.kind === "matchmaking") {
      if (this.#currentTierPlayer) {
        this.#recordNativeRender(
          "render.matchmaking",
          this.#overlay.syncMatchmakingTier(this.#currentTierPlayer),
        );
      }
      return;
    }
    if (this.#route.kind !== "match" || !this.#currentMatch) return;
    if (this.#settings.interfaceVisibility.matchRoom) {
      this.#recordRender(this.#overlay.syncMatchInline(
        this.#currentMatch,
        this.#currentPlayerMatches,
        this.#currentPlayerMapStats,
        this.#currentViewerTeamId,
      ));
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
      this.#recordRender(this.#overlay.showMatch(
        this.#currentMatch,
        this.#currentPlayerMatches,
        this.#currentPlayerMapStats,
        this.#currentViewerTeamId,
      ));
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
      const result = await this.#positionSender.send(
        document,
        this.#currentMatch?.id ?? "",
        selected,
        position.message,
        "auto",
        this.#lifecycle.signal
      );
      debugLog.record({
        component: "position",
        event: "position.result",
        route: this.#route.kind,
        mode: "auto",
        status: result,
      });
    }
  }

  #runAutomations(): void {
    if (this.#destroyed) return;
    const result = this.#automations.run(
      document,
      this.#route,
      this.#settings.automations,
      this.#capabilities,
    );
    if (!result) {
      this.#recordControllerError();
      return;
    }
    const signature = `${result.action ?? "none"}:${result.clicked}:${result.reason ?? ""}`;
    if (!result.action && !result.reason) {
      this.#lastAutomationSignature = "";
      return;
    }
    if (!result.clicked && signature === this.#lastAutomationSignature) return;
    this.#lastAutomationSignature = signature;
    debugLog.record({
      component: "automation",
      event: "automation.result",
      route: this.#route.kind,
      ...(result.action ? { action: result.action } : {}),
      status: result.clicked ? "clicked" : "skipped",
      ...(result.reason === "not-an-unambiguous-match-room"
        ? { reason: result.reason }
        : {}),
    });
  }

  #recordNativeRender(
    event: "render.matchmaking" | "render.profile",
    mounted: number | undefined,
  ): void {
    const count = typeof mounted === "number" && Number.isFinite(mounted)
      ? Math.max(0, Math.round(mounted))
      : 0;
    const signature = `${event}:${count}`;
    if (signature === this.#lastNativeRenderSignature) return;
    this.#lastNativeRenderSignature = signature;
    debugLog.record({
      level: count > 0 ? "info" : "warn",
      component: "render",
      event,
      route: this.#route.kind,
      status: count > 0 ? "rendered" : "incompatible",
      count,
    });
  }

  #recordRender(result: InlineMatchRenderResult | undefined): void {
    if (!result) {
      this.#recordControllerError();
      return;
    }
    const signature = result.status === "rendered"
      ? `${result.status}:${result.players}:${result.teams}:${result.updated}`
      : `${result.status}:${result.reason}`;
    if (signature === this.#lastRenderSignature) return;
    this.#lastRenderSignature = signature;
    debugLog.record({
      level: result.status === "rendered" ? "info" : "warn",
      component: "render",
      event: "render.match",
      route: this.#route.kind,
      status: result.status,
      ...(result.status === "rendered"
        ? {
            count: result.players,
            total: result.teams,
            updated: result.updated,
          }
        : { reason: result.reason }),
    });
  }

  #recordControllerError(): void {
    debugLog.record({
      level: "error",
      component: "controller",
      event: "controller.error",
      route: this.#route.kind,
      errorCode: "controller",
    });
  }

  #isCurrent(revision: number): boolean {
    return !this.#destroyed && revision === this.#routeRevision;
  }

  #publishMapPool(mapIds: readonly MapId[]): void {
    debugLog.record({
      component: "controller",
      event: "controller.map-pool",
      route: this.#route.kind,
      count: new Set(mapIds).size,
    });
    try {
      this.options.onMapPoolChange?.([...new Set(mapIds)]);
    } catch {
      // UI integration callbacks must never break the native FACEIT route.
    }
  }
}
