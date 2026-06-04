import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  ShieldCheck,
  MapPin,
  Repeat,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  resolveAlert,
  subscribeToAlerts,
  type AIAlert,
  type AlertType,
} from "@/lib/alerts-firestore";
import { useCurrentUser } from "@/lib/auth-store";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({ meta: [{ title: "AI Alerts · SPVMS" }] }),
  component: AlertsPage,
});

const typeMeta: Record<AlertType, { Icon: typeof Repeat; label: string }> = {
  repeated_expired: { Icon: Repeat, label: "Repeated expired permit" },
  location_anomaly: { Icon: MapPin, label: "Location anomaly" },
  burst_invalid: { Icon: AlertTriangle, label: "Invalid scan burst" },
};

function AlertsPage() {
  const user = useCurrentUser();
  const [alerts, setAlerts] = useState<AIAlert[] | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAlerts((a) => setAlerts(a));
    return () => unsub();
  }, []);

  const onResolve = async (id: string) => {
    if (!user) return;
    setResolvingId(id);
    try {
      await resolveAlert(id, user.fullName || user.email);
      toast.success("Alert resolved.");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not resolve alert.");
    } finally {
      setResolvingId(null);
    }
  };

  const open = (alerts ?? []).filter((a) => !a.resolved);
  const resolved = (alerts ?? []).filter((a) => a.resolved);

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">AI Analytics</p>
        <h1 className="text-3xl font-semibold tracking-tight">Fraud & Anomaly Alerts</h1>
        <p className="text-muted-foreground">
          Patterns automatically detected from scan activity. Alerts are generated server-side as scans arrive.
        </p>
      </div>

      <Card className="p-5 flex items-center gap-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06]" style={{ background: "var(--gradient-accent)" }} />
        <div className="size-12 rounded-lg bg-accent/20 flex items-center justify-center text-accent-foreground relative">
          <Brain className="size-6" />
        </div>
        <div className="relative">
          <div className="font-semibold">Active detection rules</div>
          <div className="text-sm text-muted-foreground">
            Repeated expired/revoked scans (≥2 in 1h) · Location anomaly (same permit at 3+ checkpoints in 1h) · Burst of unregistered barcodes at a single checkpoint (≥3 in 1h)
          </div>
        </div>
      </Card>

      {alerts === null ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin inline mr-2" /> Connecting to alert stream…
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="font-semibold text-sm uppercase text-muted-foreground">Open ({open.length})</h2>
            {open.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                No open alerts. The system is monitoring scan activity for fraud and anomalies.
              </Card>
            )}
            {open.map((a) => {
              const meta = typeMeta[a.type];
              const Icon = meta.Icon;
              return (
                <Card key={a.id} className="p-5 flex items-start gap-4 border-l-4 border-l-destructive">
                  <div className="size-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {a.timestamp
                          ? formatDistanceToNow(a.timestamp.toDate(), { addSuffix: true })
                          : "just now"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {a.barcode !== "—" && <span className="font-mono">Permit: {a.barcode}</span>}
                      {a.locationLabel && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" /> {a.locationLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void onResolve(a.id)}
                    disabled={resolvingId === a.id || !user}
                  >
                    {resolvingId === a.id ? (
                      <Loader2 className="size-4 mr-1 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4 mr-1" />
                    )}
                    Resolve
                  </Button>
                </Card>
              );
            })}
          </section>

          {resolved.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-semibold text-sm uppercase text-muted-foreground">
                Resolved ({resolved.length})
              </h2>
              {resolved.map((a) => {
                const meta = typeMeta[a.type];
                const Icon = meta.Icon;
                return (
                  <Card key={a.id} className="p-4 flex items-center gap-3 opacity-70">
                    <Icon className="size-4 text-muted-foreground" />
                    <div className="flex-1 text-sm">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-muted-foreground"> — {a.description}</span>
                      {a.resolvedBy && (
                        <span className="text-xs text-muted-foreground ml-2">
                          · resolved by {a.resolvedBy}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </section>
          )}
        </>
      )}
    </div>
  );
}