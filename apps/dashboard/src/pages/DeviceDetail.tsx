import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CameraStateView, DeviceView } from "../lib/types";
import {
  useCreateRequest,
  useDevice,
  useRevokeDevice,
  useStatusHistory,
  useUpdateSettings,
} from "../lib/queries";
import { dataSource } from "../lib/source";
import { useAuth } from "../lib/auth";
import { Badge, Button, Card, ErrorState, Meter, Spinner } from "../components/ui";

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 py-2">
      <span>
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 accent-brand-500"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function SettingsPanel({ device }: { device: DeviceView }) {
  const update = useUpdateSettings(device.id);
  const s = device.settings;
  return (
    <Card>
      <h3 className="font-medium">Settings &amp; consent</h3>
      <p className="mt-1 text-xs text-slate-500">
        Feature consent flags are owner-controlled and synced to the device.
        Camera mode is for a device you own; while active the device shows a
        persistent notification and the system camera indicator.
      </p>
      <div className="mt-3 divide-y divide-slate-800">
        <Toggle
          label="Diagnostics reporting"
          description="Allow non-sensitive diagnostics (battery/storage/network)."
          checked={s.diagnosticsEnabled}
          onChange={(v) => update.mutate({ diagnosticsEnabled: v })}
        />
        <Toggle
          label="Camera (own-device mode)"
          description="Allow this device to act as your private camera. Capture is always visible on the device."
          checked={s.cameraFeatureEnabled}
          onChange={(v) => update.mutate({ cameraFeatureEnabled: v })}
        />
        <Toggle
          label="SMS feature consent (not implemented)"
          description="Reserved flag. SMS reading is intentionally not built in this project."
          checked={s.smsFeatureEnabled}
          onChange={(v) => update.mutate({ smsFeatureEnabled: v })}
        />
      </div>
      {update.isError && (
        <p className="mt-2 text-sm text-red-400">
          {(update.error as Error).message}
        </p>
      )}
    </Card>
  );
}

function RevokePanel({ device }: { device: DeviceView }) {
  const revoke = useRevokeDevice(device.id);
  const [confirming, setConfirming] = useState(false);
  if (device.status === "revoked")
    return (
      <Card className="border-red-500/30">
        <p className="text-sm text-red-300">This device is revoked.</p>
      </Card>
    );
  return (
    <Card className="border-red-500/20">
      <h3 className="font-medium text-red-300">Danger zone</h3>
      <p className="mt-1 text-xs text-slate-500">
        Revoking permanently blocks this device's credential. It must be
        re-enrolled to reconnect.
      </p>
      {!confirming ? (
        <Button variant="danger" className="mt-3" onClick={() => setConfirming(true)}>
          Revoke device
        </Button>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
            {revoke.isPending ? "Revoking..." : "Confirm revoke"}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      )}
    </Card>
  );
}

function RequestsPanel({ device }: { device: DeviceView }) {
  const create = useCreateRequest(device.id);
  return (
    <Card>
      <h3 className="font-medium">Send command</h3>
      <p className="mt-1 text-xs text-slate-500">
        Phase 1 supports non-sensitive commands only.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={create.isPending} onClick={() => create.mutate("ping")}>
          Ping
        </Button>
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => create.mutate("refresh_status")}
        >
          Refresh status
        </Button>
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => create.mutate("sync_settings")}
        >
          Sync settings
        </Button>
      </div>
      {create.isSuccess && <p className="mt-2 text-sm text-emerald-400">Command queued.</p>}
      {create.isError && <p className="mt-2 text-sm text-red-400">{(create.error as Error).message}</p>}
    </Card>
  );
}

