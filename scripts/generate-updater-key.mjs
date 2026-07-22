import { randomBytes } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const force = process.argv.includes("--force");
const privateKeyPath = path.join(root, "src-tauri", ".tauri-signing-private-key");
const publicKeyPath = `${privateKeyPath}.pub`;
const passwordPath = `${privateKeyPath}.password`;
const tauriCli = path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");

if (!force) {
  for (const file of [privateKeyPath, publicKeyPath, passwordPath]) {
    try {
      await access(file);
      throw new Error(`${path.relative(root, file)} already exists; pass --force to rotate before a release`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

const password = randomBytes(32).toString("base64url");
await mkdir(path.dirname(privateKeyPath), { recursive: true });
const result = spawnSync(
  process.execPath,
  [
    tauriCli,
    "signer",
    "generate",
    "--ci",
    ...(force ? ["--force"] : []),
    "--password",
    password,
    "--write-keys",
    privateKeyPath,
  ],
  { cwd: root, encoding: "utf8", windowsHide: true },
);

if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || "Tauri updater key generation failed");
}

try {
  await writeFile(passwordPath, `${password}\n`, { encoding: "utf8", mode: 0o600 });
} catch (error) {
  await Promise.allSettled([rm(privateKeyPath), rm(publicKeyPath)]);
  throw error;
}

process.stdout.write("Generated encrypted Tauri updater key pair and local password file.\n");
