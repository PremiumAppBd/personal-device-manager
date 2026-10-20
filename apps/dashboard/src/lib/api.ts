import { API_BASE_PATH, type ApiResponse, type DeviceRequestType } from "@pdm/shared";
import { config } from "./config";
import {
  ApiClientError,
  type DataSource,
  type DeviceSettingsInput,
  type LoginResult,
} from "./types";

/** Typed fetch wrapper that unwraps the API envelope and throws on error. */
async function request<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const url = `${config.apiBaseUrl}${API_BASE_PATH}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new ApiClientError("network_error", "Could not reach the API", 0);
  }

  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new ApiClientError("bad_response", `Unexpected response (${res.status})`, res.status);
  }

  if (!json.ok) {
    throw new ApiClientError(json.error.code, json.error.message, res.status);
  }
  return json.data;
}

/** The live data source. Never falls back to mock data. */
export const liveApi: DataSource = {
  kind: "live",
  async login(email, password) {
    const data = await request<{
      token: string;
      expiresInSeconds: number;
      owner: { id: string; email: string };
    }>("/auth/login", { method: "POST", body: { email, password } });
    return data as LoginResult;
  },
  me: (token) => request("/auth/me", { token }),
  async listDevices(token) {
    const data = await request<{ devices: any[] }>("/devices", { token });
    return data.devices;
  },
  getDevice: (token, id) => request(`/devices/${id}`, { token }),
  updateDeviceLabel: (token, id, label) =>
    request(`/devices/${id}`, { method: "PATCH", token, body: { label } }),
  async revokeDevice(token, id) {
    await request(`/devices/${id}/revoke`, { method: "POST", token });
  },
  updateSettings: (token, id, input: DeviceSettingsInput) =>
    request(`/devices/${id}/settings`, { method: "PUT", token, body: input }),
  async getStatusHistory(token, id) {
    const data = await request<{ history: any[] }>(`/devices/${id}/status`, { token });
    return data.history;
  },
  async listRequests(token, id) {
    const data = await request<{ requests: any[] }>(`/devices/${id}/requests`, { token });
    return data.requests;
  },
  createRequest: (token, id, type: DeviceRequestType) =>
    request(`/devices/${id}/requests`, { method: "POST", token, body: { type } }),
  createPairing: (token, label) =>
    request("/pairings", { method: "POST", token, body: { label } }),
  async listAudit(token) {
    const data = await request<{ items: any[] }>("/audit", { token });
    return data.items;
  },
  getCamera: (token, id) => request(`/devices/${id}/camera`, { token }),
  async startCamera(token, id) {
    await request(`/devices/${id}/camera/start`, { method: "POST", token });
  },
  async stopCamera(token, id) {
    await request(`/devices/${id}/camera/stop`, { method: "POST", token });
  },
  async fetchSnapshot(token, assetId) {
    const url = `${config.apiBaseUrl}${API_BASE_PATH}/camera/snapshots/${assetId}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new ApiClientError("snapshot_error", `Snapshot fetch failed (${res.status})`, res.status);
    return res.blob();
  },
};
