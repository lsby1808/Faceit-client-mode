import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(projectRoot, "build");
const compatibilityConfig = JSON.parse(
  await readFile(resolve(projectRoot, "../compatibility/config.json"), "utf8"),
);

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const shared = {
  bundle: true,
  format: "iife",
  target: "chrome109",
  sourcemap: false,
  minify: true,
  legalComments: "none",
  charset: "utf8",
  logLevel: "info",
  define: {
    __ELOSCOPE_COMPAT_URL__: JSON.stringify(
      process.env.ELOSCOPE_COMPAT_URL ?? compatibilityConfig.url,
    ),
    __ELOSCOPE_COMPAT_PUBLIC_KEY__: JSON.stringify(
      process.env.ELOSCOPE_COMPAT_PUBLIC_KEY ?? compatibilityConfig.publicKey,
    )
  }
};

await Promise.all([
  build({
    ...shared,
    entryPoints: [resolve(projectRoot, "src/main-bridge.ts")],
    outfile: resolve(outdir, "main-bridge.js")
  }),
  build({
    ...shared,
    entryPoints: [resolve(projectRoot, "src/content.ts")],
    outfile: resolve(outdir, "content.js")
  })
]);

const manifest = JSON.parse(await readFile(resolve(projectRoot, "manifest.json"), "utf8"));
manifest.version = process.env.ELOSCOPE_EXTENSION_VERSION ?? manifest.version;
await writeFile(resolve(outdir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await cp(resolve(projectRoot, "NOTICE.txt"), resolve(outdir, "NOTICE.txt"));
