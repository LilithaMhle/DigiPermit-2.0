import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Brain,
  ShieldCheck,
  MapPin,
  Repeat,
  Loader2,
  Sparkles,
  TrendingUp,
  Activity,
  CalendarClock,
  Gauge,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  resolveAlert,
  subscribeToAlerts,
  type AIAlert,
  type AlertType,
} from "@/lib/alerts-firestore";
import { subscribeToScans, type ScanEvent } from "@/lib/scans-firestore";
import { listPermits, listExpiringPermits } from "@/lib/permits-firestore";
import { listRenewalRequests } from "@/lib/renewal-firestore";
import { useCurrentUser } from "@/lib/auth-store";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeAlerts, type AiAnalystResult } from "@/lib/ai-analyst.functions";
import {
  analyzeScans,
  briefOverview,
  type ScanInsight,
  type OverviewBrief,
} from "@/lib/ai-insights.functions";
import { AiInsightCard } from "@/components/ai/AiInsightCard";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({ meta: [{ title: "AI Intelligence · DigiPermit" }] }),
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
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [totalPermits, setTotalPermits] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [pendingRenewals, setPendingRenewals] = useState(0);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiAnalystResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalyzedAt, setAiAnalyzedAt] = useState<Date | null>(null);
  const [manualRefreshTick, setManualRefreshTick] = useState(0);
  const runAnalysis = useServerFn(analyzeAlerts);

  // Scan analyst
  const [scanInsight, setScanInsight] = useState<ScanInsight | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanAnalyzedAt, setScanAnalyzedAt] = useState<Date | null>(null);
  const runScanAnalyze = useServerFn(analyzeScans);

  // Shift briefing
  const [brief, setBrief] = useState<OverviewBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefAt, setBriefAt] = useState<Date | null>(null);
  const runBrief = useServerFn(briefOverview);

  useEffect(() => {
    const unsub = subscribeToAlerts((a) => setAlerts(a));
    const unsubScans = subscribeToScans((s) => setScans(s), 200);
    (async () => {
      try {
        const [p, exp, ren] = await Promise.all([
          listPermits(),
          listExpiringPermits(30),
          listRenewalRequests(),
        ]);
        setTotalPermits(p.length);
        setExpiringCount(exp.length);
        setPendingRenewals(
          ren.filter(
            (r) =>
              r.status === "submitted" ||
              r.status === "under_review" ||
              r.status === "info_required",
          ).length,
        );
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      unsub();
      unsubScans();
    };
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
  }, [openSignature, alerts === null, manualRefreshTick]);

  // ── Scan analyst auto-run ──────────────────────────────────────────────
  const scanSig = useMemo(
    () => scans.slice(0, 50).map((s) => `${s.id}:${s.result}`).join("|"),
    [scans],
  );
  const runScanAi = useMemo(
    () => async () => {
      const list = scans.slice(0, 50);
      if (list.length === 0) {
        setScanInsight(null);
        return;
      }
      setScanLoading(true);
      setScanError(null);
      try {
        const res = await runScanAnalyze({
          data: {
            scans: list.map((s) => ({
              barcode: s.barcode,
              result: s.result,
              locationLabel: s.locationLabel,
              officerName: s.officerName,
              ageMinutes: s.timestamp
                ? Math.round((Date.now() - s.timestamp.toDate().getTime()) / 60000)
                : null,
            })),
          },
        });
        setScanInsight(res);
        setScanAnalyzedAt(new Date());
      } catch (e) {
        setScanError((e as Error).message ?? "AI analysis failed.");
      } finally {
        setScanLoading(false);
      }
    },
    [scans, runScanAnalyze],
  );
  useEffect(() => {
    void runScanAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanSig]);

  // ── Shift briefing auto-run ────────────────────────────────────────────
  const scansToday = useMemo(() => {
    const t = new Date().toDateString();
    return scans.filter((s) => s.timestamp && s.timestamp.toDate().toDateString() === t);
  }, [scans]);
  const invalidRateToday = scansToday.length
    ? Math.round(
        (scansToday.filter((s) => s.result !== "valid").length / scansToday.length) * 100,
      )
    : 0;
  const hotspots = useMemo(() => {
    const map: Record<string, { location: string; total: number; invalid: number }> = {};
    scans.forEach((s) => {
      if (!map[s.locationLabel])
        map[s.locationLabel] = { location: s.locationLabel, total: 0, invalid: 0 };
      map[s.locationLabel].total++;
      if (s.result !== "valid") map[s.locationLabel].invalid++;
    });
    return Object.values(map).sort((a, b) => b.invalid - a.invalid).slice(0, 5);
  }, [scans]);

  const briefSig = `${totalPermits}|${scansToday.length}|${open.length}|${invalidRateToday}|${expiringCount}|${pendingRenewals}|${hotspots.map((h) => h.location + h.invalid).join(",")}`;

  const runBriefNow = useMemo(
    () => async () => {
      setBriefLoading(true);
      setBriefError(null);
      try {
        const res = await runBrief({
          data: {
            totalPermits,
            expiringCount,
            pendingRenewals,
            openAlerts: open.length,
            scansToday: scansToday.length,
            invalidRateToday,
            topHotspots: hotspots.map((h) => ({
              location: h.location,
              invalid: h.invalid,
              total: h.total,
            })),
            recentAlertTypes: open.slice(0, 10).map((a) => a.type),
          },
        });
        setBrief(res);
        setBriefAt(new Date());
      } catch (e) {
        setBriefError((e as Error).message ?? "AI briefing failed.");
      } finally {
        setBriefLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [briefSig],
  );
  useEffect(() => {
    if (alerts === null) return;
    void runBriefNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefSig, alerts === null]);

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-xl border bg-card p-6">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ background: "var(--gradient-accent, linear-gradient(135deg,#7c3aed,#06b6d4))" }}
        />
        <div className="relative flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Brain className="size-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                AI Intelligence Hub
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">Alerts & AI Analysts</h1>
              <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
                Consolidated fraud detection, scan operations, and shift briefings — powered
                by live data and Lovable AI.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Live monitoring
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Open alerts" value={open.length} Icon={AlertTriangle} tone={open.length > 0 ? "danger" : "ok"} />
        <KpiCard label="Scans today" value={scansToday.length} Icon={Activity} />
        <KpiCard label="Invalid rate" value={`${invalidRateToday}%`} Icon={Gauge} tone={invalidRateToday > 20 ? "warn" : undefined} />
        <KpiCard label="Expiring (30d)" value={expiringCount} Icon={CalendarClock} tone={expiringCount > 0 ? "warn" : undefined} />
      </div>

      <Card className="p-5">
        <Tabs defaultValue="fraud" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                AI Analysts
              </h2>
            </div>
            <TabsList>
              <TabsTrigger value="fraud">Fraud Analyst</TabsTrigger>
              <TabsTrigger value="briefing">Shift Briefing</TabsTrigger>
              <TabsTrigger value="scans">Scan Analyst</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="fraud">
            <AiAnalystPanel
              loading={aiLoading}
              result={aiResult}
              openCount={open.length}
              analyzedAt={aiAnalyzedAt}
              onRefresh={() => setManualRefreshTick((n) => n + 1)}
            />
          </TabsContent>

          <TabsContent value="briefing">
            <AiInsightCard
              title="AI Shift Briefing"
              loading={briefLoading}
              error={briefError}
              risk={brief?.riskLevel}
              headline={brief?.headline}
              summary={brief?.summary}
              sections={
                brief
                  ? [
                      { label: "Trends", items: brief.trends },
                      { label: "Top actions this shift", items: brief.topActions },
                    ]
                  : []
              }
              analyzedAt={briefAt}
              onRefresh={() => void runBriefNow()}
              emptyMessage="Briefing will generate once data is loaded."
            />
          </TabsContent>

          <TabsContent value="scans">
            <AiInsightCard
              title="AI Scan Analyst"
              loading={scanLoading}
              error={scanError}
              risk={scanInsight?.riskLevel}
              headline={scanInsight?.headline}
              summary={scanInsight?.summary}
              sections={
                scanInsight
                  ? [
                      { label: "Hotspots", items: scanInsight.hotspots },
                      { label: "Watch these barcodes", items: scanInsight.watchBarcodes },
                      { label: "Recommended actions", items: scanInsight.recommendations },
                    ]
                  : []
              }
              analyzedAt={scanAnalyzedAt}
              onRefresh={() => {
                void runScanAi();
                toast.message("Re-running scan analysis…");
              }}
              emptyMessage="No scans yet to analyze."
            />
          </TabsContent>
        </Tabs>
      </Card>

      <Card className="p-4 flex items-center gap-4">
        <div className="size-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent-foreground shrink-0">
          <ShieldCheck className="size-5" />
        </div>
        <div className="text-sm">
          <div className="font-medium">Active detection rules</div>
          <div className="text-muted-foreground text-xs mt-0.5">
            Repeated expired/revoked scans (≥2 in 1h) · Location anomaly (same permit at 3+ checkpoints in 1h) · Burst of unregistered barcodes at a checkpoint (≥3 in 1h)
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

function KpiCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number | string;
  Icon: typeof Activity;
  tone?: "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive bg-destructive/10"
      : tone === "warn"
        ? "text-amber-600 bg-amber-500/10"
        : tone === "ok"
          ? "text-emerald-600 bg-emerald-500/10"
          : "text-primary bg-primary/10";
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`size-10 rounded-lg flex items-center justify-center ${toneClass}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold tracking-tight">{value}</div>
      </div>
    </Card>
  );
}

function AiAnalystPanel({
  loading,
  result,
  openCount,
  analyzedAt,
  onRefresh,
}: {
  loading: boolean;
  result: AiAnalystResult | null;
  openCount: number;
  analyzedAt: Date | null;
  onRefresh?: () => void;
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
        <div className="flex items-center gap-2">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Analyzing…
            </div>
          )}
          {onRefresh && (
            <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading || openCount === 0}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>
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