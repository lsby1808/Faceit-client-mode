import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const [, , outputArg = "compatibility/.compatibility-signing-private-key.pem"] = process.argv;
const output = path.resolve(root, outputArg);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" });
const publicRaw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, privatePem, { encoding: "utf8", flag: "wx", mode: 0o600 });
process.stdout.write(`Compatibility public key: ${publicRaw.toString("base64url")}\n`);
