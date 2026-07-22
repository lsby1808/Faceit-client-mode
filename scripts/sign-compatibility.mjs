import { readFile, writeFile } from "node:fs/promises";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const [, , inputArg = "compatibility/manifest.example.json", outputArg = "compatibility/manifest.signed.json"] = process.argv;
const keyFile = process.env.ELOSCOPE_COMPAT_PRIVATE_KEY_FILE;
if (!keyFile) throw new Error("ELOSCOPE_COMPAT_PRIVATE_KEY_FILE is required");

const input = path.resolve(root, inputArg);
const output = path.resolve(root, outputArg);
const payload = await readFile(input);
const parsed = JSON.parse(payload.toString("utf8"));
if (parsed?.schemaVersion !== 1 || typeof parsed.expiresAt !== "string" || typeof parsed.capabilities !== "object") {
  throw new Error("Compatibility payload does not match schema version 1");
}

const privateKey = createPrivateKey(await readFile(path.resolve(keyFile), "utf8"));
if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("Compatibility key must be Ed25519");
const signature = sign(null, payload, privateKey);
const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" }).subarray(-32);
const envelope = {
  payload: payload.toString("base64url"),
  signature: signature.toString("base64url"),
};
await writeFile(output, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
process.stdout.write(`Signed ${path.relative(root, input)}. Public key: ${publicKey.toString("base64url")}\n`);
