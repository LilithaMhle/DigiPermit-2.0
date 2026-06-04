import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useCurrentUser } from "@/lib/auth-store";
import { getPermitByNumber, PermitRecord, computedStatus } from "@/lib/permits-firestore";
import { createRenewalRequest, listUserRenewalRequests, RenewalRequest } from "@/lib/renewal-firestore";
import { updateUserProfile } from "@/lib/users-firestore";
import { printPermit } from "@/lib/print-permit";

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
  const [profileSaved, setProfileSaved] = useState(false);

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

  useEffect(() => {
    if (!user?.permitNumber || permit) return;
    setPermitNumber(user.permitNumber);
    void fetchPermit(false);
  }, [user?.permitNumber]);

  const fetchPermit = async (saveToProfile = true) => {
    if (!permitNumber?.trim()) return toast.error("Enter a permit number.");
    setLoading(true);
    try {
      const result = await getPermitByNumber(permitNumber.trim());
      if (!result) {
        toast.error("Permit not found. Please verify the number and try again.");
        setPermit(null);
        return;
      }
      setPermit(result);
      if (saveToProfile && user) {
        try {
          await updateUserProfile(user.id, { permitNumber: result.permitNumber });
          setProfileSaved(true);
          toast.success("Permit loaded successfully.");
        } catch (err) {
          toast.error("Permit loaded, but profile could not be saved.");
        }
      } else {
        toast.success("Saved permit loaded.");
      }
    } catch (err) {
      toast.error((err as Error).message || "Unable to load permit.");
    } finally {
      setLoading(false);
    }
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
        attachments: attachments.length ? attachments : undefined,
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
              <Button onClick={() => printPermit(permit)}>Print / Save PDF</Button>
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
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">{r.status.replace("_", " ")}</span>
                  </div>
                  {r.adminComment && <p className="mt-3 text-sm text-muted-foreground">Admin note: {r.adminComment}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
