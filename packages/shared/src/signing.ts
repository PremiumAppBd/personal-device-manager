import { SIGNING } from "./constants.js";

/**
 * Canonical request-signing string.
 *
 * Produces the exact bytes a device must sign and the server must verify.
 * Keeping this in one place (and mirroring it in the Android client) prevents
 * signature mismatches caused by divergent canonicalization.
 *
 * Format (newline-separated, no trailing newline):
 *   PDM-v1
 *   <HTTP-METHOD uppercased>
 *   <request path, including /api/v1 prefix, no query string>
 *   <device id>
 *   <unix-millis timestamp>
 *   <nonce>
 *   <lowercase hex SHA-256 of the raw request body ("" body -> hash of empty string)>
 */
export function buildSigningString(parts: {
  method: string;
  path: string;
  deviceId: string;
  timestamp: number | string;
  nonce: string;
  bodyHashHex: string;
}): string {
  return [
    "PDM-v1",
    parts.method.toUpperCase(),
    parts.path,
    parts.deviceId,
    String(parts.timestamp),
    parts.nonce,
    parts.bodyHashHex,
  ].join("\n");
}

/**
 * Canonical enrollment signing string. The device signs this during pairing to
 * prove possession of its freshly generated Keystore private key. Binds the
 * signature to both the one-time code and the server nonce.
 *
 * Format:  PDM-enroll-v1\n<pairingCode>\n<challengeNonce>
 */
export function buildEnrollmentSigningString(
  pairingCode: string,
  challengeNonce: string,
): string {
  return ["PDM-enroll-v1", pairingCode, challengeNonce].join("\n");
}

/** SHA-256 of a UTF-8 or binary body, returned as lowercase hex. */
export async function sha256Hex(
  body: string | ArrayBuffer | Uint8Array,
): Promise<string> {
  let data: Uint8Array;
  if (typeof body === "string") {
    data = new TextEncoder().encode(body);
  } else if (body instanceof Uint8Array) {
    data = body;
  } else {
    data = new Uint8Array(body);
  }
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return bufferToHex(digest);
}

export function bufferToHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** base64url (no padding) encode. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** base64url or standard-base64 decode (tolerant of padding and both alphabets). */
export function base64Decode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Convert an ASN.1 DER-encoded ECDSA signature (as produced by Java's
 * "SHA256withECDSA" / Android Keystore) into the fixed-length r||s (IEEE
 * P1363) form that WebCrypto's crypto.subtle.verify requires for ECDSA.
 *
 * This is the critical interop step between Android (DER) and Workers
 * (P1363). Returns 64 bytes for P-256. Throws on malformed input.
 */
export function derEcdsaToP1363(der: Uint8Array, size = 32): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("Invalid DER: expected sequence");
  // Sequence length (short or long form).
  let seqLen = der[offset++]!;
  if (seqLen & 0x80) {
    const n = seqLen & 0x7f;
    seqLen = 0;
    for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[offset++]!;
  }
  const readInt = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new Error("Invalid DER: expected integer");
    let len = der[offset++]!;
    let int = der.slice(offset, offset + len);
    offset += len;
    // Strip leading zero byte used to keep the integer positive.
    while (int.length > 1 && int[0] === 0x00) int = int.slice(1);
    if (int.length > size) throw new Error("Invalid DER: integer too large");
    const padded = new Uint8Array(size);
    padded.set(int, size - int.length);
    return padded;
  };
  const r = readInt();
  const s = readInt();
  const out = new Uint8Array(size * 2);
  out.set(r, 0);
  out.set(s, size);
  return out;
}

/** True if a device timestamp is within the allowed clock-skew window of now. */
export function isTimestampFresh(
  timestampMs: number,
  nowMs: number = Date.now(),
  skewMs: number = SIGNING.maxClockSkewMs,
): boolean {
  if (!Number.isFinite(timestampMs)) return false;
  return Math.abs(nowMs - timestampMs) <= skewMs;
}
