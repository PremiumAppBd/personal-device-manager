import { describe, expect, it } from "vitest";
import {
  createSign,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import {
  base64Decode,
  base64UrlEncode,
  buildSigningString,
  derEcdsaToP1363,
  isTimestampFresh,
  sha256Hex,
} from "./signing.js";

/**
 * Generates an EC P-256 keypair and signs like Android Keystore does:
 * "SHA256withECDSA" producing an ASN.1 DER signature, with the public key
 * exported as X.509 SPKI DER. This mirrors the real device-side contract.
 */
function androidStyleKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1", // === P-256 / secp256r1
  });
  const spkiDer = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return { publicKey, privateKey, spkiB64: spkiDer.toString("base64") };
}

function signDer(privateKey: KeyObject, message: string): Buffer {
  const signer = createSign("SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(privateKey); // DER-encoded (r,s) sequence
}

async function importSpkiForVerify(spkiB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    base64Decode(spkiB64),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

describe("buildSigningString", () => {
  it("is deterministic and newline-joined", () => {
    const s = buildSigningString({
      method: "post",
      path: "/api/v1/devices/abc/status",
      deviceId: "abc",
      timestamp: 1700000000000,
      nonce: "n1",
      bodyHashHex: "deadbeef",
    });
    expect(s).toBe(
      [
        "PDM-v1",
        "POST",
        "/api/v1/devices/abc/status",
        "abc",
        "1700000000000",
        "n1",
        "deadbeef",
      ].join("\n"),
    );
  });
});

describe("sha256Hex", () => {
  it("hashes the empty string to the known SHA-256 value", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});

describe("derEcdsaToP1363 interop (Android DER -> WebCrypto P1363)", () => {
  it("verifies a DER signature after conversion to raw r||s", async () => {
    const { privateKey, spkiB64 } = androidStyleKeypair();
    const message = buildSigningString({
      method: "POST",
      path: "/api/v1/devices/d1/status",
      deviceId: "d1",
      timestamp: Date.now(),
      nonce: "nonce-123",
      bodyHashHex: await sha256Hex('{"hello":"world"}'),
    });

    const der = signDer(privateKey, message);
    const p1363 = derEcdsaToP1363(new Uint8Array(der), 32);
    expect(p1363.length).toBe(64);

    const key = await importSpkiForVerify(spkiB64);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      p1363,
      new TextEncoder().encode(message),
    );
    expect(valid).toBe(true);
  });

  it("rejects a tampered message", async () => {
    const { privateKey, spkiB64 } = androidStyleKeypair();
    const message = "PDM-v1\nGET\n/api/v1/health\nd1\n1\nn\nhash";
    const der = signDer(privateKey, message);
    const p1363 = derEcdsaToP1363(new Uint8Array(der), 32);
    const key = await importSpkiForVerify(spkiB64);

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      p1363,
      new TextEncoder().encode(message + "tampered"),
    );
    expect(valid).toBe(false);
  });

  it("round-trips base64url encoding of the signature", async () => {
    const { privateKey } = androidStyleKeypair();
    const der = signDer(privateKey, "msg");
    const p1363 = derEcdsaToP1363(new Uint8Array(der), 32);
    const b64 = base64UrlEncode(p1363);
    expect(Array.from(base64Decode(b64))).toEqual(Array.from(p1363));
  });
});

describe("isTimestampFresh", () => {
  const now = 1_700_000_000_000;
  it("accepts timestamps within skew", () => {
    expect(isTimestampFresh(now - 1000, now)).toBe(true);
    expect(isTimestampFresh(now + 1000, now)).toBe(true);
  });
  it("rejects timestamps outside skew", () => {
    expect(isTimestampFresh(now - 10 * 60 * 1000, now)).toBe(false);
    expect(isTimestampFresh(Number.NaN, now)).toBe(false);
  });
});
