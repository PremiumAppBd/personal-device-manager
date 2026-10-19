import type {
  CameraSessionStatus,
  DeviceRequestStatus,
  DeviceRequestType,
  DeviceStatus,
  MediaAssetStatus,
} from "./constants.js";

/** Consistent API response envelope. Every endpoint returns one of these. */
export interface ApiOk<T> {
  ok: true;
  data: T;
  requestId: string;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level validation issues, when applicable. */
    details?: Array<{ path: string; message: string }>;
  };
  requestId: string;
}

export type ApiResponse<T> = ApiOk<T> | ApiErrorBody;

export const API_ERROR_CODES = [
  "bad_request",
  "validation_error",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "replay_detected",
  "signature_invalid",
  "pairing_invalid",
  "feature_disabled",
  "internal_error",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** HTTP status mapping for each error code. */
export const ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  replay_detected: 409,
  signature_invalid: 401,
  pairing_invalid: 400,
  feature_disabled: 403,
  internal_error: 500,
};

/** ---- View models returned to the dashboard ---- */
export interface DeviceView {
  id: string;
  label: string | null;
  status: DeviceStatus;
  model: string;
  manufacturer: string;
  osVersion: string;
  sdkInt: number;
  enrolledAt: string;
  lastSeenAt: string | null;
  online: boolean;
  settings: {
    statusIntervalSeconds: number;
    cameraFeatureEnabled: boolean;
    smsFeatureEnabled: boolean;
    diagnosticsEnabled: boolean;
  };
  latestStatus: DeviceStatusView | null;
}

export interface DeviceStatusView {
  capturedAt: string;
  reportedAt: string;
  battery: { level: number; charging: boolean; temperatureDeciC?: number };
  storage: { totalBytes: number; freeBytes: number };
  network: { type: string; metered?: boolean };
  appVersion: string;
  sequence: number;
}

export interface PairingChallengeView {
  pairingCode: string;
  /** Server nonce the device must sign to prove key possession. */
  challengeNonce: string;
  expiresAt: string;
  label: string | null;
}

export interface EnrollmentResultView {
  deviceId: string;
  status: DeviceStatus;
  /** Opaque device credential issued on successful enrollment. */
  deviceToken: string;
  settings: DeviceView["settings"];
}

export interface DeviceRequestView {
  id: string;
  deviceId: string;
  type: DeviceRequestType;
  status: DeviceRequestStatus;
  payload: Record<string, unknown> | null;
  resultSummary: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface AuditLogView {
  id: string;
  action: string;
  actorType: "owner" | "device" | "system";
  actorId: string | null;
  deviceId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** FUTURE PHASE view models (interface only; not produced in Phase 1). */
export interface CameraSessionView {
  id: string;
  deviceId: string;
  status: CameraSessionStatus;
  createdAt: string;
  authorizedAt: string | null;
  endedAt: string | null;
}

export interface MediaAssetView {
  id: string;
  deviceId: string;
  cameraSessionId: string | null;
  status: MediaAssetStatus;
  contentType: string;
  sizeBytes: number | null;
  createdAt: string;
}
