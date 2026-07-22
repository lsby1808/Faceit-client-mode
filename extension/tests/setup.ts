import { beforeEach } from "vitest";

const memory: Record<string, unknown> = Object.create(null);

Object.defineProperty(globalThis, "chrome", {
  configurable: true,
  value: {
    storage: {
      local: {
        async get(key: string | string[]) {
          if (typeof key === "string") return { [key]: memory[key] };
          return Object.fromEntries(key.map((item) => [item, memory[item]]));
        },
        async set(values: Record<string, unknown>) {
          Object.assign(memory, values);
        },
        async clear() {
          for (const key of Object.keys(memory)) delete memory[key];
        }
      }
    }
  }
});

beforeEach(async () => {
  if (typeof document !== "undefined") document.documentElement.innerHTML = "<head></head><body></body>";
  await chrome.storage.local.clear();
});
