import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eraser, Loader2, Save, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser, refreshCurrentUser } from "@/lib/auth-store";
import { updateUserProfile } from "@/lib/users-firestore";
import { logAuditEvent } from "@/lib/audit-firestore";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { firebaseDb } from "@/lib/firebase";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile · DigiPermit" }] }),
  component: ProfilePage,
});

interface AuditRow {
  id: string;
  action: string;
  details?: string;
  createdAt?: { toDate?: () => Date } | null;
}

function ProfilePage() {
  const user = useCurrentUser();
  const padRef = useRef<SignaturePadHandle>(null);

  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [employeeNumber, setEmployeeNumber] = useState(user?.employeeNumber ?? "");
  const [position, setPosition] = useState(user?.position ?? "");
  const [department, setDepartment] = useState(user?.department ?? "");
  const [contactPhone, setContactPhone] = useState(user?.contactPhone ?? "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSig, setSavingSig] = useState(false);
  const [activity, setActivity] = useState<AuditRow[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? "");
    setEmployeeNumber(user.employeeNumber ?? "");
    setPosition(user.position ?? "");
    setDepartment(user.department ?? "");
    setContactPhone(user.contactPhone ?? "");
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    setLoadingActivity(true);
    const q = query(
      collection(firebaseDb(), "audit_logs"),
      where("actorId", "==", user.id),
      orderBy("createdAt", "desc"),
      limit(15),
    );
    getDocs(q)
      .then((snap) => {
        setActivity(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditRow, "id">) })));
      })
      .catch(() => setActivity([]))
      .finally(() => setLoadingActivity(false));
  }, [user?.id]);

  if (!user) return <div className="p-6">Loading profile…</div>;

  const isStaff = user.role === "admin" || user.role === "officer";

  const saveProfile = async () => {
    if (!fullName.trim()) return toast.error("Full name is required.");
    setSavingProfile(true);
    try {
      await updateUserProfile(user.id, {
        fullName: fullName.trim(),
        employeeNumber: employeeNumber.trim() || null,
        position: position.trim() || null,
        department: department.trim() || null,
        contactPhone: contactPhone.trim() || null,
      } as never);
      await refreshCurrentUser();
      void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "profile_updated" });
      toast.success("Profile updated.");
    } catch (err) {
      toast.error((err as Error).message || "Unable to save profile.");
    } finally {
      setSavingProfile(false);
    }
  };

  const saveSignature = async () => {
    const data = padRef.current?.toDataURL();
    if (!data) return toast.error("Please draw your signature first.");
    if (data.length > 300_000) return toast.error("Signature image is too large. Try a simpler drawing.");
    setSavingSig(true);
    try {
      await updateUserProfile(user.id, { signature: data } as never);
      await refreshCurrentUser();
      void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "signature_updated" });
      toast.success("Signature saved. It will be attached to all permits you issue.");
    } catch (err) {
      toast.error((err as Error).message || "Unable to save signature.");
    } finally {
      setSavingSig(false);
    }
  };

  const removeSignature = async () => {
    setSavingSig(true);
    try {
      await updateUserProfile(user.id, { signature: null } as never);
      await refreshCurrentUser();
      padRef.current?.clear();
      void logAuditEvent({ actorId: user.id, actorEmail: user.email, action: "signature_removed" });
      toast.success("Signature removed.");
    } catch (err) {
      toast.error((err as Error).message || "Unable to remove signature.");
    } finally {
      setSavingSig(false);
    }
  };

  const loadCurrent = () => {
    if (user.signature) padRef.current?.load(user.signature);
    else padRef.current?.clear();
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">My account</p>
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="text-muted-foreground">Manage your personal details, official signature, and view recent activity.</p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          <div className="size-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-semibold">
            {user.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{user.fullName}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <div className="mt-2 flex gap-2 flex-wrap">
              <Badge variant="secondary" className="capitalize">{user.role.replace("_", " ")}</Badge>
              {user.signature && <Badge className="bg-success text-success-foreground"><ShieldCheck className="size-3 mr-1" />Signature on file</Badge>}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name *">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Email">
            <Input value={user.email} disabled />
          </Field>
          <Field label="Employee / officer number">
            <Input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} maxLength={40} placeholder="e.g. DHA-OF-1234" />
          </Field>
          <Field label="Position / role">
            <Input value={position} onChange={(e) => setPosition(e.target.value)} maxLength={80} placeholder="e.g. Immigration Officer" />
          </Field>
          <Field label="Department">
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} maxLength={120} placeholder="e.g. Permitting & Border Control" />
          </Field>
          <Field label="Contact phone">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={30} placeholder="e.g. +27 12 345 6789" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile && <Loader2 className="size-4 mr-1 animate-spin" />}<Save className="size-4 mr-1" /> Save profile
          </Button>
        </div>
      </Card>

      {isStaff && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-lg font-semibold">Official signature</h3>
              <p className="text-sm text-muted-foreground">Draw your signature below using your mouse, stylus or finger. It will be attached to every permit you issue. Only one active signature is allowed at a time.</p>
            </div>
            {user.signature && (
              <div className="border border-border rounded-md p-2 bg-white">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current signature</p>
                <img src={user.signature} alt="Current signature" className="h-16" />
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <SignaturePad ref={padRef} width={620} height={200} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={saveSignature} disabled={savingSig}>
              {savingSig && <Loader2 className="size-4 mr-1 animate-spin" />}<Save className="size-4 mr-1" /> Save signature
            </Button>
            <Button variant="outline" onClick={() => padRef.current?.clear()}>
              <Eraser className="size-4 mr-1" /> Clear
            </Button>
            {user.signature && (
              <Button variant="outline" onClick={loadCurrent}>
                <RefreshCw className="size-4 mr-1" /> Edit current
              </Button>
            )}
            {user.signature && (
              <Button variant="ghost" className="text-destructive" onClick={removeSignature} disabled={savingSig}>
                Remove signature
              </Button>
            )}
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Recent activity</h3>
          <p className="text-sm text-muted-foreground">Your most recent recorded actions on this system.</p>
        </div>
        {loadingActivity ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> Loading activity…</div>
        ) : activity.length === 0 ? (
          <div className="text-sm text-muted-foreground">No recorded activity yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {activity.map((row) => {
              const dt = row.createdAt?.toDate?.();
              return (
                <li key={row.id} className="py-2 flex justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium capitalize">{row.action.replace(/_/g, " ")}</div>
                    {row.details && <div className="text-xs text-muted-foreground truncate max-w-xl">{row.details}</div>}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{dt ? dt.toLocaleString() : "—"}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}