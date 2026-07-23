import {
  getEloTier,
  getEloTierPresentation,
  getEloTierProgress,
  getOfficialEloLevel,
  type EloScopeTier,
  type Player,
} from "@eloscope/core";

const NATIVE_SKILL_ICON_SELECTOR = 'svg[class*="SkillIcon__StyledSvg"]';
const MATCHMAKING_WIDGET_SELECTOR = '[class*="EloWidget-module__"][class*="__widgetContainer"]';
const MATCHMAKING_ELO_SELECTOR = '[class*="style__EloValueRow-sc-"]';
const MATCHMAKING_PARTY_PLAYER_SELECTOR = '[class*="styles__PlayerCardContainer-sc-"]';
const PROFILE_MAIN_LEVEL_SELECTOR = '[class*="styles__SkillIconContainer-sc-"]';
const PROFILE_CURRENT_LEVEL_SELECTOR = '[class*="styles__CurrentElo-sc-"]';
const PROFILE_PROGRESS_SELECTOR = '[class*="styles__SkillLevelsSection-sc-"]';
const PROFILE_NEXT_LEVEL_SELECTOR = '[class*="styles__NextLevel-sc-"]';
const EXCLUDED_ICON_ANCESTOR_SELECTOR = [
  "a",
  '[class*="Roster__Group-sc-"]',
  '[class*="ListContentPlayer__Background-sc-"]',
].join(",");

export const NATIVE_TIER_ATTRIBUTE = "data-eloscope-native-tier";
export const NATIVE_TIER_RAIL_ATTRIBUTE = "data-eloscope-native-tier-rail";

type TierSurface = "matchmaking" | "profile";
type TierSlot = "main" | "party" | "current";

type EligibleTier = Readonly<{
  elo: number;
  officialLevel: number;
  tier: EloScopeTier;
}>;

type PreservedVisibility = Readonly<{
  display: string;
  displayPriority: string;
  ariaHidden: string | null;
}>;

type TierMount = PreservedVisibility & {
  key: string;
  host: HTMLSpanElement;
  native: SVGSVGElement;
  signature: string;
};

type RailMount = PreservedVisibility & {
  key: string;
  host: HTMLDivElement;
  native: HTMLElement;
  signature: string;
};

const TIER_FLOORS = [
  100,
  801,
  951,
  1_101,
  1_251,
  1_401,
  1_551,
  1_701,
  1_851,
  2_001,
  2_251,
  2_501,
  2_751,
  3_001,
  3_251,
  3_501,
  3_751,
  4_001,
  4_251,
  4_501,
] as const;

const NATIVE_TIER_LAYOUT_PROPERTIES = [
  "grid-area",
  "align-self",
  "justify-self",
] as const;

const TIER_ICON_STYLES = `
  :host {
    --es-native-tier-size: 32px;
    display: inline-grid !important;
    flex: 0 0 var(--es-native-tier-size);
    inline-size: var(--es-native-tier-size);
    block-size: var(--es-native-tier-size);
    place-items: center;
    vertical-align: middle;
  }
  .tier {
    box-sizing: border-box;
    display: grid;
    inline-size: 100%;
    block-size: 100%;
    place-items: center;
    border: max(2px, calc(var(--es-native-tier-size) * .075)) solid var(--tier-fg);
    border-radius: 50%;
    background: var(--tier-bg);
    box-shadow: 0 0 max(5px, calc(var(--es-native-tier-size) * .18)) var(--tier-glow);
    color: var(--tier-fg);
    font: 900 max(10px, calc(var(--es-native-tier-size) * .38))/1 system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .tier:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
`;

