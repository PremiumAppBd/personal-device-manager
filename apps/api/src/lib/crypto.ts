import {
  base64Decode,
  base64UrlEncode,
  bufferToHex,
  derEcdsaToP1363,
  SIGNING,
} from "@pdm/shared";

const encoder = new TextEncoder();

/** Constant-time comparison of two byte arrays. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** SHA-256 hex of a string (used for code hashing, fingerprints). */
export async function sha256HexString(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return bufferToHex(digest);
}

/** ---- Owner password hashing: PBKDF2-HMAC-SHA256 ---- */
const PBKDF2_ITERATIONS = 210_000;

export async function hashPassword(
  password: string,
  saltB64?: string,
): Promise<{ hash: string; salt: string }> {
  const salt = saltB64
    ? base64Decode(saltB64)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { hash: base64UrlEncode(new Uint8Array(bits)), salt: base64UrlEncode(salt) };
}

export async function verifyPassword(
  password: string,
  expectedHashB64: string,
  saltB64: string,
): Promise<boolean> {
  const { hash } = await hashPassword(password, saltB64);
  return timingSafeEqual(base64Decode(hash), base64Decode(expectedHashB64));
}

/** ---- Owner session tokens: compact HMAC-SHA256 (JWT-like) ---- */
interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueSessionToken(
  ownerId: string,
  secret: string,
  ttlSeconds: number,
  now: number = Date.now(),
): Promise<string> {
  const payload: SessionPayload = {
    sub: ownerId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSeconds,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64UrlEncode(new Uint8Array(sig))}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const key = await hmacKey(secret);
  const expected = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  if (!timingSafeEqual(base64Decode(sig), new Uint8Array(expected))) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64Decode(body)),
    ) as SessionPayload;
    if (typeof payload.sub !== "string") return null;
    if (payload.exp * 1000 < now) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Verify an ECDSA P-256 / SHA-256 signature produced by Android Keystore.
 *
 * @param spkiB64   Enrolled public key, X.509 SPKI DER, base64.
 * @param signatureB64  Signature as base64url. Accepts ASN.1 DER (Java/Android)
 *                      or raw r||s (P1363); DER is auto-converted.
 * @param message   The canonical signing string bytes.
 */
export async function verifyDeviceSignature(
  spkiB64: string,
  signatureB64: string,
  message: string,
): Promise<boolean> {
  let publicKey: CryptoKey;
  try {
    publicKey = await crypto.subtle.importKey(
      "spki",
      base64Decode(spkiB64),
      { name: "ECDSA", namedCurve: SIGNING.curve },
      false,
      ["verify"],
    );
  } catch {
    return false;
  }

  const raw = base64Decode(signatureB64);
  // ECDSA P-256 raw signatures are exactly 64 bytes; anything else that starts
  // with 0x30 is treated as DER and converted.
  let p1363: Uint8Array;
  if (raw.length === 64) {
    p1363 = raw;
  } else if (raw[0] === 0x30) {
    try {
      p1363 = derEcdsaToP1363(raw, 32);
    } catch {
      return false;
    }
  } else {
    return false;
  }

  try {
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: SIGNING.hash },
      publicKey,
      p1363,
      encoder.encode(message),
    );
  } catch {
    return false;
  }
}
