import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { listRenewalRequests, updateRenewalRequestStatus, RenewalRequest } from "@/lib/renewal-firestore";

export const Route = createFileRoute("/_app/renewals")({
  head: () => ({ meta: [{ title: "Renewal Requests · Admin" }] }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["admin", "renewals"],
    queryFn: () => listRenewalRequests(),
  });

  const handleAction = async (request: RenewalRequest, status: "approved" | "rejected" | "under_review" | "info_required") => {
    setBusyId(request.id);
    try {
      await updateRenewalRequestStatus(request.id, status, status === "rejected" ? "Request rejected by admin." : undefined);
      toast.success("Request updated.");
      await qc.invalidateQueries({ queryKey: ["admin", "renewals"] });
    } catch (err) {
      toast.error((err as Error).message || "Unable to update request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Administration</p>
        <h1 className="text-3xl font-semibold tracking-tight">Permit Renewal Requests</h1>
        <p className="text-muted-foreground">Review permit holder renewal submissions and update the request status.</p>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Permit</th>
                <th className="text-left px-4 py-3">Holder</th>
                <th className="text-left px-4 py-3">Submitted</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading renewal requests…</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-destructive">{(error as Error).message}</td>
                </tr>
              ) : !data || data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No renewal requests found.</td>
                </tr>
              ) : (
                data.map((request) => (
                  <tr key={request.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{request.permitNumber}</div>
                      <div className="text-muted-foreground text-xs">{request.comments || "No message"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{request.userName}</div>
                      <div className="text-muted-foreground text-xs">{request.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(request.submittedAt.toDate?.() ?? request.submittedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 capitalize">{request.status.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === request.id} onClick={() => void handleAction(request, "approved")}>Approve</Button>
                        <Button size="sm" variant="secondary" disabled={busyId === request.id} onClick={() => void handleAction(request, "info_required")}>Info</Button>
                        <Button size="sm" variant="destructive" disabled={busyId === request.id} onClick={() => void handleAction(request, "rejected")}>Reject</Button>
                      </div>
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
