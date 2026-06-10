import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { listRenewalRequests, updateRenewalRequestStatus, RenewalRequest } from "@/lib/renewal-firestore";
import { updatePermit, getPermitByNumber } from "@/lib/permits-firestore";
import { AiInsightCard } from "@/components/ai/AiInsightCard";
import { useServerFn } from "@tanstack/react-start";
import { reviewRenewal, type RenewalReview } from "@/lib/ai-insights.functions";

export const Route = createFileRoute("/_app/renewals")({
  head: () => ({ meta: [{ title: "Renewal Requests · Admin" }] }),
  component: RenewalsPage,
});

function RenewalsPage() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<RenewalRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [modalMode, setModalMode] = useState<"info" | "approve" | "reject" | null>(null);
  const [infoMessage, setInfoMessage] = useState<string>("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [approveExpiryDate, setApproveExpiryDate] = useState<string>("");
  const [aiReview, setAiReview] = useState<RenewalReview | null>(null);
  const [aiReviewLoading, setAiReviewLoading] = useState(false);
  const [aiReviewError, setAiReviewError] = useState<string | null>(null);
  const runReview = useServerFn(reviewRenewal);

  useEffect(() => {
    if (!showDetailsModal || !selectedRequest) {
      setAiReview(null);
      setAiReviewError(null);
      return;
    }
    let cancelled = false;
    setAiReview(null);
    setAiReviewError(null);
    setAiReviewLoading(true);
    (async () => {
      try {
        let permitType: string | null = null;
        let currentStatus: string | null = null;
        let currentExpiry: string | null = null;
        try {
          const p = await getPermitByNumber(selectedRequest.permitNumber);
          if (p) {
            permitType = p.permitType;
            currentStatus = p.status;
            currentExpiry = p.expiryDate;
          }
        } catch {
          /* tolerate lookup failure */
        }
        const res = await runReview({
          data: {
            permitNumber: selectedRequest.permitNumber,
            permitType,
            currentStatus,
            currentExpiry,
            holderName: selectedRequest.userName,
            comments: selectedRequest.comments ?? "",
            priorRenewals: selectedRequest.responses?.length ?? 0,
            openAlertsForBarcode: 0,
            recentInvalidScans: 0,
          },
        });
        if (!cancelled) setAiReview(res);
      } catch (e) {
        if (!cancelled) setAiReviewError((e as Error).message ?? "AI review failed.");
      } finally {
        if (!cancelled) setAiReviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showDetailsModal, selectedRequest, runReview]);

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

  const openActionModal = (request: RenewalRequest, mode: "info" | "approve" | "reject") => {
    setSelectedRequest(request);
    setModalMode(mode);
    setInfoMessage("");
    setRejectReason("");
    setApproveExpiryDate("");
    setShowDetailsModal(true);
  };

  const handleRequestMoreInfo = async () => {
    if (!selectedRequest) return;
    setBusyId(selectedRequest.id);
    try {
      await updateRenewalRequestStatus(selectedRequest.id, "info_required", infoMessage.trim() || undefined);
      toast.success("Marked as requiring additional info.");
      setShowDetailsModal(false);
      setSelectedRequest(null);
      setInfoMessage("");
      await qc.invalidateQueries({ queryKey: ["admin", "renewals"] });
    } catch (err) {
      toast.error((err as Error).message || "Unable to update request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setBusyId(selectedRequest.id);
    try {
      await updateRenewalRequestStatus(selectedRequest.id, "rejected", rejectReason.trim() || "Request rejected by admin.");
      toast.success("Request rejected.");
      setShowDetailsModal(false);
      setSelectedRequest(null);
      setRejectReason("");
      await qc.invalidateQueries({ queryKey: ["admin", "renewals"] });
    } catch (err) {
      toast.error((err as Error).message || "Unable to update request.");
    } finally {
      setBusyId(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (!approveExpiryDate) return toast.error("Select a new expiry date.");
    setBusyId(selectedRequest.id);
    try {
      // Try to update permit expiry
      let permitId = selectedRequest.permitId;
      if (!permitId) {
        const p = await getPermitByNumber(selectedRequest.permitNumber);
        permitId = p?.id;
      }
      if (permitId) {
        await updatePermit(permitId, { expiryDate: approveExpiryDate, status: "valid" });
      }
      await updateRenewalRequestStatus(selectedRequest.id, "approved");
      toast.success("Request approved and permit updated.");
      setShowDetailsModal(false);
      setSelectedRequest(null);
      setApproveExpiryDate("");
      await qc.invalidateQueries({ queryKey: ["admin", "renewals"] });
      await qc.invalidateQueries({ queryKey: ["permits"] });
    } catch (err) {
      toast.error((err as Error).message || "Unable to approve request.");
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
                        
                        <Button size="sm" variant="secondary" disabled={busyId === request.id} onClick={() => openActionModal(request, "info")}>Info</Button>
                        <Button size="sm" variant="destructive" disabled={busyId === request.id} onClick={() => openActionModal(request, "reject")}>Reject</Button>
                        <Button size="sm" variant="outline" disabled={busyId === request.id} onClick={() => openActionModal(request, "approve")}>Approve</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog
        open={showDetailsModal}
        onOpenChange={(open) => {
          setShowDetailsModal(open);
          if (!open) {
            setSelectedRequest(null);
            setInfoMessage("");
            setModalMode(null);
            setRejectReason("");
            setApproveExpiryDate("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Renewal Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Permit Number</p>
                  <p className="font-medium">{selectedRequest.permitNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium capitalize">{selectedRequest.status.replace("_", " ")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Holder Name</p>
                  <p className="font-medium">{selectedRequest.userName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium text-sm">{selectedRequest.userEmail}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Submitted</p>
                  <p className="font-medium">{new Date(selectedRequest.submittedAt.toDate?.() ?? selectedRequest.submittedAt).toLocaleString()}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Comments</p>
                <p className="p-3 bg-secondary/50 rounded-md">{selectedRequest.comments || "No additional comments provided."}</p>
              </div>
              {selectedRequest.responses && selectedRequest.responses.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Holder replies</p>
                  <div className="space-y-3">
                    {selectedRequest.responses.map((resp: any, idx: number) => (
                      <div key={idx} className="p-3 bg-secondary/60 rounded-md">
                        <p className="text-xs text-muted-foreground">{resp.from === selectedRequest.userId ? "Holder" : resp.from} • {new Date(resp.at?.toDate?.() ?? resp.at).toLocaleString()}</p>
                        <p className="mt-1">{resp.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <AiInsightCard
                title="DigiPermit AI Renewal Recommendation"
                loading={aiReviewLoading}
                error={aiReviewError}
                risk={
                  aiReview
                    ? aiReview.recommendation === "approve"
                      ? "low"
                      : aiReview.recommendation === "request_more_info"
                        ? "medium"
                        : "high"
                    : undefined
                }
                headline={
                  aiReview
                    ? aiReview.recommendation === "approve"
                      ? "Recommend: Approve"
                      : aiReview.recommendation === "request_more_info"
                        ? "Recommend: Request more info"
                        : "Recommend: Reject"
                    : undefined
                }
                summary={aiReview?.reasoning}
                sections={
                  aiReview
                    ? [
                        { label: `Risk factors (confidence: ${aiReview.confidence})`, items: aiReview.riskFactors },
                      ]
                    : []
                }
                analyzedAt={aiReview ? new Date() : null}
                compact
              />

              {modalMode === "reject" && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Rejection reason</p>
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason((e.target as HTMLTextAreaElement).value)} rows={4} placeholder="Provide a reason for rejecting this request" />
                </div>
              )}

              {modalMode === "approve" && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">New expiry date</p>
                  <input type="date" value={approveExpiryDate} onChange={(e) => setApproveExpiryDate(e.target.value)} className="rounded-md border border-border p-2" />
                </div>
              )}
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Message to permit holder</label>
                <Textarea
                  value={infoMessage}
                  onChange={(e) => setInfoMessage((e.target as HTMLTextAreaElement).value)}
                  placeholder="Describe what information is required from the permit holder"
                  rows={4}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
            {modalMode === "info" && (
              <Button variant="secondary" disabled={busyId === selectedRequest?.id || infoMessage.trim() === ""} onClick={() => void handleRequestMoreInfo()}>Request More Info</Button>
            )}
            {modalMode === "reject" && (
              <Button variant="destructive" disabled={busyId === selectedRequest?.id || rejectReason.trim() === ""} onClick={() => void handleReject()}>Reject</Button>
            )}
            {modalMode === "approve" && (
              <Button variant="outline" disabled={busyId === selectedRequest?.id || !approveExpiryDate} onClick={() => void handleApprove()}>Approve</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
