import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shared = {
  bundle: true,
  format: "iife",
  target: "chrome109",
  sourcemap: false,
  define: {
    __ELOSCOPE_COMPAT_URL__: '""',
    __ELOSCOPE_COMPAT_PUBLIC_KEY__: '""',
  },
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [resolve(projectRoot, "fixtures/visual-harness.ts")],
    outfile: resolve(projectRoot, "build/visual-harness.js"),
  }),
  build({
    ...shared,
    entryPoints: [resolve(projectRoot, "fixtures/settings-harness.ts")],
    outfile: resolve(projectRoot, "build/settings-harness.js"),
  }),
]);
