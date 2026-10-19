# ADR 0002: Device authentication via Keystore ECDSA request signing

## Status
Accepted.

## Context
A device must authenticate to the API without a long-lived bearer secret that,
if exfiltrated, grants full impersonation. The device id reported by a client
must never be trusted as identity.

## Decision
Each device generates an EC P-256 key in the Android Keystore (non-exportable).
The server enrolls the public key after a pairing flow that proves possession of
the private key. Every device request is signed over a canonical string
(prefix, method, path, device id, timestamp, nonce, body hash). The server
verifies the signature against the enrolled key, checks a +/-5 min freshness
window, and records a single-use nonce for replay protection.

Android/JCA produces ASN.1 DER signatures; WebCrypto verify requires IEEE
P1363, so the server converts DER->P1363 (`derEcdsaToP1363`).

## Alternatives considered
- Static device bearer token: simpler but a single exfiltration = full
  impersonation, and no per-request integrity. Rejected as primary (kept only
  as an optional future second factor).
- mTLS: strong but heavier to operate for private self-hosting on Workers.

## Consequences
- Compromise of transport or storage does not yield a reusable credential.
- Slightly more complex client/server crypto; covered by interop tests.
