import { Link } from "react-router-dom";
import type { DeviceView } from "../lib/types";
import { useDevices } from "../lib/queries";
import { Badge, Card, EmptyState, ErrorState, Meter, Spinner } from "../components/ui";

function gib(bytes: number): string {
  return (bytes / 1_000_000_000).toFixed(1);
}

function DeviceCard({ d }: { d: DeviceView }) {
  const storagePct = d.latestStatus
    ? Math.round(
        (d.latestStatus.storage.freeBytes / d.latestStatus.storage.totalBytes) * 100,
      )
    : 0;
  return (
    <Link to={`/devices/${d.id}`} className="block">
      <Card className="transition-colors hover:border-brand-500/50">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-medium">{d.label ?? d.model}</h3>
            <p className="text-xs text-slate-400">
              {d.manufacturer} {d.model} · Android {d.osVersion} (API {d.sdkInt})
            </p>
          </div>
          {d.status === "revoked" ? (
            <Badge tone="danger">Revoked</Badge>
          ) : d.online ? (
            <Badge tone="success">Online</Badge>
          ) : (
            <Badge tone="warning">Offline</Badge>
          )}
        </div>
        {d.latestStatus ? (
          <div className="mt-4 space-y-3">
            <Meter label="Battery" value={d.latestStatus.battery.level} />
            <Meter label="Storage free" value={storagePct} warnBelow={10} />
            <p className="text-xs text-slate-500">
              {gib(d.latestStatus.storage.freeBytes)} GB free of{" "}
              {gib(d.latestStatus.storage.totalBytes)} GB ·{" "}
              {d.latestStatus.network.type}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No status reported yet.</p>
        )}
      </Card>
    </Link>
  );
}

export function DevicesPage() {
  const { data, isLoading, error } = useDevices();

  if (isLoading) return <Spinner label="Loading devices..." />;
  if (error)
    return (
      <ErrorState
        title="Could not load devices"
        message={error instanceof Error ? error.message : "Unknown error"}
      />
    );
  if (!data || data.length === 0)
    return (
      <EmptyState title="No devices enrolled yet">
        Enroll your first device from the{" "}
        <Link to="/pair" className="text-brand-500 underline">
          Pair device
        </Link>{" "}
        page.
      </EmptyState>
    );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Devices</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {data.map((d) => (
          <DeviceCard key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}
