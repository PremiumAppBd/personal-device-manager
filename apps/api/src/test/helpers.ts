import { env } from "cloudflare:test";
import {
  API_BASE_PATH,
  base64UrlEncode,
  buildEnrollmentSigningString,
  buildSigningString,
  HEADERS,
  sha256Hex,
} from "@pdm/shared";
import { hashPassword } from "../lib/crypto.js";
import { uuid } from "../lib/ids.js";

export const base = API_BASE_PATH;

/** Insert an owner directly into D1 and return its id + credentials. */
export async function seedOwner(
  email = `owner-${crypto.randomUUID()}@example.com`,
  password = "correct-horse-battery-staple",
): Promise<{ id: string; email: string; password: string }> {
  const { hash, salt } = await hashPassword(password);
  const id = uuid();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO owners (id, email, password_hash, password_salt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, email.toLowerCase(), hash, salt, now, now)
    .run();
  return { id, email, password };
}

/** Log an owner in through the real endpoint and return the bearer token. */
export async function login(
  SELF: { fetch: typeof fetch },
  email: string,
  password: string,
): Promise<string> {
  const res = await SELF.fetch(`https://pdm.test${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = (await res.json()) as any;
  if (!body.ok) throw new Error(`login failed: ${JSON.stringify(body)}`);
  return body.data.token as string;
}

export interface DeviceKeys {
  publicKeySpkiB64: string;
  sign(message: string): Promise<string>;
}

/** Generate an ECDSA P-256 keypair in the Workers runtime (WebCrypto). */
export async function generateDeviceKeys(): Promise<DeviceKeys> {
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const spki = new Uint8Array(
    (await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer,
  );
  const publicKeySpkiB64 = btoa(String.fromCharCode(...spki));
  return {
    publicKeySpkiB64,
    async sign(message: string) {
      const sig = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(message),
      );
      return base64UrlEncode(new Uint8Array(sig));
    },
  };
}

/** Enroll a device end-to-end: create pairing (owner), then enroll (device). */
export async function enrollDevice(
  SELF: { fetch: typeof fetch },
  token: string,
  keys: DeviceKeys,
): Promise<{ deviceId: string; deviceToken: string }> {
  const pairingRes = await SELF.fetch(`https://pdm.test${base}/pairings`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ label: "Test Device" }),
  });
  const pairing = (await pairingRes.json()) as any;
  if (!pairing.ok) throw new Error(`pairing failed: ${JSON.stringify(pairing)}`);

  const { pairingCode, challengeNonce } = pairing.data;
  const challengeSignature = await keys.sign(
    buildEnrollmentSigningString(pairingCode, challengeNonce),
  );

  const enrollRes = await SELF.fetch(`https://pdm.test${base}/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      pairingCode,
      publicKeySpki: keys.publicKeySpkiB64,
      challengeSignature,
      device: {
        model: "Pixel 9",
        manufacturer: "Google",
        osVersion: "16",
        sdkInt: 36,
        installId: "install-" + crypto.randomUUID(),
      },
    }),
  });
  const enroll = (await enrollRes.json()) as any;
  if (!enroll.ok) throw new Error(`enroll failed: ${JSON.stringify(enroll)}`);
  return { deviceId: enroll.data.deviceId, deviceToken: enroll.data.deviceToken };
}

/** Build signed device-auth headers for a request. */
export async function signedHeaders(
  keys: DeviceKeys,
  deviceId: string,
  method: string,
  path: string,
  rawBody: string | Uint8Array,
  overrides: { timestamp?: number; nonce?: string } = {},
): Promise<Record<string, string>> {
  const timestamp = overrides.timestamp ?? Date.now();
  const nonce = overrides.nonce ?? "nonce-" + crypto.randomUUID();
  const bodyHashHex = await sha256Hex(rawBody);
  const message = buildSigningString({
    method,
    path,
    deviceId,
    timestamp,
    nonce,
    bodyHashHex,
  });
  const signature = await keys.sign(message);
  return {
    "content-type": "application/json",
    [HEADERS.deviceId]: deviceId,
    [HEADERS.timestamp]: String(timestamp),
    [HEADERS.nonce]: nonce,
    [HEADERS.signature]: signature,
  };
}
