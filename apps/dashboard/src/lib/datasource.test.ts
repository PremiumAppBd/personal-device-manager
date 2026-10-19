import { afterEach, describe, expect, it, vi } from "vitest";
import { mockApi } from "./mock";
import { liveApi } from "./api";
import { ApiClientError } from "./types";

describe("mock data source (demo mode)", () => {
  it("is explicitly tagged as demo", () => {
    expect(mockApi.kind).toBe("demo");
  });

  it("returns labeled mock devices with sensitive features off", async () => {
    const devices = await mockApi.listDevices("demo-token");
    expect(devices.length).toBeGreaterThan(0);
    for (const d of devices) {
      expect(d.settings.cameraFeatureEnabled).toBe(false);
      expect(d.settings.smsFeatureEnabled).toBe(false);
    }
  });
});

describe("live API client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is tagged live and never shares identity with the mock source", () => {
    expect(liveApi.kind).toBe("live");
    expect(liveApi).not.toBe(mockApi);
  });

  it("maps a structured API error envelope to ApiClientError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "unauthorized", message: "nope" },
            requestId: "x",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(liveApi.listDevices("bad-token")).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    });
    await expect(liveApi.listDevices("bad-token")).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("surfaces a network failure as a network_error (never mock fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    await expect(liveApi.listDevices("t")).rejects.toMatchObject({
      code: "network_error",
    });
  });
});
