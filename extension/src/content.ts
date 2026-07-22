import { EloScopeController } from "./controller";

async function waitForDocument(): Promise<void> {
  if (document.documentElement) return;
  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document, { childList: true });
  });
}

async function start(): Promise<void> {
  if (location.origin !== "https://www.faceit.com") return;
  if (document.getElementById("eloscope-root")) return;
  await waitForDocument();
  const controller = new EloScopeController();
  await controller.start();
}

void start().catch(() => {
  // Fail closed. The native FACEIT page remains untouched and operational.
});
