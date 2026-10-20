import type { DeviceRequestType } from "@pdm/shared";
import type {
  AuditLogView,
  CameraStateView,
  DataSource,
  DeviceRequestView,
  DeviceStatusView,
  DeviceView,
  PairingChallengeView,
} from "./types";

/**
 * In-memory MOCK data source for demo mode only. It performs no network I/O.
 * Every value here is fabricated and clearly labeled in the UI via a demo
 * banner. This module is only ever selected when config.demoMode === true.
 */
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

function mockStatus(level: number): DeviceStatusView {
  return {
    capturedAt: iso(now - 30_000),
    reportedAt: iso(now - 25_000),
    battery: { level, charging: level < 40 },
    storage: { totalBytes: 128_000_000_000, freeBytes: 52_000_000_000 },
    network: { type: "wifi", metered: false },
    appVersion: "0.1.0-demo",
    sequence: 42,
  };
}

const devices: DeviceView[] = [
  {
    id: "demo-device-1",
    label: "My Pixel 9",
    status: "active",
    model: "Pixel 9",
    manufacturer: "Google",
    osVersion: "16",
    sdkInt: 36,
    enrolledAt: iso(now - 86_400_000 * 9),
    lastSeenAt: iso(now - 25_000),
    online: true,
    settings: {
      statusIntervalSeconds: 900,
      cameraFeatureEnabled: false,
      cameraLens: "back",
      smsFeatureEnabled: false,
      diagnosticsEnabled: true,
    },
    latestStatus: mockStatus(86),
  },
  {
    id: "demo-device-2",
    label: "Spare tablet",
    status: "active",
    model: "Galaxy Tab S9",
    manufacturer: "Samsung",
    osVersion: "16",
    sdkInt: 36,
    enrolledAt: iso(now - 86_400_000 * 2),
    lastSeenAt: iso(now - 86_400_000),
    online: false,
    settings: {
      statusIntervalSeconds: 3600,
      cameraFeatureEnabled: false,
      cameraLens: "back",
      smsFeatureEnabled: false,
      diagnosticsEnabled: false,
    },
    latestStatus: mockStatus(23),
  },
];

const audit: AuditLogView[] = [
  {
    id: "a1", action: "device.status_reported", actorType: "device",
    actorId: "demo-device-1", deviceId: "demo-device-1", requestId: "r1",
    metadata: { sequence: 42 }, createdAt: iso(now - 25_000),
  },
  {
    id: "a2", action: "owner.login", actorType: "owner",
    actorId: "demo-owner", deviceId: null, requestId: "r2",
    metadata: null, createdAt: iso(now - 60_000),
  },
  {
    id: "a3", action: "device.enrolled", actorType: "device",
    actorId: "demo-device-2", deviceId: "demo-device-2", requestId: "r3",
    metadata: { model: "Galaxy Tab S9" }, createdAt: iso(now - 86_400_000 * 2),
  },
];

const delay = <T>(v: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(v), 180));

export const mockApi: DataSource = {
  kind: "demo",
  login: () =>
    delay({
      token: "demo-token",
      expiresInSeconds: 3600,
      owner: { id: "demo-owner", email: "demo@example.com" },
    }),
  me: () => delay({ id: "demo-owner", email: "demo@example.com" }),
  listDevices: () => delay(devices.map((d) => ({ ...d }))),
  getDevice: (_t, id) => {
    const d = devices.find((x) => x.id === id);
    return d ? delay({ ...d }) : Promise.reject(new Error("not found"));
  },
  updateDeviceLabel: (_t, id, label) => {
    const d = devices.find((x) => x.id === id);
    if (d) d.label = label;
    return delay({ ...(d as DeviceView) });
  },
  revokeDevice: (_t, id) => {
    const d = devices.find((x) => x.id === id);
    if (d) d.status = "revoked";
    return delay(undefined);
  },
  updateSettings: (_t, id, input) => {
    const d = devices.find((x) => x.id === id)!;
    d.settings = { ...d.settings, ...input };
    return delay({ ...d.settings });
  },
  getStatusHistory: () =>
    delay([mockStatus(86), mockStatus(84), mockStatus(80), mockStatus(72)]),
  listRequests: (): Promise<DeviceRequestView[]> => delay([]),
  createRequest: (_t, id, type: DeviceRequestType) =>
    delay({
      id: "req-" + Math.random().toString(36).slice(2, 8),
      deviceId: id,
      type,
      status: "pending",
      payload: null,
      resultSummary: null,
      createdAt: iso(Date.now()),
      updatedAt: iso(Date.now()),
      expiresAt: iso(Date.now() + 86_400_000),
    }),
  createPairing: (_t, label): Promise<PairingChallengeView> =>
    delay({
      pairingCode: "DEMO-PAIR-7Q",
      challengeNonce: "demo-nonce",
      expiresAt: iso(Date.now() + 600_000),
      label: label ?? null,
    }),
  listAudit: () => delay(audit.map((a) => ({ ...a }))),

  getCamera: (_t, id): Promise<CameraStateView> => {
    const active = demoCameraActive.has(id);
    const lens = devices.find((x) => x.id === id)?.settings.cameraLens ?? "back";
    const lenses: Array<"front" | "back"> =
      lens === "both" ? ["back", "front"] : lens === "front" ? ["front"] : ["back"];
    const snap = (l: "front" | "back") =>
      active && lenses.includes(l)
        ? { assetId: `demo-snap-${id}-${l}-${Date.now()}`, createdAt: iso(Date.now()), sizeBytes: 2048, lens: l }
        : null;
    return delay({
      enabled: true,
      session: active
        ? { id: "demo-cam-session", status: "active", createdAt: iso(now), startedAt: iso(now) }
        : null,
      intervalSeconds: 3,
      lenses,
      snapshots: { back: snap("back"), front: snap("front") },
    });
  },
  startCamera: (_t, id) => {
    demoCameraActive.add(id);
    return delay(undefined);
  },
  stopCamera: (_t, id) => {
    demoCameraActive.delete(id);
    return delay(undefined);
  },
  fetchSnapshot: (_t, _assetId) => {
    // A labeled placeholder "frame" so demo mode shows a refreshing image.
    const t = new Date().toLocaleTimeString();
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
      `<rect width="100%" height="100%" fill="#0b1120"/>` +
      `<text x="50%" y="46%" fill="#8ab4ff" font-family="monospace" font-size="26" text-anchor="middle">DEMO CAMERA FRAME</text>` +
      `<text x="50%" y="58%" fill="#64748b" font-family="monospace" font-size="18" text-anchor="middle">${t}</text>` +
      `</svg>`;
    return delay(new Blob([svg], { type: "image/svg+xml" }));
  },
};

const demoCameraActive = new Set<string>();