const TIER_RAIL_STYLES = `
  :host {
    color-scheme: dark;
    display: block !important;
    min-inline-size: 0;
    inline-size: 100%;
  }
  .rail {
    box-sizing: border-box;
    display: grid;
    gap: 12px;
    inline-size: 100%;
    padding: 14px 16px;
    border: 1px solid #2a3037;
    border-radius: 8px;
    background: #0b0f13;
    color: #f5f7fa;
    font-family: system-ui, sans-serif;
  }
  .summary {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .current { color: var(--current-fg); font-size: 15px; font-weight: 850; }
  .progress { color: #a6adb7; font-size: 12px; font-variant-numeric: tabular-nums; }
  .tiers {
    display: grid;
    grid-template-columns: repeat(20, minmax(34px, 1fr));
    gap: 4px;
    min-inline-size: 720px;
  }
  .viewport { overflow-x: auto; scrollbar-width: thin; }
  .tier {
    display: grid;
    grid-template-rows: 24px auto;
    justify-items: center;
    gap: 4px;
    min-inline-size: 0;
    padding: 5px 2px;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--tier-fg);
    background: color-mix(in srgb, var(--tier-fg) 8%, var(--tier-bg));
  }
  .tier[aria-current="true"] {
    border-color: var(--tier-fg);
    background: color-mix(in srgb, var(--tier-fg) 18%, var(--tier-bg));
    box-shadow: 0 0 10px var(--tier-glow);
  }
  .badge {
    box-sizing: border-box;
    display: grid;
    inline-size: 24px;
    block-size: 24px;
    place-items: center;
    border: 2px solid currentColor;
    border-radius: 50%;
    background: var(--tier-bg);
    font-size: 10px;
    font-weight: 900;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    padding-block-start: 1px;
    text-align: center;
  }
  .floor {
    color: #b8c0ca;
    font-size: 9px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-align: center;
  }
`;

function isRendered(element: Element): boolean {
  if (!element.isConnected) return false;
  const view = element.ownerDocument.defaultView;
  for (let current: Element | null = element; current; current = current.parentElement) {
    if ((current instanceof HTMLElement && current.hidden) || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const style = view?.getComputedStyle(current);
    if (style?.display === "none" || style?.visibility === "hidden") return false;
  }
  return true;
}

function eligibleTier(player: Player, enabled: boolean): EligibleTier | undefined {
  if (
    !enabled
    || player.game.toLowerCase() !== "cs2"
    || !player.id.trim()
    || !player.nickname.trim()
    || typeof player.elo !== "number"
    || !Number.isFinite(player.elo)
    || player.elo < 0
  ) return undefined;

  const officialLevel = getOfficialEloLevel(player.elo);
  if (player.officialLevel !== undefined && player.officialLevel !== officialLevel) return undefined;
  const tier = getEloTier(player.elo, true);
  if (tier <= 10) return undefined;
  return { elo: player.elo, officialLevel, tier };
}

function preservedVisibility(element: HTMLElement | SVGSVGElement): PreservedVisibility {
  return {
    display: element.style.getPropertyValue("display"),
    displayPriority: element.style.getPropertyPriority("display"),
    ariaHidden: element.getAttribute("aria-hidden"),
  };
}

function hideNative(element: HTMLElement | SVGSVGElement): void {
  if (
    element.style.getPropertyValue("display") !== "none"
    || element.style.getPropertyPriority("display") !== "important"
  ) {
    element.style.setProperty("display", "none", "important");
  }
  if (element.getAttribute("aria-hidden") !== "true") {
    element.setAttribute("aria-hidden", "true");
  }
}

function restoreNative(element: HTMLElement | SVGSVGElement, state: PreservedVisibility): void {
  if (state.display) element.style.setProperty("display", state.display, state.displayPriority);
  else element.style.removeProperty("display");
  if (state.ariaHidden === null) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", state.ariaHidden);
}

function nativeLevel(icon: SVGSVGElement): number | undefined {
  const values = [
    icon.getAttribute("aria-label"),
    icon.getAttribute("title"),
    icon.querySelector("title")?.textContent,
  ].filter((value): value is string => Boolean(value));
  const levels = new Set<number>();
  for (const value of values) {
    const parsed = /skill\s*level\s*(\d{1,2})/iu.exec(value)?.[1];
    if (parsed !== undefined) levels.add(Number(parsed));
  }
  return levels.size === 1 ? [...levels][0] : undefined;
}

function isExcluded(element: Element): boolean {
  return element.closest(EXCLUDED_ICON_ANCESTOR_SELECTOR) !== null;
}

function numericTextValues(container: Element): number[] {
  const view = container.ownerDocument.defaultView;
  const NodeFilterRef = view?.NodeFilter ?? NodeFilter;
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilterRef.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("svg,style,script,[data-eloscope-native-tier],[data-eloscope-native-tier-rail]")) {
        return NodeFilterRef.FILTER_REJECT;
      }
      return NodeFilterRef.FILTER_ACCEPT;
    },
  });
  const values: number[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (const token of node.textContent?.match(/\d[\d\s,.\u00a0\u202f]*/gu) ?? []) {
      const digits = token.replace(/\D/gu, "");
      if (digits.length >= 3) values.push(Number(digits));
    }
  }
  return values.filter(Number.isFinite);
}

