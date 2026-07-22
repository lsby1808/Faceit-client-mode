import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const findings = [];

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "build", "dist", "target"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(absolute)));
    else if (/\.(?:ts|tsx|js|mjs|rs|json)$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

const sourceFiles = [
  ...(await filesBelow(path.join(root, "extension", "src"))),
  ...(await filesBelow(path.join(root, "src-tauri", "src"))),
];

for (const file of sourceFiles) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = await readFile(file, "utf8");

  const checks = [
    [/console\.(?:log|debug|info)\s*\(/u, "runtime logging is forbidden"],
    [/localStorage\.setItem\s*\([^\n]*(?:token|session|cookie)/iu, "session material written to localStorage"],
    [/chrome\.storage[^\n]*(?:token|session|cookie)/iu, "session material written to extension storage"],
    [/postMessage\s*\([^\n]*(?:token|authorization|cookie)/iu, "session material crosses postMessage"],
    [/(?:invoke|__TAURI_INTERNALS__|__TAURI__)\s*\(/u, "remote content must not invoke Tauri IPC"],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(source)) findings.push(`${relative}: ${message}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`Security audit failed:\n- ${findings.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Security audit passed (${sourceFiles.length} source files checked).\n`);
}
