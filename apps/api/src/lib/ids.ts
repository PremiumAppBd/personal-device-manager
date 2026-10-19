/** UUID v4 via the Workers-provided Web Crypto. */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Cryptographically random token, base64url, no padding. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Generate a single-use pairing code from a restricted alphabet (no ambiguous
 * characters). Uses rejection sampling for an unbiased draw.
 */
export function pairingCode(length: number, alphabet: string): string {
  const out: string[] = [];
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    const v = buf[0]!;
    if (v < max) out.push(alphabet[v % alphabet.length]!);
  }
  return out.join("");
}