function containsExactElo(container: Element, elo: number): boolean {
  const expected = Math.round(elo);
  const matches = numericTextValues(container).filter((value) => value === expected);
  return matches.length === 1;
}

function containsExactNickname(container: Element, nickname: string): boolean {
  const expected = nickname.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  const view = container.ownerDocument.defaultView;
  const NodeFilterRef = view?.NodeFilter ?? NodeFilter;
  const walker = container.ownerDocument.createTreeWalker(container, NodeFilterRef.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      return !parent || parent.closest("svg,style,script,[data-eloscope-native-tier]")
        ? NodeFilterRef.FILTER_REJECT
        : NodeFilterRef.FILTER_ACCEPT;
    },
  });
  const values: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.textContent?.normalize("NFKC").trim().toLocaleLowerCase("en-US");
    if (value) values.push(value);
  }
  return values.filter((value) => value === expected).length === 1;
}

function routeNicknameMatches(ownerDocument: Document, player: Player): boolean {
  const pathname = ownerDocument.defaultView?.location.pathname ?? "";
  const match = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?players\/([^/]+)/u.exec(pathname);
  if (!match?.[1]) return true;
  try {
    return decodeURIComponent(match[1]).normalize("NFKC").toLocaleLowerCase("en-US")
      === player.nickname.normalize("NFKC").toLocaleLowerCase("en-US");
  } catch {
    return false;
  }
}

function nativeSize(icon: SVGSVGElement): number {
  const view = icon.ownerDocument.defaultView;
  const rect = icon.getBoundingClientRect();
  const computed = view?.getComputedStyle(icon);
  const values = [
    rect.width,
    rect.height,
    Number.parseFloat(computed?.width ?? ""),
    Number.parseFloat(computed?.height ?? ""),
    Number.parseFloat(icon.getAttribute("width") ?? ""),
    Number.parseFloat(icon.getAttribute("height") ?? ""),
  ].filter((value) => Number.isFinite(value) && value >= 20 && value <= 140);
  return Math.round(values[0] ?? 32);
}

function setHostStyle(host: HTMLElement, property: string, value: string): void {
  if (host.style.getPropertyValue(property) === value) return;
  if (value) host.style.setProperty(property, value);
  else host.style.removeProperty(property);
}

function syncTierHostLayout(host: HTMLElement, native: SVGSVGElement): void {
  setHostStyle(host, "--es-native-tier-size", `${nativeSize(native)}px`);
  const view = native.ownerDocument.defaultView;
  if (!view) return;
  const computed = view.getComputedStyle(native);
  for (const property of NATIVE_TIER_LAYOUT_PROPERTIES) {
    setHostStyle(host, property, computed.getPropertyValue(property).trim());
  }
}

function tierIconSignature(player: Player, eligible: EligibleTier): string {
  const presentation = getEloTierPresentation(eligible.tier);
  return JSON.stringify([player.id, eligible.elo, eligible.officialLevel, eligible.tier, presentation]);
}

function renderTierIcon(shadow: ShadowRoot, player: Player, eligible: EligibleTier): void {
  const presentation = getEloTierPresentation(eligible.tier);
  const style = shadow.ownerDocument.createElement("style");
  style.textContent = TIER_ICON_STYLES;
  const tier = shadow.ownerDocument.createElement("span");
  tier.className = "tier";
  tier.dataset.tier = String(eligible.tier);
  tier.style.setProperty("--tier-fg", presentation.foreground);
  tier.style.setProperty("--tier-bg", presentation.background);
  tier.style.setProperty("--tier-glow", presentation.glow);
  tier.textContent = String(eligible.tier);
  tier.tabIndex = 0;
  tier.setAttribute("role", "img");
  tier.setAttribute(
    "aria-label",
    `EloScope level ${eligible.tier}, ${Math.round(eligible.elo)} ELO, official FACEIT level ${eligible.officialLevel}`,
  );
  tier.title = `${Math.round(eligible.elo)} ELO · официальный FACEIT level ${eligible.officialLevel}`;
  shadow.replaceChildren(style, tier);
}

