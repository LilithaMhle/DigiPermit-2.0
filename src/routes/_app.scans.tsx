import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Search, MapPin, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { subscribeToScans, type ScanEvent, type VerificationResult } from "@/lib/scans-firestore";
import { useCurrentUser } from "@/lib/auth-store";

export const Route = createFileRoute("/_app/scans")({
  head: () => ({ meta: [{ title: "Scan Log · SPVMS" }] }),
  component: ScansPage,
});

const FILTERS: ("all" | VerificationResult)[] = ["all", "valid", "expired", "revoked", "not_found"];

function ScansPage() {
  const [scans, setScans] = useState<ScanEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  const user = useCurrentUser();

  useEffect(() => {
    const unsub = subscribeToScans((s) => {
      setScans(s);
      setErr(null);
    }, 200, user?.role === "officer" ? user.id : undefined);
    return () => unsub();
  }, [user]);

  // onSnapshot doesn't surface initial errors via callback; wrap with try in effect setup
  useEffect(() => {
    // noop; placeholder for symmetry
  }, []);

  const filtered = useMemo(() => {
    const list = scans ?? [];
    const term = q.trim().toLowerCase();
    return list.filter((s) => {
      if (filter !== "all" && s.result !== filter) return false;
      if (!term) return true;
      return (
        s.barcode.toLowerCase().includes(term) ||
        s.locationLabel.toLowerCase().includes(term) ||
        s.officerName.toLowerCase().includes(term) ||
        (s.holderName ?? "").toLowerCase().includes(term) ||
        (s.permitNumber ?? "").toLowerCase().includes(term)
      );
    });
  }, [scans, q, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, valid: 0, expired: 0, revoked: 0, not_found: 0 };
    for (const s of scans ?? []) {
      c.all++;
      c[s.result]++;
    }
    return c;
  }, [scans]);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">IoT Audit Trail</p>
          <h1 className="text-3xl font-semibold tracking-tight">Scan Log</h1>
          <p className="text-muted-foreground">
            Every verification event captured from field devices in real time. Live-syncing from the central database.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-success animate-pulse" />
          Live
        </div>
      </div>

      <Card className="p-4 flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search barcode, holder, officer or location"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md capitalize transition-colors ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary hover:bg-secondary/80"
              }`}
            >
              {f.replace("_", " ")} ({counts[f] ?? 0})
            </button>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Barcode</th>
                <th className="text-left px-4 py-3">Holder</th>
                <th className="text-left px-4 py-3">Result</th>
                <th className="text-left px-4 py-3">Officer</th>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Coordinates</th>
              </tr>
            </thead>
            <tbody>
              {scans === null ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" /> Connecting to live scan feed…
                  </td>
                </tr>
              ) : err ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-destructive">
                    Failed to load scan log: {err}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {(scans ?? []).length === 0
                      ? "No scans recorded yet. Verify a permit on the Verify Permit page."
                      : "No scans match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {s.timestamp
                        ? format(s.timestamp.toDate(), "d MMM yyyy, HH:mm:ss")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{s.barcode}</td>
                    <td className="px-4 py-3">
                      {s.holderName ? (
                        <div>
                          <div className="font-medium">{s.holderName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{s.permitNumber}</div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Unregistered</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.result} />
                    </td>
                    <td className="px-4 py-3">{s.officerName}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-muted-foreground" />
                        {s.locationLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.lat.toFixed(3)}, {s.lng.toFixed(3)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}