function CameraCard({ device }: { device: DeviceView }) {
  const { token } = useAuth();
  const enabled = device.settings.cameraFeatureEnabled;
  const [state, setState] = useState<CameraStateView | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastAsset = useRef<string | null>(null);

  // Poll camera state and refresh the latest snapshot (near-live view).
  useEffect(() => {
    if (!token || !enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      let nextMs = 3000;
      try {
        const s = await dataSource.getCamera(token, device.id);
        if (stopped) return;
        setState(s);
        nextMs = Math.max(1000, s.intervalSeconds * 1000);
        if (s.latestSnapshot && s.latestSnapshot.assetId !== lastAsset.current) {
          lastAsset.current = s.latestSnapshot.assetId;
          const blob = await dataSource.fetchSnapshot(token, s.latestSnapshot.assetId);
          if (stopped) return;
          setImgUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        }
      } catch (e) {
        if (!stopped) setErr(e instanceof Error ? e.message : "camera error");
      } finally {
        if (!stopped) timer = setTimeout(tick, nextMs);
      }
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token, enabled, device.id]);

  // Revoke the last object URL on unmount.
  useEffect(() => () => {
    if (imgUrl) URL.revokeObjectURL(imgUrl);
  }, [imgUrl]);

  if (!enabled) {
    return (
      <Card>
        <h3 className="font-medium">Live camera</h3>
        <p className="mt-1 text-sm text-slate-400">
          Turn on "Camera feature consent" in Settings to use this device as a
          private camera. The device will show a persistent notification and the
          system camera indicator while active.
        </p>
      </Card>
    );
  }

  const active = state?.session?.status === "active";
  async function toggle(start: boolean) {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      if (start) await dataSource.startCamera(token, device.id);
      else await dataSource.stopCamera(token, device.id);
      setState(await dataSource.getCamera(token, device.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "camera error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Live camera</h3>
        {active ? <Badge tone="success">Live</Badge> : <Badge tone="neutral">Off</Badge>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Near-live snapshots{state ? ` every ${state.intervalSeconds}s` : ""}. The
        device shows a visible notification and the system camera indicator while
        capturing.
      </p>

      <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg bg-slate-950 ring-1 ring-slate-800">
        {imgUrl ? (
          <img src={imgUrl} alt="latest camera frame" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {active ? "Waiting for the first frame..." : "Camera is off."}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        {active ? (
          <Button variant="danger" disabled={busy} onClick={() => toggle(false)}>
            {busy ? "..." : "Stop camera"}
          </Button>
        ) : (
          <Button disabled={busy} onClick={() => toggle(true)}>
            {busy ? "..." : "Start camera"}
          </Button>
        )}
      </div>
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
    </Card>
  );
}

export function DeviceDetailPage() {
  const { id = "" } = useParams();
  const { data: device, isLoading, error } = useDevice(id);
  const history = useStatusHistory(id);

  if (isLoading) return <Spinner label="Loading device..." />;
  if (error || !device)
    return (
      <ErrorState
        title="Device not found"
        message={error instanceof Error ? error.message : "This device is not available."}
      />
    );

  return (
    <div className="space-y-5">
      <div>
        <Link to="/devices" className="text-sm text-brand-500">
          &larr; Back to devices
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{device.label ?? device.model}</h1>
            <p className="text-xs text-slate-400">
              {device.manufacturer} {device.model} · Android {device.osVersion} · enrolled{" "}
              {new Date(device.enrolledAt).toLocaleDateString()}
            </p>
          </div>
          {device.online ? <Badge tone="success">Online</Badge> : <Badge tone="warning">Offline</Badge>}
        </div>
      </div>

      {device.latestStatus && (
        <Card>
          <h3 className="mb-3 font-medium">Current status</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter label="Battery" value={device.latestStatus.battery.level} />
            <Meter
              label="Storage free"
              value={Math.round(
                (device.latestStatus.storage.freeBytes /
                  device.latestStatus.storage.totalBytes) *
                  100,
              )}
              warnBelow={10}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Last reported {new Date(device.latestStatus.reportedAt).toLocaleString()} ·
            network {device.latestStatus.network.type} · app {device.latestStatus.appVersion}
          </p>
        </Card>
      )}

      <CameraCard device={device} />

      <div className="grid gap-5 sm:grid-cols-2">
        <SettingsPanel device={device} />
        <RequestsPanel device={device} />
      </div>

      <Card>
        <h3 className="mb-3 font-medium">Status history</h3>
        {history.isLoading ? (
          <Spinner />
        ) : history.data && history.data.length > 0 ? (
          <ul className="space-y-1 text-sm text-slate-400">
            {history.data.map((h, i) => (
              <li key={i} className="flex justify-between border-b border-slate-800/60 py-1">
                <span>{new Date(h.reportedAt).toLocaleString()}</span>
                <span>
                  battery {h.battery.level}% · {h.network.type}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No history yet.</p>
        )}
      </Card>

      <RevokePanel device={device} />
    </div>
  );
}