function railTitlesAreTrusted(section: HTMLElement): boolean {
  const normalized = Array.from(section.querySelectorAll("svg title"))
    .map((title) => title.textContent?.normalize("NFKC").trim().toLocaleLowerCase("en-US"))
    .filter((title): title is string => Boolean(title));
  const expected = [
    ...Array.from({ length: 10 }, (_, index) => `skill level ${index + 1}`),
    "challenger rank",
  ];
  return normalized.length === expected.length
    && expected.every((title) => normalized.filter((candidate) => candidate === title).length === 1);
}

function tierRailSignature(player: Player, eligible: EligibleTier): string {
  return JSON.stringify([player.id, eligible.elo, getEloTierProgress(eligible.elo)]);
}

function renderTierRail(shadow: ShadowRoot, player: Player, eligible: EligibleTier): void {
  const progress = getEloTierProgress(eligible.elo);
  const currentPresentation = getEloTierPresentation(progress.tier);
  const style = shadow.ownerDocument.createElement("style");
  style.textContent = TIER_RAIL_STYLES;

  const rail = shadow.ownerDocument.createElement("section");
  rail.className = "rail";
  rail.dataset.currentTier = String(progress.tier);
  rail.style.setProperty("--current-fg", currentPresentation.foreground);
  rail.setAttribute("aria-label", `Шкала EloScope 1–20, текущий уровень ${progress.tier}`);

  const summary = shadow.ownerDocument.createElement("div");
  summary.className = "summary";
  const current = shadow.ownerDocument.createElement("strong");
  current.className = "current";
  current.textContent = `Уровень ${progress.tier} · ${Math.floor(eligible.elo)} ELO`;
  const progressText = shadow.ownerDocument.createElement("span");
  progressText.className = "progress";
  progressText.textContent = progress.pointsNeeded === null
    ? "Максимальный уровень"
    : `${progress.pointsNeeded} ELO до уровня ${progress.tier + 1}`;
  summary.append(current, progressText);

  const viewport = shadow.ownerDocument.createElement("div");
  viewport.className = "viewport";
  const tiers = shadow.ownerDocument.createElement("div");
  tiers.className = "tiers";
  TIER_FLOORS.forEach((floor, index) => {
    const tierNumber = (index + 1) as EloScopeTier;
    const presentation = getEloTierPresentation(tierNumber);
    const item = shadow.ownerDocument.createElement("div");
    item.className = "tier";
    item.dataset.tier = String(tierNumber);
    item.style.setProperty("--tier-fg", presentation.foreground);
    item.style.setProperty("--tier-bg", presentation.background);
    item.style.setProperty("--tier-glow", presentation.glow);
    if (tierNumber === progress.tier) item.setAttribute("aria-current", "true");
    const badge = shadow.ownerDocument.createElement("span");
    badge.className = "badge";
    badge.textContent = String(tierNumber);
    const threshold = shadow.ownerDocument.createElement("span");
    threshold.className = "floor";
    threshold.textContent = String(floor);
    item.append(badge, threshold);
    tiers.append(item);
  });
  viewport.append(tiers);
  rail.append(summary, viewport);
  shadow.replaceChildren(style, rail);
}

/**
 * Fail-closed replacement for the current player's native FACEIT level on
 * matchmaking/profile surfaces. Route controllers remain responsible for
 * providing the player that owns those surfaces.
 */
export class NativeTierSurfaceRenderer {
  readonly #document: Document;
  readonly #tierMounts = new Map<string, TierMount>();
  #railMount: RailMount | undefined;
  #destroyed = false;

  constructor(ownerDocument: Document = document) {
    this.#document = ownerDocument;
  }

