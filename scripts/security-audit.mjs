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

function addFinding(relative, message) {
  findings.push(`${relative}: ${message}`);
}

function withoutComments(source) {
  let output = "";
  let state = "code";
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (character === "\n") {
        output += character;
        state = "code";
      } else {
        output += " ";
      }
      continue;
    }

    if (state === "block-comment") {
      if (character === "*" && next === "/") {
        output += "  ";
        index += 1;
        state = "code";
      } else {
        output += character === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (state !== "code") {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (
        (state === "single-quote" && character === "'")
        || (state === "double-quote" && character === '"')
        || (state === "template" && character === "`")
      ) {
        state = "code";
      }
      continue;
    }

    if (character === "/" && next === "/") {
      output += "  ";
      index += 1;
      state = "line-comment";
    } else if (character === "/" && next === "*") {
      output += "  ";
      index += 1;
      state = "block-comment";
    } else {
      output += character;
      if (character === "'") state = "single-quote";
      else if (character === '"') state = "double-quote";
      else if (character === "`") state = "template";
    }
  }

  return output;
}

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
    if (pattern.test(source)) addFinding(relative, message);
  }
}

const debugLogRelative = "extension/src/debug-log.ts";
const debugLogPath = path.join(root, ...debugLogRelative.split("/"));
const debugLogSource = await readFile(debugLogPath, "utf8").catch(() => null);

if (debugLogSource === null) {
  addFinding(debugLogRelative, "required redacted operational logger is missing");
} else {
  const debugLogCode = withoutComments(debugLogSource);
  const forbiddenDebugChannels = [
    [/\bfetch\s*\(/u, "operational log must not use fetch"],
    [/\bXMLHttpRequest\b/u, "operational log must not use XMLHttpRequest"],
    [/\bWebSocket\b/u, "operational log must not use WebSocket"],
    [/\bEventSource\b/u, "operational log must not use EventSource"],
    [/\.sendBeacon\s*\(/u, "operational log must not use sendBeacon"],
    [/\bconsole\.\w+\s*\(/u, "operational log must not write to the developer console"],
    [/\b(?:window\.)?location\.(?:href|pathname|search|hash|origin|host|hostname)\b/u, "operational log must not read page URLs"],
    [/\bdocument\.(?:URL|documentURI|referrer|cookie)\b/u, "operational log must not read document URLs or cookies"],
    [/\.(?:innerHTML|outerHTML|textContent|value|href)\b/u, "operational log must not read raw DOM, input or link content"],
    [/\bJSON\.stringify\s*\(\s*(?:event|target|currentTarget)\b/u, "operational log must not serialize browser event targets"],
    [/\b(?:event|target|currentTarget)\s*:\s*(?:event|target|currentTarget)\b/u, "operational log must not add browser event targets to stored payloads"],
    [/\bchrome\.storage\.local\.set\s*\([^)]*\b(?:target|currentTarget)\b/su, "operational log must not persist browser event targets"],
    [/\.(?:nickname|matchId|authorization|cookie|token|chatMessage|steamId)\b/u, "operational log must not read sensitive model fields"],
    [/^\s*(?:readonly\s+)?(?:url|href|nickname|matchId|playerId|steamId|token|cookie|authorization|chatMessage|message|text|inputValue|dom|target|currentTarget)\??\s*:/imu, "operational log schema must not accept sensitive or raw-content fields"],
  ];

  for (const [pattern, message] of forbiddenDebugChannels) {
    if (pattern.test(debugLogCode)) addFinding(debugLogRelative, message);
  }

  const requiredLimits = [
    [/\b(?:export\s+)?const\s+(?:DEBUG_LOG_)?MAX_EVENTS\s*=\s*2_?000\b/u, "operational log must cap retained events at 2,000"],
    [/\b(?:export\s+)?const\s+(?:DEBUG_LOG_)?MAX_BYTES\s*=\s*(?:1_?048_?576|1_?024\s*\*\s*1_?024)\b/u, "operational log must cap retained data at 1 MiB"],
    [/\b(?:export\s+)?const\s+(?:DEBUG_LOG_)?RETENTION_MS\s*=\s*(?:604_?800_?000|7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1_?000)\b/u, "operational log must expire events after 7 days"],
  ];

  for (const [pattern, message] of requiredLimits) {
    if (!pattern.test(debugLogSource)) addFinding(debugLogRelative, message);
  }

  for (const method of ["copyToClipboard", "saveToFile", "clear"]) {
    if (!new RegExp(`\\b${method}\\s*\\(`, "u").test(debugLogSource)) {
      addFinding(debugLogRelative, `manual ${method} operation is missing`);
    }
  }

  if (!/\b(?:DEBUG_LOG_)?STORAGE_KEY\s*=\s*["']eloscope:debug-log:v1["']/u.test(debugLogSource)) {
    addFinding(debugLogRelative, "operational log must use its dedicated versioned storage key");
  }
}

if (findings.length > 0) {
  process.stderr.write(`Security audit failed:\n- ${findings.join("\n- ")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Security audit passed (${sourceFiles.length} source files checked).\n`);
}
