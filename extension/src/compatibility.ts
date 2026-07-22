export const CAPABILITY_NAMES = [
  "profile",
  "history",
  "matchRoom",
  "quickPositions",
  "partyAccept",
  "readyUp",
  "mapVeto",
  "serverVeto",
  "connect",
  "copyServerData"
] as const;

export type CapabilityName = (typeof CAPABILITY_NAMES)[number];
export type Capabilities = Record<CapabilityName, boolean>;

export type CompatibilityPayload = {
  schemaVersion: 1;
  issuedAt: string;
  expiresAt: string;
  capabilities: Partial<Record<CapabilityName, boolean>>;
};

export type SignedCompatibilityEnvelope = {
  payload: string;
  signature: string;
};

export type CompatibilityStatus =
  | "applied"
  | "cached"
  | "built-in"
  | "unconfigured"
  | "unavailable"
  | "invalid"
  | "expired";

export type CompatibilityResult = {
  capabilities: Capabilities;
  status: CompatibilityStatus;
  checkedAt: number;
};

export const BUILT_IN_CAPABILITIES: Capabilities = Object.freeze({
  profile: true,
  history: true,
  matchRoom: true,
  quickPositions: true,
  partyAccept: true,
  readyUp: true,
  mapVeto: true,
  serverVeto: true,
  connect: true,
  copyServerData: true
});

export const COMPATIBILITY_CACHE_KEY = "eloscope:compatibility-lkg:v1";
const AUTOMATION_CAPABILITIES: CapabilityName[] = [
  "partyAccept",
  "readyUp",
  "mapVeto",
  "serverVeto",
  "connect",
  "copyServerData",
];

function failSafeCapabilities(builtIn: Capabilities): Capabilities {
  const safe = { ...builtIn };
  for (const capability of AUTOMATION_CAPABILITIES) safe[capability] = false;
  return safe;
}

async function readCachedEnvelope(): Promise<SignedCompatibilityEnvelope | null> {
  try {
    const value = await chrome.storage.local.get(COMPATIBILITY_CACHE_KEY);
    const envelope = value[COMPATIBILITY_CACHE_KEY] as Partial<SignedCompatibilityEnvelope> | undefined;
    return envelope && typeof envelope.payload === "string" && typeof envelope.signature === "string"
      ? { payload: envelope.payload, signature: envelope.signature }
      : null;
  } catch {
    return null;
  }
}

async function storeCachedEnvelope(envelope: SignedCompatibilityEnvelope): Promise<void> {
  try {
    await chrome.storage.local.set({ [COMPATIBILITY_CACHE_KEY]: envelope });
  } catch {
    // The verified result remains active in memory when storage is unavailable.
  }
}

function base64UrlBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCompatibilityPayload(bytes: Uint8Array): CompatibilityPayload | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (!isPlainObject(value) || value.schemaVersion !== 1) return null;
  if (typeof value.issuedAt !== "string" || typeof value.expiresAt !== "string") return null;
  if (!isPlainObject(value.capabilities)) return null;
  if (!Number.isFinite(Date.parse(value.issuedAt)) || !Number.isFinite(Date.parse(value.expiresAt))) return null;

  const capabilities: Partial<Record<CapabilityName, boolean>> = {};
  for (const [key, enabled] of Object.entries(value.capabilities)) {
    if (!(CAPABILITY_NAMES as readonly string[]).includes(key) || typeof enabled !== "boolean") return null;
    capabilities[key as CapabilityName] = enabled;
  }
  return { schemaVersion: 1, issuedAt: value.issuedAt, expiresAt: value.expiresAt, capabilities };
}

export function applyRemoteCapabilities(
  builtIn: Capabilities,
  remote: Partial<Record<CapabilityName, boolean>>
): Capabilities {
  return Object.fromEntries(
    CAPABILITY_NAMES.map((name) => [name, builtIn[name] && remote[name] !== false])
  ) as Capabilities;
}

export async function verifyCompatibilityEnvelope(
  envelope: SignedCompatibilityEnvelope,
  publicKeyBase64Url: string,
  builtIn: Capabilities = BUILT_IN_CAPABILITIES,
  now = Date.now()
): Promise<CompatibilityResult> {
  const checkedAt = now;
  if (!isPlainObject(envelope) || typeof envelope.payload !== "string" || typeof envelope.signature !== "string") {
    return { capabilities: { ...builtIn }, status: "invalid", checkedAt };
  }

  const payloadBytes = base64UrlBytes(envelope.payload);
  const signatureBytes = base64UrlBytes(envelope.signature);
  const publicKeyBytes = base64UrlBytes(publicKeyBase64Url);
  if (!payloadBytes || !signatureBytes || !publicKeyBytes || publicKeyBytes.length !== 32) {
    return { capabilities: { ...builtIn }, status: "invalid", checkedAt };
  }

  try {
    const key = await crypto.subtle.importKey("raw", asArrayBuffer(publicKeyBytes), { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      asArrayBuffer(signatureBytes),
      asArrayBuffer(payloadBytes)
    );
    if (!valid) return { capabilities: { ...builtIn }, status: "invalid", checkedAt };
  } catch {
    return { capabilities: { ...builtIn }, status: "invalid", checkedAt };
  }

  const payload = parseCompatibilityPayload(payloadBytes);
  if (!payload) return { capabilities: { ...builtIn }, status: "invalid", checkedAt };
  if (Date.parse(payload.expiresAt) <= now || Date.parse(payload.issuedAt) > now + 5 * 60_000) {
    return { capabilities: { ...builtIn }, status: "expired", checkedAt };
  }

  return {
    capabilities: applyRemoteCapabilities(builtIn, payload.capabilities),
    status: "applied",
    checkedAt
  };
}

export async function loadCompatibility(
  options: {
    url?: string;
    publicKey?: string;
    builtIn?: Capabilities;
    fetcher?: typeof fetch;
    now?: number;
  } = {}
): Promise<CompatibilityResult> {
  const builtIn = options.builtIn ?? BUILT_IN_CAPABILITIES;
  const checkedAt = options.now ?? Date.now();
  const url = options.url ?? __ELOSCOPE_COMPAT_URL__;
  const publicKey = options.publicKey ?? __ELOSCOPE_COMPAT_PUBLIC_KEY__;
  if (!url || !publicKey) return { capabilities: { ...builtIn }, status: "unconfigured", checkedAt };

  const fallback = async (status: "unavailable" | "invalid" | "expired"): Promise<CompatibilityResult> => {
    const cached = await readCachedEnvelope();
    if (cached) {
      const verified = await verifyCompatibilityEnvelope(cached, publicKey, builtIn, checkedAt);
      if (verified.status === "applied") return { ...verified, status: "cached" };
    }
    return { capabilities: failSafeCapabilities(builtIn), status, checkedAt };
  };

  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    return fallback("invalid");
  }
  if (endpoint.protocol !== "https:") return fallback("invalid");

  try {
    const response = await (options.fetcher ?? fetch)(endpoint, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      referrerPolicy: "no-referrer",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return fallback("unavailable");
    const envelope = (await response.json()) as SignedCompatibilityEnvelope;
    const verified = await verifyCompatibilityEnvelope(envelope, publicKey, builtIn, checkedAt);
    if (verified.status === "applied") {
      await storeCachedEnvelope(envelope);
      return verified;
    }
    return fallback(verified.status === "expired" ? "expired" : "invalid");
  } catch {
    return fallback("unavailable");
  }
}
