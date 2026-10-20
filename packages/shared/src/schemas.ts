import { z } from "zod";
import {
  DEVICE_REQUEST_STATUS,
  DEVICE_REQUEST_TYPE,
  DEVICE_STATUS,
} from "./constants.js";

/** Reusable primitives. */
export const uuidSchema = z.string().uuid();
export const isoTimestampSchema = z.string().datetime({ offset: true });

/** A base64/base64url string (device public key SPKI, signatures). */
export const base64Schema = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9+/_-]+={0,2}$/, "must be base64 or base64url");

/** ---- Owner authentication ---- */
export const ownerLoginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(256),
});
export type OwnerLogin = z.infer<typeof ownerLoginSchema>;

/** ---- Pairing ---- */
export const createPairingSchema = z.object({
  /** Optional human label the owner assigns to the device being paired. */
  label: z.string().min(1).max(80).optional(),
});
export type CreatePairing = z.infer<typeof createPairingSchema>;

/**
 * Device enrollment: the device proves possession of its Keystore private key
 * by signing the pairing challenge nonce. The server never trusts deviceId as
 * identity — identity is the verified public key.
 */
export const enrollDeviceSchema = z.object({
  pairingCode: z.string().min(6).max(16),
  /** X.509 SubjectPublicKeyInfo (SPKI) DER, base64-encoded. EC P-256. */
  publicKeySpki: base64Schema.max(1000),
  /** base64url signature over the pairing challenge nonce. */
  challengeSignature: base64Schema.max(400),
  device: z.object({
    model: z.string().min(1).max(120),
    manufacturer: z.string().min(1).max(120),
    osVersion: z.string().min(1).max(40),
    sdkInt: z.number().int().min(1).max(100),
    /** App-generated stable install id (NOT used as proof of identity). */
    installId: z.string().min(8).max(128),
  }),
});
export type EnrollDevice = z.infer<typeof enrollDeviceSchema>;

/** ---- Device status telemetry (non-sensitive) ---- */
export const batterySchema = z.object({
  level: z.number().int().min(0).max(100),
  charging: z.boolean(),
  /** Optional temperature in tenths of a degree C, as Android reports it. */
  temperatureDeciC: z.number().int().min(-500).max(1000).optional(),
});

export const storageSchema = z.object({
  totalBytes: z.number().int().nonnegative(),
  freeBytes: z.number().int().nonnegative(),
});

export const networkSchema = z.object({
  type: z.enum(["wifi", "cellular", "ethernet", "none", "unknown"]),
  metered: z.boolean().optional(),
});

export const reportStatusSchema = z.object({
  /** Device's own timestamp when the sample was captured. */
  capturedAt: isoTimestampSchema,
  battery: batterySchema,
  storage: storageSchema,
  network: networkSchema,
  /** Monotonic counter to let the server drop stale out-of-order reports. */
  sequence: z.number().int().nonnegative(),
  appVersion: z.string().min(1).max(40),
});
export type ReportStatus = z.infer<typeof reportStatusSchema>;

/** ---- Device settings (owner-controlled, synced to device) ---- */
export const cameraLensSchema = z.enum(["back", "front", "both"]);
export type CameraLens = z.infer<typeof cameraLensSchema>;

export const deviceSettingsSchema = z.object({
  /** Reporting cadence hint for WorkManager on the device, in seconds. */
  statusIntervalSeconds: z.number().int().min(60).max(86_400),
  /** Master consent flags. All default OFF; features stay disabled until set. */
  cameraFeatureEnabled: z.boolean(),
  /** Which lens(es) the device captures in camera mode. */
  cameraLens: cameraLensSchema,
  smsFeatureEnabled: z.boolean(),
  /** Whether the device may upload non-sensitive diagnostics. */
  diagnosticsEnabled: z.boolean(),
});
export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

export const updateDeviceSettingsSchema = deviceSettingsSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "at least one setting must be provided" },
);
export type UpdateDeviceSettings = z.infer<typeof updateDeviceSettingsSchema>;

export const updateDeviceSchema = z.object({
  label: z.string().min(1).max(80).optional(),
});

/** ---- Device requests (command queue) ---- */
export const createDeviceRequestSchema = z.object({
  type: z.enum(DEVICE_REQUEST_TYPE),
  /** Opaque, type-specific JSON payload. Validated per-type server-side. */
  payload: z.record(z.unknown()).optional(),
});
export type CreateDeviceRequest = z.infer<typeof createDeviceRequestSchema>;

export const updateDeviceRequestSchema = z.object({
  status: z.enum(DEVICE_REQUEST_STATUS),
  resultSummary: z.string().max(500).optional(),
});

/** ---- Query params ---- */
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export const deviceStatusEnum = z.enum(DEVICE_STATUS);
