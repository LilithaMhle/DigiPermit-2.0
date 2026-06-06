import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Brain,
  ShieldCheck,
  MapPin,
  Repeat,
  Loader2,
  Sparkles,
  TrendingUp,
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
import { useServerFn } from "@tanstack/react-start";
import { analyzeAlerts, type AiAnalystResult } from "@/lib/ai-analyst.functions";
import { Badge } from "@/components/ui/badge";

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
  const [aiResult, setAiResult] = useState<AiAnalystResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalyzedAt, setAiAnalyzedAt] = useState<Date | null>(null);
  const runAnalysis = useServerFn(analyzeAlerts);

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

  const prioritizedById = useMemo(() => {
    const map = new Map<string, AiAnalystResult["prioritized"][number]>();
    aiResult?.prioritized.forEach((p) => map.set(p.alertId, p));
    return map;
  }, [aiResult]);

  // Build a stable signature of the open alerts so we only re-run AI when
  // the underlying set actually changes (not on every snapshot tick).
  const openSignature = useMemo(
    () =>
      open
        .map((a) => `${a.id}:${a.type}:${a.barcode}:${a.locationLabel}`)
        .sort()
        .join("|"),
    [open],
  );

  useEffect(() => {
    if (alerts === null) return; // wait for first snapshot
    if (open.length === 0) {
      setAiResult(null);
      setAiAnalyzedAt(null);
      return;
    }

    let cancelled = false;
    setAiLoading(true);
    const payload = {
      alerts: open.map((a) => ({
        id: a.id,
        type: a.type,
        description: a.description,
        barcode: a.barcode,
        locationLabel: a.locationLabel,
        resolved: a.resolved,
        ageMinutes: a.timestamp
          ? Math.round((Date.now() - a.timestamp.toDate().getTime()) / 60000)
          : null,
      })),
    };
    runAnalysis({ data: payload })
      .then((result) => {
        if (cancelled) return;
        setAiResult(result);
        setAiAnalyzedAt(new Date());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error((err as Error).message ?? "AI analysis failed.");
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignature, alerts === null]);

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

      <AiAnalystPanel
        loading={aiLoading}
        result={aiResult}
        openCount={open.length}
        analyzedAt={aiAnalyzedAt}
      />

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
              const ai = prioritizedById.get(a.id);
              return (
                <Card key={a.id} className="p-5 flex items-start gap-4 border-l-4 border-l-destructive">
                  <div className="size-10 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                    <Icon className="size-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{meta.label}</span>
                      {ai && <PriorityBadge priority={ai.priority} />}
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
                    {ai && (
                      <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3 text-sm space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground/80">
                          <Sparkles className="size-3" /> AI assessment
                        </div>
                        <p className="text-foreground/90">{ai.reasoning}</p>
                        <p className="text-muted-foreground">
                          <span className="font-medium text-foreground">Recommended: </span>
                          {ai.recommendedAction}
                        </p>
                      </div>
                    )}
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

function PriorityBadge({ priority }: { priority: "low" | "medium" | "high" | "critical" }) {
  const variant =
    priority === "critical" || priority === "high"
      ? "destructive"
      : priority === "medium"
        ? "default"
        : "secondary";
  return (
    <Badge variant={variant} className="uppercase text-[10px] tracking-wide">
      {priority}
    </Badge>
  );
}

function AiAnalystPanel({
  loading,
  result,
  openCount,
  analyzedAt,
}: {
  loading: boolean;
  result: AiAnalystResult | null;
  openCount: number;
  analyzedAt: Date | null;
}) {
  return (
    <Card className="p-5 space-y-4 border-accent/40">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles className="size-5" />
          </div>
          <div>
            <div className="font-semibold flex items-center gap-2">
              AI Fraud Analyst
              {result && <RiskBadge risk={result.overallRisk} />}
            </div>
            <div className="text-sm text-muted-foreground">
              {loading
                ? "Analyzing open alerts…"
                : result
                ? `Analyzed ${openCount} open alert${openCount === 1 ? "" : "s"}${
                    analyzedAt ? ` · ${formatDistanceToNow(analyzedAt, { addSuffix: true })}` : ""
                  }`
                : openCount === 0
                  ? "No open alerts. AI will analyze automatically when new alerts appear."
                  : "Waiting for analysis…"}
            </div>
          </div>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Analyzing…
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-4 pt-2 border-t">
          <div>
            <h3 className="font-semibold">{result.headline}</h3>
            <p className="text-sm text-muted-foreground mt-1">{result.summary}</p>
          </div>

          {result.patterns.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <TrendingUp className="size-3" /> Detected patterns
              </div>
              <ul className="text-sm space-y-1 list-disc pl-5">
                {result.patterns.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div>
              <div className="text-xs font-medium uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <ShieldCheck className="size-3" /> Recommended actions
              </div>
              <ul className="text-sm space-y-1 list-disc pl-5">
                {result.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function RiskBadge({ risk }: { risk: "low" | "medium" | "high" | "critical" }) {
  const variant =
    risk === "critical" || risk === "high"
      ? "destructive"
      : risk === "medium"
        ? "default"
        : "secondary";
  return (
    <Badge variant={variant} className="uppercase text-[10px] tracking-wide">
      {risk} risk
    </Badge>
  );
}