import type { AutomationSettings } from "@eloscope/core";
import type { Capabilities } from "./compatibility";
import { clickUniqueVisible, escapeSelector, findUniqueVisible, type DomRoot } from "./dom";
import type { FaceitRoute } from "./routes";

const CONTRACT = {
  partyAccept: [
    '[data-testid="party-invite-accept"]',
    '[data-eloscope-contract="party-invite-accept"]'
  ],
  readyUp: ['[data-testid="match-ready-button"]', '[data-eloscope-contract="match-ready"]'],
  captainTurn: [
    '[data-testid="veto-your-turn"][data-state="active"]',
    '[data-eloscope-contract="veto-turn"][data-active="true"]'
  ],
  serverPhase: [
    '[data-testid="server-veto"][data-state="active"]',
    '[data-eloscope-contract="server-veto-phase"][data-active="true"]'
  ],
  connect: ['a[data-testid="connect-to-server"][href^="steam://connect/"]', 'a[data-eloscope-contract="server-connect"][href^="steam://connect/"]'],
  copyServer: ['button[data-testid="copy-server-connection"]', 'button[data-eloscope-contract="copy-server"]']
} as const;

export type AutomationAction =
  | "partyAccept"
  | "readyUp"
  | "mapVeto"
  | "serverVeto"
  | "connect"
  | "copyServerData";

export type AutomationRunResult = { action: AutomationAction | null; clicked: boolean; reason?: string };

function routeMatchRoot(root: DomRoot, route: FaceitRoute): DomRoot | null {
  if (route.kind !== "match") return null;
  const declared = [...root.querySelectorAll<HTMLElement>("[data-match-id]")];
  const matches = declared.filter((element) => element.dataset.matchId === route.matchId);
  // Official pages do not consistently expose a match root. The URL itself is
  // authoritative; a conflicting explicit id is a hard stop.
  if (matches.length === 1 && declared.length === 1) return matches[0] ?? null;
  return declared.length === 0 ? root : null;
}

function exactlyOneTurn(root: DomRoot): boolean {
  return findUniqueVisible(root, CONTRACT.captainTurn) !== null;
}

function mapButton(root: DomRoot, action: "ban" | "pick", map: string): string[] {
  const safe = escapeSelector(map);
  return [
    `button[data-testid="veto-map-${safe}"][data-veto-action="${action}"]`,
    `button[data-eloscope-contract="veto-map"][data-map-id="${safe}"][data-veto-action="${action}"]`
  ];
}

function serverButton(root: DomRoot, location: string): string[] {
  const safe = escapeSelector(location);
  return [
    `button[data-testid="veto-server-${safe}"]`,
    `button[data-eloscope-contract="veto-server"][data-server-id="${safe}"]`
  ];
}

export class VisibleDomAutomationRunner {
  readonly #acted = new Set<string>();

  resetForRoute(): void {
    this.#acted.clear();
  }

  run(
    root: DomRoot,
    route: FaceitRoute,
    settings: AutomationSettings,
    capabilities: Capabilities
  ): AutomationRunResult {
    if (settings.partyAccept && capabilities.partyAccept && !this.#acted.has("partyAccept")) {
      const clicked = clickUniqueVisible(root, CONTRACT.partyAccept);
      if (clicked) this.#acted.add("partyAccept");
      if (clicked) return { action: "partyAccept", clicked };
    }

    const matchRoot = routeMatchRoot(root, route);
    if (!matchRoot) return { action: null, clicked: false, reason: "not-an-unambiguous-match-room" };

    if (settings.readyUp && capabilities.readyUp && !this.#acted.has("readyUp")) {
      const clicked = clickUniqueVisible(matchRoot, CONTRACT.readyUp);
      if (clicked) this.#acted.add("readyUp");
      if (clicked) return { action: "readyUp", clicked };
    }

    if (settings.mapVeto.enabled && capabilities.mapVeto && exactlyOneTurn(matchRoot)) {
      const actionNode = findUniqueVisible(matchRoot, [
        '[data-testid="veto-action"][data-action="ban"]',
        '[data-testid="veto-action"][data-action="pick"]',
        '[data-eloscope-contract="veto-action"][data-action]'
      ]);
      const action = actionNode?.dataset.action;
      if (action === "ban" || action === "pick") {
        const order = action === "ban" ? settings.mapVeto.banOrder : settings.mapVeto.pickOrder;
        for (const map of order) {
          const key = `map:${action}:${map}`;
          if (this.#acted.has(key)) continue;
          if (clickUniqueVisible(matchRoot, mapButton(matchRoot, action, map))) {
            this.#acted.add(key);
            return { action: "mapVeto", clicked: true };
          }
        }
      }
    }

    if (
      settings.serverVeto.enabled &&
      capabilities.serverVeto &&
      exactlyOneTurn(matchRoot) &&
      findUniqueVisible(matchRoot, CONTRACT.serverPhase) !== null
    ) {
      for (const location of settings.serverVeto.order) {
        const key = `server:${location}`;
        if (this.#acted.has(key)) continue;
        if (clickUniqueVisible(matchRoot, serverButton(matchRoot, location))) {
          this.#acted.add(key);
          return { action: "serverVeto", clicked: true };
        }
      }
    }

    if (settings.autoConnect && capabilities.connect && !this.#acted.has("connect")) {
      const target = findUniqueVisible(matchRoot, CONTRACT.connect);
      const clicked = target instanceof HTMLAnchorElement && target.href.startsWith("steam://connect/");
      if (clicked) {
        target.dataset.eloscopeAutoConnect = "armed";
        target.click();
        queueMicrotask(() => { delete target.dataset.eloscopeAutoConnect; });
      }
      if (clicked) this.#acted.add("connect");
      if (clicked) return { action: "connect", clicked };
    }

    if (settings.copyServerData && capabilities.copyServerData && !this.#acted.has("copy")) {
      const clicked = clickUniqueVisible(matchRoot, CONTRACT.copyServer);
      if (clicked) this.#acted.add("copy");
      if (clicked) return { action: "copyServerData", clicked };
    }

    return { action: null, clicked: false };
  }
}
