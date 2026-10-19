import { env, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  base,
  enrollDevice,
  generateDeviceKeys,
  login,
  seedOwner,
  signedHeaders,
} from "./helpers.js";

const origin = "https://pdm.test";
const url = (p: string) => `${origin}${base}${p}`;

async function jsonOf(res: Response): Promise<any> {
  return res.json();
}

beforeEach(async () => {
  // Clean slate between tests (FK cascades handle children).
  await env.DB.exec(
    "DELETE FROM audit_logs; DELETE FROM request_nonces; DELETE FROM device_status; DELETE FROM device_requests; DELETE FROM device_settings; DELETE FROM pairing_challenges; DELETE FROM devices; DELETE FROM owners;",
  );
});

describe("health", () => {
  it("reports ok with a live database", async () => {
    const res = await SELF.fetch(url("/health"));
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.checks.database).toBe(true);
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });

  it("sets security headers", async () => {
    const res = await SELF.fetch(url("/health"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });
});

describe("owner authentication", () => {
  it("rejects unauthenticated access to protected routes (401)", async () => {
    const res = await SELF.fetch(url("/devices"));
    expect(res.status).toBe(401);
    const body = await jsonOf(res);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("unauthorized");
  });

  it("rejects a malformed bearer token", async () => {
    const res = await SELF.fetch(url("/devices"), {
      headers: { authorization: "Bearer not.a.valid.token" },
    });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and rejects wrong ones", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    expect(token).toBeTruthy();

    const bad = await SELF.fetch(url("/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: owner.email, password: "wrong-password-xx" }),
    });
    expect(bad.status).toBe(401);

    const me = await SELF.fetch(url("/auth/me"), {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    expect((await jsonOf(me)).data.email).toBe(owner.email.toLowerCase());
  });
});

describe("pairing + enrollment (possession of private key)", () => {
  it("enrolls a device that correctly signs the challenge", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);
    expect(deviceId).toBeTruthy();

    const list = await SELF.fetch(url("/devices"), {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await jsonOf(list);
    expect(body.data.devices).toHaveLength(1);
    expect(body.data.devices[0].settings.cameraFeatureEnabled).toBe(false);
    expect(body.data.devices[0].settings.smsFeatureEnabled).toBe(false);
  });

  it("rejects enrollment with an invalid challenge signature", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();

    const pairingRes = await SELF.fetch(url("/pairings"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { pairingCode } = (await jsonOf(pairingRes)).data;

    const res = await SELF.fetch(url("/enroll"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingCode,
        publicKeySpki: keys.publicKeySpkiB64,
        challengeSignature: await keys.sign("wrong-message"),
        device: {
          model: "Pixel",
          manufacturer: "Google",
          osVersion: "16",
          sdkInt: 36,
          installId: "install-xyz-123",
        },
      }),
    });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error.code).toBe("pairing_invalid");
  });

  it("makes a pairing code single-use", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    await enrollDevice(SELF, token, keys);

    // Re-using the same (already consumed) code must fail. We re-derive a fresh
    // pairing to get a code, consume it, then attempt a second enroll.
    const second = await generateDeviceKeys();
    const pairingRes = await SELF.fetch(url("/pairings"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { pairingCode, challengeNonce } = (await jsonOf(pairingRes)).data;
    const { buildEnrollmentSigningString } = await import("@pdm/shared");
    const sig = await second.sign(
      buildEnrollmentSigningString(pairingCode, challengeNonce),
    );
    const enrollOnce = await SELF.fetch(url("/enroll"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingCode,
        publicKeySpki: second.publicKeySpkiB64,
        challengeSignature: sig,
        device: { model: "m", manufacturer: "x", osVersion: "16", sdkInt: 36, installId: "iiiiiiii" },
      }),
    });
    expect(enrollOnce.status).toBe(201);

    const enrollTwice = await SELF.fetch(url("/enroll"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingCode,
        publicKeySpki: second.publicKeySpkiB64,
        challengeSignature: sig,
        device: { model: "m", manufacturer: "x", osVersion: "16", sdkInt: 36, installId: "iiiiiiii" },
      }),
    });
    expect(enrollTwice.status).toBe(400);
  });

  it("rejects an expired pairing code", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();

    const pairingRes = await SELF.fetch(url("/pairings"), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    const { pairingCode, challengeNonce } = (await jsonOf(pairingRes)).data;

    // Force expiry in the DB.
    await env.DB.prepare(
      "UPDATE pairing_challenges SET expires_at = ? WHERE status = 'issued'",
    )
      .bind(Date.now() - 1000)
      .run();

    const { buildEnrollmentSigningString } = await import("@pdm/shared");
    const res = await SELF.fetch(url("/enroll"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairingCode,
        publicKeySpki: keys.publicKeySpkiB64,
        challengeSignature: await keys.sign(
          buildEnrollmentSigningString(pairingCode, challengeNonce),
        ),
        device: { model: "m", manufacturer: "x", osVersion: "16", sdkInt: 36, installId: "iiiiiiii" },
      }),
    });
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error.code).toBe("pairing_invalid");
  });
});

