import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Search,
  Ban,
  Trash2,
  RotateCw,
  Eye,
  Printer,
  Plus,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  PERMIT_TYPE_LABELS,
  computedStatus,
  deletePermit,
  listPermits,
  updatePermit,
  type PermitRecord,
  type PermitStatus,
} from "@/lib/permits-firestore";
import { printPermit } from "@/lib/print-permit";

export const Route = createFileRoute("/_app/permits")({
  head: () => ({ meta: [{ title: "Permits · SPVMS" }] }),
  component: PermitsPage,
});

const PERMITS_QK = ["permits"] as const;

function PermitsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: PERMITS_QK,
    queryFn: listPermits,
  });

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PermitStatus>("all");
  const [viewing, setViewing] = useState<PermitRecord | null>(null);
  const [extending, setExtending] = useState<PermitRecord | null>(null);
  const [newDate, setNewDate] = useState("");
  const [deleting, setDeleting] = useState<PermitRecord | null>(null);
  const [revoking, setRevoking] = useState<PermitRecord | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const permits = data ?? [];

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return permits.filter((p) => {
      const status = computedStatus(p);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!term) return true;
      return (
        p.surname.toLowerCase().includes(term) ||
        p.givenNames.toLowerCase().includes(term) ||
        p.passport.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term) ||
        p.permitNumber.toLowerCase().includes(term)
      );
    });
  }, [permits, q, statusFilter]);

  const refresh = () => qc.invalidateQueries({ queryKey: PERMITS_QK });

  const doExtend = async () => {
    if (!extending || !newDate) return;
    if (new Date(newDate) <= new Date(extending.issueDate)) {
      toast.error("New expiry must be after the issue date.");
      return;
    }
    setActionBusy(true);
    try {
      await updatePermit(extending.id, { expiryDate: newDate, status: "valid" });
      toast.success("Permit extended.");
      setExtending(null);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to extend permit.");
    } finally {
      setActionBusy(false);
    }
  };

  const doRevoke = async () => {
    if (!revoking) return;
    setActionBusy(true);
    try {
      await updatePermit(revoking.id, { status: "revoked" });
      toast.success("Permit revoked.");
      setRevoking(null);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to revoke permit.");
    } finally {
      setActionBusy(false);
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    setActionBusy(true);
    try {
      await deletePermit(deleting.id);
      toast.success("Permit deleted.");
      setDeleting(null);
      await refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to delete permit.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Administration</p>
          <h1 className="text-3xl font-semibold tracking-tight">Permits</h1>
          <p className="text-muted-foreground">Manage issued visas, residence and work permits.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, passport, barcode, number"
              className="pl-9 w-80 max-w-full"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="valid">Valid</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={() => void refetch()} title="Refresh">
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button asChild>
            <Link to="/issue"><Plus className="size-4 mr-1" /> New permit</Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Holder</th>
                <th className="text-left px-4 py-3">Permit #</th>
                <th className="text-left px-4 py-3">Barcode</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Issued</th>
                <th className="text-left px-4 py-3">Expires</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="size-5 animate-spin inline mr-2" /> Loading permits…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-destructive">
                    Failed to load permits. {(error as Error).message}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    {permits.length === 0
                      ? "No permits issued yet. Click \"New permit\" to issue one."
                      : "No permits match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const status = computedStatus(p);
                  return (
                    <tr key={p.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{p.surname}, {p.givenNames}</div>
                        <div className="text-xs text-muted-foreground">{p.passport} · {p.nationality}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.permitNumber}</td>
                      <td className="px-4 py-3 font-mono text-xs">{p.barcode}</td>
                      <td className="px-4 py-3">{PERMIT_TYPE_LABELS[p.permitType]}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.issueDate), "d MMM yyyy")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{format(new Date(p.expiryDate), "d MMM yyyy")}</td>
                      <td className="px-4 py-3"><StatusBadge status={status} /></td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setViewing(p)} title="View details">
                            <Eye className="size-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printPermit(p)} title="Print">
                            <Printer className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setExtending(p); setNewDate(p.expiryDate); }}
                            title="Extend"
                          >
                            <RotateCw className="size-3.5" />
                          </Button>
                          {p.status !== "revoked" && (
                            <Button size="sm" variant="ghost" onClick={() => setRevoking(p)} title="Revoke">
                              <Ban className="size-3.5" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setDeleting(p)} title="Delete">
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View details modal */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Permit details</DialogTitle>
            <DialogDescription>
              {viewing && `${PERMIT_TYPE_LABELS[viewing.permitType]} · ${viewing.permitNumber}`}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <Detail label="Surname" value={viewing.surname} />
              <Detail label="Given names" value={viewing.givenNames} />
              <Detail label="Passport" value={viewing.passport} />
              <Detail label="Nationality" value={viewing.nationality} />
              <Detail label="Date of birth" value={viewing.dateOfBirth ? format(new Date(viewing.dateOfBirth), "d MMM yyyy") : "—"} />
              <Detail label="Gender" value={viewing.gender} capitalize />
              <Detail label="Permit type" value={PERMIT_TYPE_LABELS[viewing.permitType]} />
              <Detail label="Status" value={computedStatus(viewing)} capitalize />
              <Detail label="Issue date" value={format(new Date(viewing.issueDate), "d MMM yyyy")} />
              <Detail label="Expiry date" value={format(new Date(viewing.expiryDate), "d MMM yyyy")} />
              <Detail label="Port of issue" value={viewing.portOfIssue} full />
              {viewing.employer && <Detail label="Employer" value={viewing.employer} />}
              {viewing.occupation && <Detail label="Occupation" value={viewing.occupation} />}
              {viewing.institution && <Detail label="Institution" value={viewing.institution} full />}
              {viewing.conditions && <Detail label="Conditions" value={viewing.conditions} full />}
              <Detail label="Permit number" value={viewing.permitNumber} mono />
              <Detail label="Barcode" value={viewing.barcode} mono />
              <Detail label="Issued by" value={viewing.issuedBy} full />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setViewing(null)}>Close</Button>
            {viewing && (
              <Button onClick={() => printPermit(viewing)}>
                <Printer className="size-4 mr-1" /> Print
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend modal */}
      <Dialog open={!!extending} onOpenChange={(o) => !o && setExtending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend permit</DialogTitle>
            <DialogDescription>Set a new expiry date. Status will be reset to valid.</DialogDescription>
          </DialogHeader>
          {extending && (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="font-medium">{extending.surname}, {extending.givenNames}</div>
                <div className="text-muted-foreground font-mono text-xs">{extending.permitNumber}</div>
              </div>
              <label className="text-sm font-medium">New expiry date</label>
              <Input type="date" min={extending.issueDate} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtending(null)} disabled={actionBusy}>Cancel</Button>
            <Button onClick={doExtend} disabled={actionBusy || !newDate}>
              {actionBusy && <Loader2 className="size-4 mr-1 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this permit?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking && `${revoking.surname}, ${revoking.givenNames} (${revoking.permitNumber}) will be marked as revoked and fail verification at any port of entry.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doRevoke} disabled={actionBusy}>
              {actionBusy && <Loader2 className="size-4 mr-1 animate-spin" />} Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this permit?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the record from the database. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} disabled={actionBusy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {actionBusy && <Loader2 className="size-4 mr-1 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Detail({
  label,
  value,
  full,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  full?: boolean;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-medium ${mono ? "font-mono text-xs" : ""} ${capitalize ? "capitalize" : ""}`}>
        {value}
      </div>
    </div>
  );
}