  syncMatchmaking(player: Player, enabled: boolean): number {
    if (this.#destroyed) return 0;
    const eligible = eligibleTier(player, enabled);
    const slots = [
      { slot: "main" as const, selector: MATCHMAKING_WIDGET_SELECTOR },
      { slot: "party" as const, selector: MATCHMAKING_PARTY_PLAYER_SELECTOR },
    ];
    const keys = new Set(eligible ? slots.map(({ slot }) => this.#key("matchmaking", slot, player.id)) : []);
    this.#removeOtherSurfaceMounts("matchmaking", keys);
    if (!eligible) {
      for (const { slot } of slots) this.#removeTier(this.#key("matchmaking", slot, player.id));
      return 0;
    }
    let mounted = 0;
    for (const { slot, selector } of slots) {
      const key = this.#key("matchmaking", slot, player.id);
      if (this.#syncTierSlot(key, "matchmaking", slot, selector, player, eligible)) mounted += 1;
    }
    return mounted;
  }

  syncProfile(player: Player, enabled: boolean, includeProgressRail: boolean): number {
    if (this.#destroyed) return 0;
    const eligible = eligibleTier(player, enabled);
    const slots = [
      { slot: "main" as const, selector: PROFILE_MAIN_LEVEL_SELECTOR },
      ...(includeProgressRail
        ? []
        : [{ slot: "current" as const, selector: PROFILE_CURRENT_LEVEL_SELECTOR }]),
    ];
    const keys = new Set(eligible ? slots.map(({ slot }) => this.#key("profile", slot, player.id)) : []);
    this.#removeOtherSurfaceMounts("profile", keys);
    if (!eligible || !routeNicknameMatches(this.#document, player)) {
      for (const key of keys) this.#removeTier(key);
      this.#removeRail();
      return 0;
    }

    let mounted = 0;
    for (const { slot, selector } of slots) {
      const key = this.#key("profile", slot, player.id);
      if (this.#syncTierSlot(key, "profile", slot, selector, player, eligible)) mounted += 1;
    }
    if (includeProgressRail && this.#syncRail(player, eligible)) mounted += 1;
    else this.#removeRail();
    return mounted;
  }

  cleanup(): void {
    for (const key of [...this.#tierMounts.keys()]) this.#removeTier(key);
    this.#removeRail();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.cleanup();
    this.#destroyed = true;
  }

  #key(surface: TierSurface, slot: TierSlot, playerId: string): string {
    return `${surface}:${slot}:${playerId}`;
  }

  #removeOtherSurfaceMounts(surface: TierSurface, expected: ReadonlySet<string>): void {
    const prefix = `${surface}:`;
    for (const key of [...this.#tierMounts.keys()]) {
      if (key.startsWith(prefix) && !expected.has(key)) this.#removeTier(key);
    }
  }

  #singleContainer(
    selector: string,
    existingNative?: Element,
    matcher?: (container: HTMLElement) => boolean,
  ): HTMLElement | undefined {
    const containers = Array.from(this.#document.querySelectorAll<HTMLElement>(selector))
      .filter((container) => !isExcluded(container))
      .filter((container) => isRendered(container) || (existingNative?.isConnected && container.contains(existingNative)))
      .filter((container) => matcher?.(container) ?? true);
    return containers.length === 1 ? containers[0] : undefined;
  }

  #syncTierSlot(
    key: string,
    surface: TierSurface,
    slot: TierSlot,
    containerSelector: string,
    player: Player,
    eligible: EligibleTier,
  ): boolean {
    const existing = this.#tierMounts.get(key);
    const container = this.#singleContainer(
      containerSelector,
      existing?.native,
      slot === "party"
        ? (candidate) => containsExactElo(candidate, eligible.elo)
          && containsExactNickname(candidate, player.nickname)
        : undefined,
    );
    if (!container) {
      this.#removeTier(key);
      return false;
    }

    const candidates = Array.from(container.querySelectorAll<SVGSVGElement>(NATIVE_SKILL_ICON_SELECTOR))
      .filter((icon) => !isExcluded(icon))
      .filter((icon) => slot === "party" || icon.parentElement === container)
      .filter((icon) => icon === existing?.native || isRendered(icon));
    const eloContainer = surface === "matchmaking" && slot === "main"
      ? Array.from(container.querySelectorAll<HTMLElement>(MATCHMAKING_ELO_SELECTOR)).filter(isRendered)
      : [container];
    if (
      candidates.length !== 1
      || nativeLevel(candidates[0] as SVGSVGElement) !== eligible.officialLevel
      || eloContainer.length !== 1
      || !containsExactElo(eloContainer[0] as HTMLElement, eligible.elo)
    ) {
      this.#removeTier(key);
      return false;
    }
    const native = candidates[0] as SVGSVGElement;

    let mount = existing;
    if (
      !mount
      || !mount.host.isConnected
      || mount.native !== native
      || mount.host.parentElement !== native.parentElement
    ) {
      if (mount) this.#removeTier(key);
      const host = this.#document.createElement("span");
      host.setAttribute(NATIVE_TIER_ATTRIBUTE, key);
      host.dataset.surface = surface;
      host.dataset.slot = slot;
      syncTierHostLayout(host, native);
      const state = preservedVisibility(native);
      mount = {
        key,
        host,
        native,
        signature: "",
        ...state,
      };
      this.#tierMounts.set(key, mount);
      native.parentElement?.insertBefore(host, native);
      host.attachShadow({ mode: "open" });
    }

    const nextSignature = tierIconSignature(player, eligible);
    if (mount.signature !== nextSignature) {
      renderTierIcon(mount.host.shadowRoot as ShadowRoot, player, eligible);
      mount.signature = nextSignature;
    }
    syncTierHostLayout(mount.host, native);
    hideNative(native);
    if (native.previousElementSibling !== mount.host) native.parentElement?.insertBefore(mount.host, native);
    return true;
  }

  #removeTier(key: string): void {
    const mount = this.#tierMounts.get(key);
    if (!mount) return;
    restoreNative(mount.native, mount);
    mount.host.remove();
    this.#tierMounts.delete(key);
  }

  #syncRail(player: Player, eligible: EligibleTier): boolean {
    const existing = this.#railMount;
    const sections = Array.from(this.#document.querySelectorAll<HTMLElement>(PROFILE_PROGRESS_SELECTOR))
      .filter((section) => !isExcluded(section))
      .filter((section) => isRendered(section) || Boolean(existing?.native.isConnected && existing.native.contains(section)));
    if (sections.length !== 1 || !railTitlesAreTrusted(sections[0] as HTMLElement)) {
      this.#removeRail();
      return false;
    }
    const section = sections[0] as HTMLElement;
    const native = section.parentElement;
    const currentElo = native
      ? Array.from(native.querySelectorAll<HTMLElement>(PROFILE_CURRENT_LEVEL_SELECTOR))
        .filter((element) => element.closest(PROFILE_PROGRESS_SELECTOR) === null)
      : [];
    const nextLevel = native
      ? Array.from(native.querySelectorAll<HTMLElement>(PROFILE_NEXT_LEVEL_SELECTOR))
        .filter((element) => element.closest(PROFILE_PROGRESS_SELECTOR) === null)
      : [];
    if (
      !native
      || section.parentElement !== native
      || currentElo.length !== 1
      || nextLevel.length !== 1
      || !containsExactElo(currentElo[0] as HTMLElement, eligible.elo)
    ) {
      this.#removeRail();
      return false;
    }
    const key = `profile:progress:${player.id}`;
    let mount = existing;
    if (
      !mount
      || mount.key !== key
      || !mount.host.isConnected
      || mount.native !== native
      || mount.host.parentElement !== native.parentElement
    ) {
      this.#removeRail();
      const host = this.#document.createElement("div");
      host.setAttribute(NATIVE_TIER_RAIL_ATTRIBUTE, key);
      const state = preservedVisibility(native);
      mount = { key, host, native, signature: "", ...state };
      this.#railMount = mount;
      native.parentElement?.insertBefore(host, native);
      host.attachShadow({ mode: "open" });
    }
    const nextSignature = tierRailSignature(player, eligible);
    if (mount.signature !== nextSignature) {
      renderTierRail(mount.host.shadowRoot as ShadowRoot, player, eligible);
      mount.signature = nextSignature;
    }
    hideNative(native);
    if (native.previousElementSibling !== mount.host) native.parentElement?.insertBefore(mount.host, native);
    return true;
  }

  #removeRail(): void {
    const mount = this.#railMount;
    if (!mount) return;
    restoreNative(mount.native, mount);
    mount.host.remove();
    this.#railMount = undefined;
  }
}
