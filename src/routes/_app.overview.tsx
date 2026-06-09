import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScanLine, FileCheck2, AlertTriangle, Activity, ArrowRight, Download, Loader2 } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDistanceToNow, format, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { listExpiringPermits, listPermits } from "@/lib/permits-firestore";
import { subscribeToScans, type ScanEvent } from "@/lib/scans-firestore";
import { subscribeToAlerts, type AIAlert } from "@/lib/alerts-firestore";
import { listRenewalRequests } from "@/lib/renewal-firestore";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/overview")({
  head: () => ({
    meta: [
      { title: "Overview · DigiPermit Verification System" },
      { name: "description", content: "Real-time dashboard for permit verification, scan activity, and AI fraud alerts." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const [permits, setPermits] = useState<any[]>([]);
  const [scans, setScans] = useState<ScanEvent[]>([]);
  const [alerts, setAlerts] = useState<AIAlert[]>([]);
  const [expiringCount, setExpiringCount] = useState(0);
  const [pendingRenewals, setPendingRenewals] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Filter state
  const today = new Date().toISOString().slice(0, 10);
  const defaultStartDate = new Date();
  defaultStartDate.setDate(defaultStartDate.getDate() - 30); // 30 days ago
  const [startDate, setStartDate] = useState(defaultStartDate.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(today);

  // Load non-realtime data + subscribe to realtime feeds (scans + alerts)
  useEffect(() => {
    let cancelled = false;
    const loadStatic = async () => {
      try {
        const [permitsData, expiring, renewalRequests] = await Promise.all([
          listPermits(),
          listExpiringPermits(30),
          listRenewalRequests(),
        ]);
        if (cancelled) return;
        setPermits(permitsData);
        setExpiringCount(expiring.length);
        setPendingRenewals(
          renewalRequests.filter(
            (r) => r.status === "submitted" || r.status === "under_review" || r.status === "info_required",
          ).length,
        );
      } catch (err) {
        console.error("Failed to load data:", err);
        toast.error("Failed to load dashboard data");
      }
    };
    loadStatic();

    const unsubScans = subscribeToScans((s) => {
      setScans(s);
      setLoading(false);
    }, 500);
    const unsubAlerts = subscribeToAlerts((a) => setAlerts(a), 200);

    return () => {
      cancelled = true;
      unsubScans();
      unsubAlerts();
    };
  }, []);

  // Live clock — refresh "now" every 30s so the today's-activity chart progresses
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // Filter scans by date range
  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      const scanDate = s.timestamp ? new Date(typeof s.timestamp === 'object' ? s.timestamp.toDate?.() : s.timestamp) : new Date();
      const start = startOfDay(new Date(startDate));
      const end = endOfDay(new Date(endDate));
      return isAfter(scanDate, start) && isBefore(scanDate, end);
    });
  }, [scans, startDate, endDate]);

  const stats = useMemo(() => {
    const today = filteredScans.filter((s) => {
      const scanDate = s.timestamp ? new Date(typeof s.timestamp === 'object' ? s.timestamp.toDate?.() : s.timestamp) : new Date();
      return scanDate.toDateString() === new Date().toDateString();
    });
    const invalid = filteredScans.filter((s) => s.result !== "valid");
    return {
      totalPermits: permits.length,
      scansInRange: filteredScans.length,
      scansToday: today.length,
      invalidRate: filteredScans.length ? Math.round((invalid.length / filteredScans.length) * 100) : 0,
      openAlerts: alerts.filter((a) => !a.resolved).length,
    };
  }, [permits, filteredScans, alerts]);

  // Scan Activity — always shows TODAY hour-by-hour, up to the current hour
  const hourly = useMemo(() => {
    const currentHour = now.getHours();
    const todayStr = now.toDateString();
    const buckets: Record<number, { hour: string; valid: number; invalid: number }> = {};
    for (let h = 0; h <= currentHour; h++) {
      buckets[h] = { hour: `${String(h).padStart(2, "0")}:00`, valid: 0, invalid: 0 };
    }
    scans.forEach((s) => {
      const scanDate = s.timestamp
        ? new Date(typeof s.timestamp === "object" ? s.timestamp.toDate?.() : s.timestamp)
        : new Date();
      if (scanDate.toDateString() !== todayStr) return;
      const h = scanDate.getHours();
      if (h > currentHour) return;
      if (s.result === "valid") buckets[h].valid++;
      else buckets[h].invalid++;
    });
    return Object.values(buckets);
  }, [scans, now]);

  const resultBreakdown = useMemo(() => {
    const counts: Record<string, number> = { valid: 0, expired: 0, revoked: 0, not_found: 0 };
    filteredScans.forEach((s) => counts[s.result]++);
    return [
      { name: "Valid", value: counts.valid, color: "oklch(0.65 0.17 155)" },
      { name: "Expired", value: counts.expired, color: "oklch(0.78 0.16 75)" },
      { name: "Revoked", value: counts.revoked, color: "oklch(0.6 0.22 25)" },
      { name: "Not Found", value: counts.not_found, color: "oklch(0.6 0.03 250)" },
    ];
  }, [filteredScans]);

  const hotspots = useMemo(() => {
    const map: Record<string, { location: string; total: number; invalid: number }> = {};
    filteredScans.forEach((s) => {
      if (!map[s.locationLabel]) map[s.locationLabel] = { location: s.locationLabel, total: 0, invalid: 0 };
      map[s.locationLabel].total++;
      if (s.result !== "valid") map[s.locationLabel].invalid++;
    });
    return Object.values(map).sort((a, b) => b.invalid - a.invalid).slice(0, 5);
  }, [filteredScans]);

  // Export functions
  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ["Barcode", "Holder Name", "Permit #", "Location", "Result", "Officer", "Timestamp"];
      const rows = filteredScans.map((s) => [
        s.barcode,
        s.holderName || "—",
        s.permitNumber || "—",
        s.locationLabel,
        s.result,
        s.officerName,
        s.timestamp ? new Date(typeof s.timestamp === 'object' ? s.timestamp.toDate?.() : s.timestamp).toLocaleString() : "—",
      ]);

      const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scans_${format(new Date(startDate), "yyyy-MM-dd")}_to_${format(new Date(endDate), "yyyy-MM-dd")}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Scan data exported to CSV");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const exportToJSON = () => {
    setExporting(true);
    try {
      const data = {
        exportDate: new Date().toISOString(),
        dateRange: { start: startDate, end: endDate },
        summary: stats,
        scans: filteredScans.map((s) => ({
          ...s,
          timestamp: s.timestamp ? new Date(typeof s.timestamp === 'object' ? s.timestamp.toDate?.() : s.timestamp).toISOString() : null,
        })),
      };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `scans_${format(new Date(startDate), "yyyy-MM-dd")}_to_${format(new Date(endDate), "yyyy-MM-dd")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Scan data exported to JSON");
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-screen">
        <Card className="p-10 text-center">
          <Loader2 className="size-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Department of Home Affairs</p>
        <h1 className="text-3xl font-semibold tracking-tight">Operations Overview</h1>
        <p className="text-muted-foreground">Real-time permit verification activity across all checkpoints.</p>
      </div>

      {/* Date Filter Controls */}
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <Label htmlFor="start-date" className="text-xs">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <Label htmlFor="end-date" className="text-xs">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const d = new Date();
                setStartDate(d.toISOString().slice(0, 10));
                setEndDate(d.toISOString().slice(0, 10));
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 7);
                setStartDate(start.toISOString().slice(0, 10));
                setEndDate(end.toISOString().slice(0, 10));
              }}
            >
              Last 7 Days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const end = new Date();
                const start = new Date();
                start.setDate(start.getDate() - 30);
                setStartDate(start.toISOString().slice(0, 10));
                setEndDate(end.toISOString().slice(0, 10));
              }}
            >
              Last 30 Days
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                setStartDate(d.toISOString().slice(0, 10));
                setEndDate(new Date().toISOString().slice(0, 10));
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={exportToCSV}
            disabled={exporting}
            className="gap-2"
          >
            <Download className="size-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={exportToJSON}
            disabled={exporting}
            className="gap-2"
          >
            <Download className="size-4" />
            {exporting ? "Exporting..." : "Export JSON"}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filteredScans.length} scans from {format(new Date(startDate), "MMM d, yyyy")} to {format(new Date(endDate), "MMM d, yyyy")}
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Permits" value={stats.totalPermits} icon={FileCheck2} accent />
        <StatCard label="Expiring permits" value={expiringCount} icon={AlertTriangle} tone={expiringCount > 0 ? "warn" : undefined} />
        <StatCard label="Pending renewals" value={pendingRenewals} icon={ArrowRight} tone={pendingRenewals > 0 ? "warn" : undefined} />
        <StatCard label="Open AI Alerts" value={stats.openAlerts} icon={AlertTriangle} tone={stats.openAlerts > 0 ? "danger" : undefined} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Scan Activity</h2>
              <p className="text-sm text-muted-foreground">
                Today's verifications by hour · live as of {format(now, "HH:mm")}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={hourly}>
                <defs>
                  <linearGradient id="g-valid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.17 155)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.65 0.17 155)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-inv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.6 0.22 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 245)" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.03 250)" />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.5 0.03 250)" />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid oklch(0.9 0.015 245)" }} />
                <Area type="monotone" dataKey="valid" stroke="oklch(0.65 0.17 155)" fill="url(#g-valid)" strokeWidth={2} />
                <Area type="monotone" dataKey="invalid" stroke="oklch(0.6 0.22 25)" fill="url(#g-inv)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold mb-1">Verification Results</h2>
          <p className="text-sm text-muted-foreground mb-4">Distribution across all scans</p>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={resultBreakdown} dataKey="value" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {resultBreakdown.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6">
          <h2 className="font-semibold mb-1">Violation Hotspots</h2>
          <p className="text-sm text-muted-foreground mb-4">Locations with highest invalid scan counts</p>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={hotspots} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.015 245)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="location" tick={{ fontSize: 11 }} width={170} />
                <Tooltip />
                <Bar dataKey="invalid" fill="oklch(0.6 0.22 25)" radius={[0, 4, 4, 0]} name="Invalid" />
                <Bar dataKey="total" fill="oklch(0.32 0.12 255)" radius={[0, 4, 4, 0]} name="Total scans" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Scans</h2>
            <Link to="/scans" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
              View all <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {filteredScans.slice(0, 6).map((s) => {
              const scanDate = s.timestamp ? new Date(typeof s.timestamp === 'object' ? s.timestamp.toDate?.() : s.timestamp) : new Date();
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-mono text-xs truncate">{s.barcode}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {s.locationLabel} · {formatDistanceToNow(scanDate, { addSuffix: true })}
                    </div>
                  </div>
                  <StatusBadge status={s.result} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  tone,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  tone?: "warn" | "danger";
}) {
  return (
    <Card className="p-5 relative overflow-hidden">
      {accent && (
        <div className="absolute inset-0 opacity-[0.06]" style={{ background: "var(--gradient-hero)" }} />
      )}
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="text-3xl font-semibold mt-2">{value}</div>
        </div>
        <div
          className={
            "size-10 rounded-lg flex items-center justify-center " +
            (tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : tone === "warn"
                ? "bg-warning/20 text-warning-foreground"
                : "bg-primary/10 text-primary")
          }
        >
          <Icon className="size-5" />
        </div>
      </div>
    </Card>
  );
}