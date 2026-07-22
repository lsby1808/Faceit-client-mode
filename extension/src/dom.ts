export type DomRoot = Document | Element | ShadowRoot;

export function isVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  if ("disabled" in element && (element as HTMLButtonElement).disabled) return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0" || style.pointerEvents === "none") return false;
  if (element.dataset.eloscopeVisible === "true") return true;
  return [...element.getClientRects()].some((rect) =>
    rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
    rect.top < window.innerHeight && rect.left < window.innerWidth);
}

export function findUniqueVisible(root: DomRoot, selectors: readonly string[]): HTMLElement | null {
  const candidates = new Set<HTMLElement>();
  for (const selector of selectors) {
    let elements: NodeListOf<Element>;
    try {
      elements = root.querySelectorAll(selector);
    } catch {
      return null;
    }
    for (const element of elements) {
      if (isVisible(element)) candidates.add(element);
    }
  }
  return candidates.size === 1 ? [...candidates][0] ?? null : null;
}

export function clickUniqueVisible(root: DomRoot, selectors: readonly string[]): boolean {
  const target = findUniqueVisible(root, selectors);
  if (!target) return false;
  if (!(target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target.getAttribute("role") === "button")) {
    return false;
  }
  target.click();
  return true;
}

export function escapeSelector(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/[^A-Za-z0-9_-]/gu, (character) => `\\${character.codePointAt(0)?.toString(16)} `);
}

export function observeScopedDom(callback: () => void): () => void {
  const attach = (): Element | null => document.querySelector("#root") ?? document.querySelector("main") ?? document.body;
  let target = attach();
  let timer = 0;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(callback, 100);
  };
  const observeTarget = (): void => {
    observer.disconnect();
    target = attach();
    if (target) observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-hidden", "data-state", "data-active", "data-action", "data-veto-action", "href", "class", "style"]
    });
  };
  const observer = new MutationObserver(() => {
    schedule();
    if (!target?.isConnected) {
      observeTarget();
    }
  });
  const guardian = new MutationObserver(() => {
    if (!target?.isConnected) {
      observeTarget();
      schedule();
    }
  });
  observeTarget();
  if (document.body) guardian.observe(document.body, { childList: true });
  return () => {
    window.clearTimeout(timer);
    observer.disconnect();
    guardian.disconnect();
  };
}
