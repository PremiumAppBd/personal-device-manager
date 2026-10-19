import { base64Decode } from "@pdm/shared";

/**
 * Cloudflare Access identity validation.
 *
 * When CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are configured, the production
 * deployment sits behind Cloudflare Access, which injects a signed JWT in the
 * `Cf-Access-Jwt-Assertion` header. This verifies that JWT (RS256) against the
 * team's published JWKS and checks the audience and expiry.
 *
 * Ref: Cloudflare Zero Trust — "Validating JSON Web Tokens". The JWKS endpoint
 * is https://<team>.cloudflareaccess.com/cdn-cgi/access/certs.
 *
 * This path is OFF unless both env vars are set, so local/dev and tests use the
 * bearer-session path instead.
 */
export interface AccessIdentity {
  email?: string;
  sub?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

let jwksCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getJwks(teamDomain: string): Promise<Jwk[]> {
  const now = Date.now();
  if (
    jwksCache &&
    jwksCache.domain === teamDomain &&
    now - jwksCache.fetchedAt < JWKS_TTL_MS
  ) {
    return jwksCache.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: Jwk[] };
  jwksCache = { domain: teamDomain, keys: body.keys ?? [], fetchedAt: now };
  return jwksCache.keys;
}

function decodeSegment(seg: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64Decode(seg)));
}

export async function validateAccessJwt(
  token: string,
  opts: { teamDomain: string; aud: string; now?: number },
): Promise<AccessIdentity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerSeg, payloadSeg, sigSeg] = parts as [string, string, string];

  let header: { kid?: string; alg?: string };
  let payload: {
    aud?: string | string[];
    exp?: number;
    email?: string;
    sub?: string;
    iss?: string;
  };
  try {
    header = decodeSegment(headerSeg) as typeof header;
    payload = decodeSegment(payloadSeg) as typeof payload;
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const now = opts.now ?? Date.now();
  if (typeof payload.exp === "number" && payload.exp * 1000 < now) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(opts.aud)) return null;

  let keys: Jwk[];
  try {
    keys = await getJwks(opts.teamDomain);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64Decode(sigSeg),
    signingInput,
  );
  if (!valid) return null;

  return { email: payload.email, sub: payload.sub };
}
