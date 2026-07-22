import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await build({
  bundle: true,
  format: "iife",
  target: "chrome109",
  sourcemap: false,
  entryPoints: [resolve(projectRoot, "fixtures/visual-harness.ts")],
  outfile: resolve(projectRoot, "build/visual-harness.js"),
  define: {
    __ELOSCOPE_COMPAT_URL__: '""',
    __ELOSCOPE_COMPAT_PUBLIC_KEY__: '""',
  },
});
