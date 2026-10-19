# ADR 0004: Owner auth = session tokens now, Cloudflare Access in production

## Status
Accepted.

## Context
Owner auth must be testable locally without external identity infrastructure,
yet production should sit behind a strong, managed identity layer.

## Decision
Primary: PBKDF2 password verification issuing a short-lived HMAC-SHA256 session
token. Production front door: Cloudflare Access — when `CF_ACCESS_TEAM_DOMAIN`
and `CF_ACCESS_AUD` are set, the API validates the `Cf-Access-Jwt-Assertion`
(RS256 via team JWKS) and maps the identity to an owner by email. Both paths are
implemented; Access is off unless configured, keeping tests deterministic.

## Consequences
- Local/dev and CI use the session path (no external dependency).
- Production gains SSO/MFA via Access without code changes beyond config.
- JWKS claim names and `aud` handling must be confirmed against current
  Cloudflare docs before production use (see architecture.md VERIFY list).
