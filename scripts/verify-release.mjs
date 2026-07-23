import { createPublicKey, verify } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const extensionRoot = path.join(root, "extension", "build");
const manifestPath = path.join(extensionRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const sourceManifest = JSON.parse(
  await readFile(path.join(root, "extension", "manifest.json"), "utf8"),
);
const rootPackage = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const extensionPackage = JSON.parse(
  await readFile(path.join(root, "extension", "package.json"), "utf8"),
);
const corePackage = JSON.parse(
  await readFile(path.join(root, "packages", "core", "package.json"), "utf8"),
);
const tauriConfig = JSON.parse(
  await readFile(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
const cargoManifest = await readFile(path.join(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = cargoManifest.match(
  /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/mu,
)?.[1];

function expectedExtensionVersion(appVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/u.exec(appVersion);
  if (!match) throw new Error(`Unsupported application version: ${appVersion}`);
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[4] ?? match[3])}`;
}

const appVersion = rootPackage.version;
for (const [source, version] of [
  ["extension/package.json", extensionPackage.version],
  ["packages/core/package.json", corePackage.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
  ["src-tauri/Cargo.toml", cargoVersion],
]) {
  if (version !== appVersion) {
    throw new Error(
      `Release version mismatch: package.json is ${appVersion}, ${source} is ${version ?? "missing"}`,
    );
  }
}
const expectedManifestVersion = expectedExtensionVersion(appVersion);
for (const [source, version] of [
  ["extension/manifest.json", sourceManifest.version],
  ["extension/build/manifest.json", manifest.version],
]) {
  if (version !== expectedManifestVersion) {
    throw new Error(
      `Extension version mismatch: ${source} is ${version}, expected ${expectedManifestVersion} for ${appVersion}`,
    );
  }
}
const requiredResources = new Map([
  ["../extension/build/", "extension/"],
  ["../docs/PRIVACY.md", "docs/PRIVACY.md"],
  ["../docs/THIRD_PARTY_NOTICES.md", "docs/THIRD_PARTY_NOTICES.md"],
]);
for (const [source, destination] of requiredResources) {
  if (tauriConfig.bundle?.resources?.[source] !== destination) {
    throw new Error(`Required bundled resource is missing: ${source} -> ${destination}`);
  }
}

const requiredDocuments = [
  ["PRIVACY.md", "Privacy Policy"],
  ["THIRD_PARTY_NOTICES.md", "Third-Party Notices"],
];
for (const [filename, heading] of requiredDocuments) {
  const contents = await readFile(path.join(root, "docs", filename), "utf8");
  if (!contents.includes(`# ${heading}`)) {
    throw new Error(`Bundled document is malformed: docs/${filename}`);
  }
}
const expectedExtensionKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwHBlAovISb2dUzZopqhoV8umLwlh/xh7vCoJgZ56xqFiy6n3olhPH0s7Iky2h0yUOZKGAXq/QYWJXyk2A7dA25SWB12BmPw3BOyyVMW1BdIHGg6K2XHBTMBVRlH+URomEK5qr3QE+w8RnwW9Pl93yfxrrFXe/qoBPRbCTrA2LliwkGraO5b+3TTtB/ZAKaqDvkzMuu89oglW7gd4iPiWxnnUSAAlI8zmgHidW4zLNqGigYcbqX5t7qoq/FPBuZJQzWSnqdQMFx/Io6G/RL+giyxdlIOXHOjjzLqXqP/G7C2oLVjqliJm7OE9QEF/BpYPyDXfLyAyH8fejxXxpwv7XQIDAQAB";
if (manifest.key !== expectedExtensionKey) {
  throw new Error("The stable WebView2 extension identity key is missing or changed");
}
const compatibilityConfig = JSON.parse(
  await readFile(path.join(root, "compatibility", "config.json"), "utf8"),
);
const compatibilityPayload = await readFile(
  path.join(root, "compatibility", "manifest.production.json"),
);
const compatibilityEnvelope = JSON.parse(
  await readFile(path.join(root, "compatibility", "manifest.signed.json"), "utf8"),
);

const envelopePayload = Buffer.from(compatibilityEnvelope.payload, "base64url");
const envelopeSignature = Buffer.from(compatibilityEnvelope.signature, "base64url");
if (!envelopePayload.equals(compatibilityPayload)) {
  throw new Error("Signed compatibility payload differs from manifest.production.json");
}
const publicKeyRaw = Buffer.from(compatibilityConfig.publicKey, "base64url");
if (publicKeyRaw.length !== 32) throw new Error("Compatibility public key must be 32 bytes");
const publicKey = createPublicKey({
  key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), publicKeyRaw]),
  format: "der",
  type: "spki",
});
if (!verify(null, envelopePayload, publicKey, envelopeSignature)) {
  throw new Error("Compatibility manifest signature is invalid");
}
const decodedCompatibility = JSON.parse(envelopePayload.toString("utf8"));
if (Date.parse(decodedCompatibility.expiresAt) <= Date.now()) {
  throw new Error("Compatibility manifest has expired");
}

const expectedPermissions = ["clipboardWrite", "storage"];
const actualPermissions = [...(manifest.permissions ?? [])].sort();
if (JSON.stringify(actualPermissions) !== JSON.stringify(expectedPermissions)) {
  throw new Error(`Unexpected extension permissions: ${actualPermissions.join(", ")}`);
}

const allowedHosts = new Set([
  "https://www.faceit.com/*",
  "https://raw.githubusercontent.com/lsby1808/Faceit-client-mode/*",
]);
for (const host of manifest.host_permissions ?? []) {
  if (!allowedHosts.has(host)) throw new Error(`Host permission is too broad: ${host}`);
}

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await allFiles(absolute)));
    else files.push(absolute);
  }
  return files;
}

let rawBytes = 0;
let gzipBytes = 0;
for (const file of await allFiles(extensionRoot)) {
  const bytes = await readFile(file);
  rawBytes += (await stat(file)).size;
  gzipBytes += gzipSync(bytes, { level: 9 }).byteLength;
}

const gzipBudget = 300 * 1024;
if (gzipBytes > gzipBudget) {
  throw new Error(`Enhancement bundle is ${gzipBytes} gzip bytes; budget is ${gzipBudget}`);
}

const builtSources = (await Promise.all(
  (await allFiles(extensionRoot))
    .filter((file) => /\.(?:js|html)$/u.test(file))
    .map((file) => readFile(file, "utf8")),
)).join("\n");

for (const forbidden of ["__TAURI_INTERNALS__", "window.__TAURI__", "child_process"]) {
  if (builtSources.includes(forbidden)) throw new Error(`Forbidden bridge found: ${forbidden}`);
}
for (const required of [compatibilityConfig.url, compatibilityConfig.publicKey]) {
  if (!builtSources.includes(required)) {
    throw new Error("Production compatibility configuration is missing from the bundle");
  }
}

process.stdout.write(
  `Release verification passed: ${rawBytes} raw bytes, ${gzipBytes} gzip bytes.\n`,
);
