# Testing the API

Base URL: `http://127.0.0.1:8787/api/v1` locally, or
`https://pdm-api.<your-subdomain>.workers.dev/api/v1` when deployed.

All responses use one envelope:

```json
{ "ok": true, "data": { ... }, "requestId": "..." }
{ "ok": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }
```

## Owner endpoints (easy to test with curl)

Owner endpoints use a Bearer token from `/auth/login`.

```bash
BASE=http://127.0.0.1:8787/api/v1

# No auth
curl -s $BASE/health

# Log in -> token
TOKEN=$(curl -s $BASE/auth/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"a-long-passphrase"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

curl -s $BASE/auth/me                         -H "authorization: Bearer $TOKEN"
curl -s -X POST $BASE/pairings                -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"label":"My Pixel"}'
curl -s $BASE/devices                         -H "authorization: Bearer $TOKEN"
curl -s $BASE/devices/<id>                    -H "authorization: Bearer $TOKEN"
curl -s -X PUT $BASE/devices/<id>/settings    -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"statusIntervalSeconds":300}'
curl -s -X POST $BASE/devices/<id>/requests   -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"type":"ping"}'
curl -s -X POST $BASE/devices/<id>/revoke     -H "authorization: Bearer $TOKEN"
curl -s $BASE/audit                           -H "authorization: Bearer $TOKEN"
```

Expected failures you can verify:

```bash
curl -s -o /dev/null -w "%{http_code}\n" $BASE/devices          # 401 (no token)
# camera/sms command types are blocked in this build:
curl -s -X POST $BASE/devices/<id>/requests -H "authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' -d '{"type":"camera_session_request"}'
# -> 403 feature_disabled
```

## Device endpoints (signed — use the app or the test suite)

Endpoints under `/device/*` and `/enroll` require an ECDSA P-256 signature made
with a device's Android Keystore key (see `docs/security.md` for the exact
signing string). They are not practical to hand-craft with curl.

To exercise them, use either:

- the **Android app** (real signing), or
- the **automated test suite**, which generates keys and signs requests exactly
  like a device:

```bash
pnpm --filter @pdm/api run test
```

That suite covers: enrollment challenge verification, per-request signatures,
body-tamper rejection, nonce replay rejection, timestamp freshness, status
validation, ownership isolation, feature gating, and the full command
round-trip.

## Full endpoint list

| method | path | auth |
| --- | --- | --- |
| GET | `/health` | none |
| POST | `/auth/login` | none |
| GET | `/auth/me` | owner |
| POST | `/pairings` | owner |
| POST | `/enroll` | device proof (pairing + signature) |
| GET | `/devices` | owner |
| GET | `/devices/:id` | owner |
| PATCH | `/devices/:id` | owner |
| POST | `/devices/:id/revoke` | owner |
| GET/PUT | `/devices/:id/settings` | owner |
| GET | `/devices/:id/status` | owner |
| GET/POST | `/devices/:id/requests` | owner |
| GET | `/device/settings` | device-signed |
| POST | `/device/status` | device-signed |
| GET | `/device/requests` | device-signed |
| POST | `/device/requests/:id` | device-signed |
| GET | `/audit` | owner |
