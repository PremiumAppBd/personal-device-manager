import { useAudit } from "../lib/queries";
import { Badge, Card, EmptyState, ErrorState, Spinner } from "../components/ui";

const toneFor = (action: string): "neutral" | "success" | "warning" | "danger" => {
  if (action.includes("failed") || action.includes("rejected") || action.includes("replay"))
    return "danger";
  if (action.includes("revoked")) return "warning";
  if (action.includes("login") || action.includes("enrolled")) return "success";
  return "neutral";
};

export function AuditPage() {
  const { data, isLoading, error } = useAudit();

  if (isLoading) return <Spinner label="Loading audit log..." />;
  if (error)
    return (
      <ErrorState
        title="Could not load audit log"
        message={error instanceof Error ? error.message : "Unknown error"}
      />
    );
  if (!data || data.length === 0)
    return <EmptyState title="No audit entries yet" />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Audit log</h1>
      <Card className="p-0">
        <ul className="divide-y divide-slate-800">
          {data.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between px-5 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                  <span className="text-xs text-slate-500">{entry.actorType}</span>
                </div>
                {entry.deviceId && (
                  <p className="mt-1 text-xs text-slate-500">device {entry.deviceId}</p>
                )}
              </div>
              <time className="text-xs text-slate-500">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
