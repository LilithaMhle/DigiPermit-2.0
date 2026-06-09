import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/auth-store";
import { getPermitByNumber, PermitRecord, computedStatus } from "@/lib/permits-firestore";
import { createRenewalRequest, listUserRenewalRequests, RenewalRequest, addRenewalResponse } from "@/lib/renewal-firestore";
import { updateUserProfile } from "@/lib/users-firestore";
import { printPermit } from "@/lib/print-permit";
import { logAuditEvent } from "@/lib/audit-firestore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShieldCheck, Lock } from "lucide-react";
import {
  pickVerificationQuestions,
  checkAnswer,
  getLockState,
  recordFailure,
  recordSuccess,
  formatLockRemaining,
  MAX_ATTEMPTS,
  type VerificationQuestion,
} from "@/lib/verification";

function formatDate(value?: string): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return value;
  }
}

export default function PermitHolderProfile() {
  const user = useCurrentUser();
  const [permitNumber, setPermitNumber] = useState(user?.permitNumber ?? "");
  const [permit, setPermit] = useState<PermitRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [attachments, setAttachments] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<RenewalRequest[]>([]);
  const [replyRequestId, setReplyRequestId] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [replying, setReplying] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Ownership verification state
  const [pendingPermit, setPendingPermit] = useState<PermitRecord | null>(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [questions, setQuestions] = useState<VerificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);
  const [lockInfo, setLockInfo] = useState<{ locked: boolean; remainingMs: number; attemptsUsed: number }>({ locked: false, remainingMs: 0, attemptsUsed: 0 });
  const [saveAfterVerify, setSaveAfterVerify] = useState(true);

  const isPermitHolder = user?.role === "permit_holder";

  const loadRequests = async () => {
    if (!user) return;
    try {
      const list = await listUserRenewalRequests(user.id);
      setRequests(list);
    } catch (err) {
      toast.error((err as Error).message || "Unable to load renewal requests.");
    }
  };

  useEffect(() => {
    void loadRequests();
  }, [user]);

  const sendReply = async (requestId: string) => {
    if (!user) return;
    if (!replyMessage.trim()) return toast.error("Enter a message to send.");
    setReplying(true);
    try {
      await addRenewalResponse(requestId, user.id, replyMessage.trim());
      toast.success("Reply sent.");
      setReplyRequestId(null);
      setReplyMessage("");
      await loadRequests();
    } catch (err) {
      toast.error((err as Error).message || "Unable to send reply.");
    } finally {
      setReplying(false);
    }
  };

  useEffect(() => {
    if (!user?.permitNumber || permit) return;
    setPermitNumber(user.permitNumber);
    void fetchPermit(false);
  }, [user?.permitNumber]);

  const fetchPermit = async (saveToProfile = true) => {
    if (!permitNumber?.trim()) return toast.error("Enter a permit number.");
    const num = permitNumber.trim();
    const lock = getLockState(num, user?.id);
    if (lock.locked) {
      setLockInfo(lock);
      toast.error(`Too many failed attempts. Locked for ${formatLockRemaining(lock.remainingMs)}.`);
      return;
    }
    setLoading(true);
    try {
      const result = await getPermitByNumber(num);
      if (!result) {
        toast.error("Permit not found. Please verify the number and try again.");
        setPermit(null);
        return;
      }
      // If this permit is already linked to the signed-in profile, skip verification.
      if (user?.permitNumber && user.permitNumber.toUpperCase() === result.permitNumber.toUpperCase()) {
        setPermit(result);
        recordSuccess(result.permitNumber, user.id);
        void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "permit_viewed", targetId: result.id, targetType: "permit", details: result.permitNumber });
        toast.success("Saved permit loaded.");
        return;
      }
      // Otherwise require ownership verification before exposing the record.
      setPendingPermit(result);
      setQuestions(pickVerificationQuestions(result, 3));
      setAnswers({});
      setSaveAfterVerify(saveToProfile);
      setLockInfo(getLockState(result.permitNumber, user?.id));
      setVerifyOpen(true);
    } catch (err) {
      toast.error((err as Error).message || "Unable to load permit.");
    } finally {
      setLoading(false);
    }
  };

  const submitVerification = async () => {
    if (!pendingPermit || !user) return;
    setVerifying(true);
    try {
      const allCorrect = questions.every((q) => checkAnswer(q, answers[q.key] ?? ""));
      if (!allCorrect) {
        const res = recordFailure(pendingPermit.permitNumber, user.id);
        void logAuditEvent({
          actorId: user.id,
          actorEmail: user.email,
          action: "permit_verification_failed",
          targetType: "permit",
          details: JSON.stringify({ permitNumber: pendingPermit.permitNumber, attemptsUsed: res.attemptsUsed, device: typeof navigator !== "undefined" ? navigator.userAgent : "" }),
        });
        setLockInfo(getLockState(pendingPermit.permitNumber, user.id));
        if (res.locked) {
          toast.error(`Verification failed. Account temporarily locked after ${MAX_ATTEMPTS} failed attempts.`);
          setVerifyOpen(false);
          setPendingPermit(null);
        } else {
          toast.error(`Verification failed. ${res.remaining} attempt${res.remaining === 1 ? "" : "s"} remaining.`);
        }
        return;
      }
      // Success
      recordSuccess(pendingPermit.permitNumber, user.id);
      setPermit(pendingPermit);
      void logAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "permit_verification_passed",
        targetId: pendingPermit.id,
        targetType: "permit",
        details: JSON.stringify({ permitNumber: pendingPermit.permitNumber, device: typeof navigator !== "undefined" ? navigator.userAgent : "" }),
      });
      void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "permit_viewed", targetId: pendingPermit.id, targetType: "permit", details: pendingPermit.permitNumber });
      if (saveAfterVerify) {
        try {
          await updateUserProfile(user.id, { permitNumber: pendingPermit.permitNumber });
          setProfileSaved(true);
        } catch {
          // non-fatal; permit still shown
        }
      }
      toast.success("Identity verified. Permit loaded.");
      setVerifyOpen(false);
      setPendingPermit(null);
      setAnswers({});
    } finally {
      setVerifying(false);
    }
  };

  const printVerifiedPermit = (p: PermitRecord) => {
    if (user) {
      void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "permit_printed", targetId: p.id, targetType: "permit", details: p.permitNumber });
    }
    printPermit(p);
  };

  const clearSavedPermit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await updateUserProfile(user.id, { permitNumber: null });
      setPermitNumber("");
      setPermit(null);
      setProfileSaved(false);
      toast.success("Saved permit removed.");
    } catch (err) {
      toast.error((err as Error).message || "Unable to remove saved permit.");
    } finally {
      setLoading(false);
    }
  };

  const handleAttachment = async (file: File | null) => {
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Unable to read file."));
      };
      reader.onerror = () => reject(reader.error ?? new Error("File read error"));
      reader.readAsDataURL(file);
    });
    setAttachments((prev) => [...prev, { name: file.name, type: file.type, data }]);
  };

  const submitRenewal = async () => {
    if (!user) return;
    if (!permit?.permitNumber) return toast.error("Load your permit first.");
    if (!requestMessage.trim()) return toast.error("Enter a message describing your renewal request.");
    setSubmitting(true);
    try {
      await createRenewalRequest({
        userId: user.id,
        userEmail: user.email,
        userName: user.fullName,
        permitNumber: permit.permitNumber,
        comments: requestMessage.trim(),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      setRequestMessage("");
      setAttachments([]);
      toast.success("Renewal request submitted.");
      await loadRequests();
    } catch (err) {
      toast.error((err as Error).message || "Failed to submit renewal request.");
    } finally {
      setSubmitting(false);
    }
  };

  const expiryCountdown = useMemo(() => {
    if (!permit?.expiryDate) return null;
    const expiry = new Date(permit.expiryDate);
    const now = new Date();
    const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return "Expired";
    return `${diff} day${diff === 1 ? "" : "s"}`;
  }, [permit]);

  if (!user) {
    return <div className="p-6">Loading user information…</div>;
  }

  if (!isPermitHolder) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card className="p-6">
          <h1 className="text-2xl font-semibold">Permit holder portal</h1>
          <p className="mt-2 text-muted-foreground">This area is reserved for verified permit holders. If you believe you have access, contact an administrator.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <Card className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Permit Holder Portal</p>
            <h1 className="text-3xl font-semibold">{user.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Permit number</p>
              <p className="mt-2 font-medium">{permit?.permitNumber ?? "Not loaded"}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Permit status</p>
              <p className="mt-2 font-medium capitalize">{permit ? computedStatus(permit) : "Unknown"}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Expiry countdown</p>
              <p className="mt-2 font-medium">{expiryCountdown ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Contact</p>
              <p className="mt-2 font-medium">{user.contactPhone ?? user.email}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Review your permit</p>
            <h2 className="text-xl font-semibold">Enter permit number</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="permit-number">Permit number</Label>
              <Input
                id="permit-number"
                value={permitNumber}
                onChange={(e) => setPermitNumber(e.target.value)}
                placeholder="e.g. GW-2026-123456"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => void fetchPermit()} disabled={loading}>
                {loading ? "Loading…" : "Load permit"}
              </Button>
              <Button variant="outline" onClick={() => setPermitNumber("")}>Clear</Button>
              {user?.permitNumber && permit?.permitNumber === user.permitNumber && (
                <Button variant="secondary" onClick={clearSavedPermit} disabled={loading}>
                  Remove saved permit
                </Button>
              )}
            </div>
            {profileSaved && <p className="text-sm text-success">Permit number saved to your profile.</p>}
            {!profileSaved && user?.permitNumber && permit?.permitNumber === user.permitNumber && (
              <p className="text-sm text-muted-foreground">Loaded from your saved permit profile.</p>
            )}
          </div>
        </Card>
      </div>

      {permit && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Permit details</p>
              <h2 className="text-xl font-semibold">{permit.permitNumber}</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => printVerifiedPermit(permit)}>Print / Save PDF</Button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Holder</p>
                <p className="font-medium">{permit.givenNames} {permit.surname}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Passport</p>
                <p className="font-medium">{permit.passport}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Nationality</p>
                <p className="font-medium">{permit.nationality}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Issue date</p>
                <p className="font-medium">{formatDate(permit.issueDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Expiry date</p>
                <p className="font-medium">{formatDate(permit.expiryDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Port of issue</p>
                <p className="font-medium">{permit.portOfIssue}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Permit type</p>
                <p className="font-medium capitalize">{permit.permitType.replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Employer / institution</p>
                <p className="font-medium">{permit.employer ?? permit.institution ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Conditions</p>
                <p className="font-medium">{permit.conditions ?? "None"}</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Permit renewal</p>
            <h2 className="text-xl font-semibold">Submit a renewal request</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="renewal-message">Request details</Label>
              <Textarea
                id="renewal-message"
                value={requestMessage}
                onChange={(e) => setRequestMessage(e.target.value)}
                rows={4}
                placeholder="Explain why you need a renewal and attach any supporting documents."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="renewal-attachment">Supporting documents</Label>
              <input
                id="renewal-attachment"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                aria-label="Upload supporting document"
                onChange={(e) => void handleAttachment(e.target.files?.[0] ?? null)}
              />
              {attachments.length > 0 && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  {attachments.map((file) => (
                    <div key={file.name}>{file.name}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={submitRenewal} disabled={submitting || !permit}>
                {submitting ? "Submitting…" : "Send renewal request"}
              </Button>
              <Button variant="outline" onClick={() => setRequestMessage("")}>
                Clear
              </Button>
            </div>
          </div>
        </Card>
        <Card className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Request history</p>
            <h2 className="text-xl font-semibold">Recent renewal submissions</h2>
          </div>
          {requests.length === 0 ? (
            <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No renewal requests submitted yet.</div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.permitNumber}</p>
                      <p className="text-xs text-muted-foreground">Submitted {new Date(r.submittedAt.toDate?.() ?? r.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">{r.status.replace("_", " ")}</span>
                      {(r.status === "info_required" || r.adminComment) && (
                        <Button size="sm" variant="outline" onClick={() => {
                          setReplyRequestId((prev) => (prev === r.id ? null : r.id));
                          setReplyMessage("");
                        }}>{replyRequestId === r.id ? "Close" : "Reply"}</Button>
                      )}
                    </div>
                  </div>
                  {r.adminComment && <p className="mt-3 text-sm text-muted-foreground">Admin note: {r.adminComment}</p>}

                  {r.responses && r.responses.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {r.responses.map((resp, idx) => (
                        <div key={idx} className="text-sm">
                          <p className="text-muted-foreground">{resp.from === user?.id ? "You" : "Admin"} • {new Date(resp.at?.toDate?.() ?? resp.at).toLocaleString()}</p>
                          <p className="mt-1">{resp.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {replyRequestId === r.id && (
                    <div className="mt-3">
                      <Label className="text-sm">Your reply</Label>
                      <Textarea rows={3} value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} placeholder="Provide the requested information..." />
                      <div className="flex gap-2 mt-2">
                        <Button onClick={() => void sendReply(r.id)} disabled={replying || !replyMessage.trim()}>{replying ? "Sending…" : "Send reply"}</Button>
                        <Button variant="outline" onClick={() => { setReplyRequestId(null); setReplyMessage(""); }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={verifyOpen} onOpenChange={(o) => { if (!o) { setVerifyOpen(false); setPendingPermit(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Verify permit ownership</DialogTitle>
            <DialogDescription>
              For your security, please confirm a few details from the permit record before we display the information.
            </DialogDescription>
          </DialogHeader>
          {lockInfo.locked ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
              <Lock className="size-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Temporarily locked</p>
                <p className="text-muted-foreground">Too many failed attempts. Please try again in {formatLockRemaining(lockInfo.remainingMs)}.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q) => (
                <div key={q.key} className="space-y-1.5">
                  <Label htmlFor={`vq-${q.key}`} className="text-sm">{q.label}</Label>
                  <Input
                    id={`vq-${q.key}`}
                    type={q.type === "date" ? "date" : "text"}
                    value={answers[q.key] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                    placeholder={q.hint}
                    autoComplete="off"
                  />
                </div>
              ))}
              {lockInfo.attemptsUsed > 0 && (
                <p className="text-xs text-muted-foreground">
                  {MAX_ATTEMPTS - lockInfo.attemptsUsed} attempt{MAX_ATTEMPTS - lockInfo.attemptsUsed === 1 ? "" : "s"} remaining before lockout.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setVerifyOpen(false); setPendingPermit(null); }}>Cancel</Button>
            {!lockInfo.locked && (
              <Button onClick={submitVerification} disabled={verifying || questions.some((q) => !(answers[q.key] ?? "").trim())}>
                {verifying ? "Verifying…" : "Verify and load"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