describe("device ownership isolation", () => {
  it("prevents one owner from reading another owner's device", async () => {
    const ownerA = await seedOwner();
    const ownerB = await seedOwner();
    const tokenA = await login(SELF, ownerA.email, ownerA.password);
    const tokenB = await login(SELF, ownerB.email, ownerB.password);

    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, tokenA, keys);

    const asB = await SELF.fetch(url(`/devices/${deviceId}`), {
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(asB.status).toBe(404);

    const asA = await SELF.fetch(url(`/devices/${deviceId}`), {
      headers: { authorization: `Bearer ${tokenA}` },
    });
    expect(asA.status).toBe(200);
  });
});

describe("device-authenticated endpoints + replay protection", () => {
  it("accepts a correctly signed status report and validates its shape", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    const body = JSON.stringify({
      capturedAt: new Date().toISOString(),
      battery: { level: 82, charging: true },
      storage: { totalBytes: 128_000_000_000, freeBytes: 64_000_000_000 },
      network: { type: "wifi", metered: false },
      sequence: 1,
      appVersion: "0.1.0",
    });
    const path = `${base}/device/status`;
    const headers = await signedHeaders(keys, deviceId, "POST", path, body);
    const res = await SELF.fetch(url("/device/status"), { method: "POST", headers, body });
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).data.accepted).toBe(true);

    // Device now shows online + latest status to the owner.
    const detail = await SELF.fetch(url(`/devices/${deviceId}`), {
      headers: { authorization: `Bearer ${token}` },
    });
    const d = (await jsonOf(detail)).data;
    expect(d.online).toBe(true);
    expect(d.latestStatus.battery.level).toBe(82);
  });

  it("rejects a status report with an invalid body schema (422)", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    const body = JSON.stringify({ battery: { level: 250, charging: true } });
    const path = `${base}/device/status`;
    const headers = await signedHeaders(keys, deviceId, "POST", path, body);
    const res = await SELF.fetch(url("/device/status"), { method: "POST", headers, body });
    expect(res.status).toBe(422);
    expect((await jsonOf(res)).error.code).toBe("validation_error");
  });

  it("rejects a tampered body (signature mismatch)", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    const signedBody = JSON.stringify({ sequence: 1 });
    const path = `${base}/device/status`;
    const headers = await signedHeaders(keys, deviceId, "POST", path, signedBody);
    // Send a DIFFERENT body than the one that was signed.
    const res = await SELF.fetch(url("/device/status"), {
      method: "POST",
      headers,
      body: JSON.stringify({ sequence: 999 }),
    });
    expect(res.status).toBe(401);
    expect((await jsonOf(res)).error.code).toBe("signature_invalid");
  });

  it("detects replay of a reused nonce (409)", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    const body = JSON.stringify({
      capturedAt: new Date().toISOString(),
      battery: { level: 50, charging: false },
      storage: { totalBytes: 1, freeBytes: 0 },
      network: { type: "cellular" },
      sequence: 10,
      appVersion: "0.1.0",
    });
    const path = `${base}/device/status`;
    const headers = await signedHeaders(keys, deviceId, "POST", path, body, {
      nonce: "fixed-nonce-replay-0001",
    });

    const first = await SELF.fetch(url("/device/status"), { method: "POST", headers, body });
    expect(first.status).toBe(200);
    const second = await SELF.fetch(url("/device/status"), { method: "POST", headers, body });
    expect(second.status).toBe(409);
    expect((await jsonOf(second)).error.code).toBe("replay_detected");
  });

  it("rejects a revoked device", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    await SELF.fetch(url(`/devices/${deviceId}/revoke`), {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });

    const body = JSON.stringify({
      capturedAt: new Date().toISOString(),
      battery: { level: 50, charging: false },
      storage: { totalBytes: 1, freeBytes: 0 },
      network: { type: "none" },
      sequence: 1,
      appVersion: "0.1.0",
    });
    const path = `${base}/device/status`;
    const headers = await signedHeaders(keys, deviceId, "POST", path, body);
    const res = await SELF.fetch(url("/device/status"), { method: "POST", headers, body });
    expect(res.status).toBe(401);
  });
});

describe("feature gating + settings + audit", () => {
  it("blocks creating camera/SMS requests in Phase 1 (403 feature_disabled)", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    for (const type of ["camera_session_request", "sms_summary_request"]) {
      const res = await SELF.fetch(url(`/devices/${deviceId}/requests`), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ type }),
      });
      expect(res.status).toBe(403);
      expect((await jsonOf(res)).error.code).toBe("feature_disabled");
    }

    const okReq = await SELF.fetch(url(`/devices/${deviceId}/requests`), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: "ping" }),
    });
    expect(okReq.status).toBe(201);
  });

  it("updates settings and records an audit entry", async () => {
    const owner = await seedOwner();
    const token = await login(SELF, owner.email, owner.password);
    const keys = await generateDeviceKeys();
    const { deviceId } = await enrollDevice(SELF, token, keys);

    const upd = await SELF.fetch(url(`/devices/${deviceId}/settings`), {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ statusIntervalSeconds: 300, diagnosticsEnabled: false }),
    });
    expect(upd.status).toBe(200);
    expect((await jsonOf(upd)).data.statusIntervalSeconds).toBe(300);

    const audit = await SELF.fetch(url("/audit"), {
      headers: { authorization: `Bearer ${token}` },
    });
    const items = (await jsonOf(audit)).data.items as Array<{ action: string }>;
    expect(items.some((i) => i.action === "device.settings_updated")).toBe(true);
    expect(items.some((i) => i.action === "device.enrolled")).toBe(true);
  });
});
