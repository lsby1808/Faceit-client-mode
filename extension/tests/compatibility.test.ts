// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  applyRemoteCapabilities,
  BUILT_IN_CAPABILITIES,
  loadCompatibility,
  verifyCompatibilityEnvelope,
  type CompatibilityPayload,
  type SignedCompatibilityEnvelope
} from "../src/compatibility";

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

async function sign(payload: CompatibilityPayload): Promise<{ envelope: SignedCompatibilityEnvelope; publicKey: string }> {
  const keys = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, keys.privateKey, bytes);
  const publicKey = await crypto.subtle.exportKey("raw", keys.publicKey);
  return {
    envelope: { payload: base64Url(bytes), signature: base64Url(new Uint8Array(signature)) },
    publicKey: base64Url(new Uint8Array(publicKey))
  };
}

describe("signed compatibility manifest", () => {
  const now = Date.parse("2026-07-22T12:00:00.000Z");

  it("rejects a tampered payload", async () => {
    const signed = await sign({ schemaVersion: 1, issuedAt: "2026-07-22T11:00:00.000Z", expiresAt: "2026-07-23T00:00:00.000Z", capabilities: { readyUp: false } });
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(signed.envelope.payload.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0)))) as CompatibilityPayload;
    payload.capabilities.readyUp = true;
    signed.envelope.payload = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const result = await verifyCompatibilityEnvelope(signed.envelope, signed.publicKey, { ...BUILT_IN_CAPABILITIES }, now);
    expect(result.status).toBe("invalid");
    expect(result.capabilities).toEqual(BUILT_IN_CAPABILITIES);
  });

  it("rejects an expired but correctly signed payload", async () => {
    const signed = await sign({ schemaVersion: 1, issuedAt: "2026-07-20T00:00:00.000Z", expiresAt: "2026-07-21T00:00:00.000Z", capabilities: { readyUp: false } });
    const result = await verifyCompatibilityEnvelope(signed.envelope, signed.publicKey, { ...BUILT_IN_CAPABILITIES }, now);
    expect(result.status).toBe("expired");
    expect(result.capabilities.readyUp).toBe(true);
  });

  it("can disable but never enable a built-in capability", () => {
    const builtIn = { ...BUILT_IN_CAPABILITIES, profile: false, readyUp: true };
    const result = applyRemoteCapabilities(builtIn, { profile: true, readyUp: false });
    expect(result.profile).toBe(false);
    expect(result.readyUp).toBe(false);
  });

  it("keeps a verified last-known-good kill switch during an outage", async () => {
    const signed = await sign({
      schemaVersion: 1,
      issuedAt: "2026-07-22T11:00:00.000Z",
      expiresAt: "2026-07-23T00:00:00.000Z",
      capabilities: { readyUp: false, mapVeto: false },
    });
    const applied = await loadCompatibility({
      url: "https://releases.example.test/compatibility.json",
      publicKey: signed.publicKey,
      now,
      fetcher: (async () => new Response(JSON.stringify(signed.envelope), { status: 200 })) as typeof fetch,
    });
    expect(applied.status).toBe("applied");
    expect(applied.capabilities.readyUp).toBe(false);

    const cached = await loadCompatibility({
      url: "https://releases.example.test/compatibility.json",
      publicKey: signed.publicKey,
      now,
      fetcher: (async () => { throw new Error("offline"); }) as typeof fetch,
    });
    expect(cached.status).toBe("cached");
    expect(cached.capabilities.readyUp).toBe(false);
    expect(cached.capabilities.mapVeto).toBe(false);
  });

  it("disables mutating capabilities when configured verification has no valid fallback", async () => {
    const key = base64Url(new Uint8Array(32));
    const result = await loadCompatibility({
      url: "https://releases.example.test/compatibility.json",
      publicKey: key,
      now,
      fetcher: (async () => { throw new Error("offline"); }) as typeof fetch,
    });
    expect(result.status).toBe("unavailable");
    expect(result.capabilities.profile).toBe(true);
    expect(result.capabilities.quickPositions).toBe(true);
    expect(result.capabilities.readyUp).toBe(false);
    expect(result.capabilities.connect).toBe(false);
  });
});
