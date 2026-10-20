import type {
  AuditLogView,
  CameraStateView,
  DeviceRequestType,
  DeviceRequestView,
  DeviceStatusView,
  DeviceView,
  PairingChallengeView,
} from "@pdm/shared";

export type {
  AuditLogView,
  CameraStateView,
  DeviceRequestView,
  DeviceStatusView,
  DeviceView,
  PairingChallengeView,
};

export interface OwnerProfile {
  id: string;
  email: string;
}

export interface LoginResult {
  token: string;
  expiresInSeconds: number;
  owner: OwnerProfile;
}

export interface DeviceSettingsInput {
  statusIntervalSeconds?: number;
  cameraFeatureEnabled?: boolean;
  cameraLens?: "back" | "front" | "both";
  smsFeatureEnabled?: boolean;
  diagnosticsEnabled?: boolean;
}

/** The single abstraction both the real API and the mock source implement. */
export interface DataSource {
  readonly kind: "live" | "demo";
  login(email: string, password: string): Promise<LoginResult>;
  me(token: string): Promise<OwnerProfile>;
  listDevices(token: string): Promise<DeviceView[]>;
  getDevice(token: string, id: string): Promise<DeviceView>;
  updateDeviceLabel(token: string, id: string, label: string): Promise<DeviceView>;
  revokeDevice(token: string, id: string): Promise<void>;
  updateSettings(
    token: string,
    id: string,
    input: DeviceSettingsInput,
  ): Promise<DeviceView["settings"]>;
  getStatusHistory(token: string, id: string): Promise<DeviceStatusView[]>;
  listRequests(token: string, id: string): Promise<DeviceRequestView[]>;
  createRequest(
    token: string,
    id: string,
    type: DeviceRequestType,
  ): Promise<DeviceRequestView>;
  createPairing(token: string, label?: string): Promise<PairingChallengeView>;
  listAudit(token: string): Promise<AuditLogView[]>;
  getCamera(token: string, id: string): Promise<CameraStateView>;
  startCamera(token: string, id: string): Promise<void>;
  stopCamera(token: string, id: string): Promise<void>;
  /** Fetch a snapshot's JPEG bytes (auth required), as a Blob for display. */
  fetchSnapshot(token: string, assetId: string): Promise<Blob>;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
