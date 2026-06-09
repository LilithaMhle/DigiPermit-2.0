import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Copy, Printer, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  PERMIT_TYPE_LABELS,
  SA_PORTS_OF_ENTRY,
  createPermit,
  type Gender,
  type PermitRecord,
  type PermitType,
} from "@/lib/permits-firestore";
import { printPermit } from "@/lib/print-permit";
import { encodeEan13 } from "@/lib/ean13";
import { useCurrentUser } from "@/lib/auth-store";
import { logAuditEvent } from "@/lib/audit-firestore";

export const Route = createFileRoute("/_app/issue")({
  head: () => ({ meta: [{ title: "Issue Permit · DigiPermit" }] }),
  component: IssuePage,
});

const TODAY = new Date().toISOString().slice(0, 10);

const WORK_TYPES: PermitType[] = ["general_work", "critical_skills", "intra_company_transfer"];

function IssuePage() {
  const navigate = useNavigate();
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<PermitRecord | null>(null);

  const [form, setForm] = useState({
    surname: "",
    givenNames: "",
    passport: "",
    nationality: "",
    dateOfBirth: "",
    gender: "male" as Gender,
    permitType: "visitor_visa" as PermitType,
    issueDate: TODAY,
    expiryDate: "",
    portOfIssue: SA_PORTS_OF_ENTRY[0],
    employer: "",
    occupation: "",
    institution: "",
    conditions: "",
  });

  const isWork = WORK_TYPES.includes(form.permitType);
  const isStudy = form.permitType === "study_visa";

  const update = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in.");
      return;
    }
    if (!user.signature) {
      toast.error("You must add an official signature in your profile before issuing permits.");
      return;
    }
    if (
      !form.surname ||
      !form.givenNames ||
      !form.passport ||
      !form.nationality ||
      !form.dateOfBirth ||
      !form.expiryDate
    ) {
      toast.error("Please complete all required fields.");
      return;
    }
    if (new Date(form.expiryDate) <= new Date(form.issueDate)) {
      toast.error("Expiry must be after issue date.");
      return;
    }
    setBusy(true);
    try {
      const record = await createPermit(
        {
          surname: form.surname.trim().toUpperCase(),
          givenNames: form.givenNames.trim(),
          passport: form.passport.trim().toUpperCase(),
          nationality: form.nationality.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          permitType: form.permitType,
          issueDate: form.issueDate,
          expiryDate: form.expiryDate,
          portOfIssue: form.portOfIssue,
          employer: isWork ? form.employer.trim() || undefined : undefined,
          occupation: isWork ? form.occupation.trim() || undefined : undefined,
          institution: isStudy ? form.institution.trim() || undefined : undefined,
          conditions: form.conditions.trim() || undefined,
        },
        {
          uid: user.id,
          name: user.fullName || user.email,
          signature: user.signature,
          position: user.position,
          department: user.department,
          employeeNumber: user.employeeNumber,
        },
      );
      setIssued(record);
      void logAuditEvent({
        actorId: user.id,
        actorEmail: user.email,
        action: "permit_issued",
        targetId: record.id,
        targetType: "permit",
        details: JSON.stringify({ permitNumber: record.permitNumber, holder: `${record.givenNames} ${record.surname}` }),
      });
      toast.success("Permit issued and saved to the database.");
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to issue permit.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setIssued(null);
    setForm((f) => ({
      ...f,
      surname: "",
      givenNames: "",
      passport: "",
      nationality: "",
      dateOfBirth: "",
      expiryDate: "",
      employer: "",
      occupation: "",
      institution: "",
      conditions: "",
    }));
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Administration · Department of Home Affairs</p>
        <h1 className="text-3xl font-semibold tracking-tight">Issue New Permit</h1>
        <p className="text-muted-foreground">
          Issue an official South African visa, work or residence permit. The record is stored in the secure database
          and a printable PDF is generated for the holder.
        </p>
      </div>

      {user && !user.signature && (
        <Card className="p-4 border-destructive/40 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 text-sm">
            <p className="font-medium">Signature required</p>
            <p className="text-muted-foreground">You must register an official signature before issuing permits. Issued permits include the officer's signature in the approval section.</p>
          </div>
          <Button asChild size="sm" variant="secondary"><Link to="/profile">Open profile</Link></Button>
        </Card>
      )}

      {issued ? (
        <Card className="p-8 border-success/30 bg-success/5">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="size-10 text-success-foreground shrink-0" />
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-semibold">
                  {PERMIT_TYPE_LABELS[issued.permitType]} issued for {issued.givenNames} {issued.surname}
                </h2>
                <p className="text-muted-foreground text-sm">
                  Permit number <span className="font-mono">{issued.permitNumber}</span> · saved to database.
                </p>
              </div>
              <div className="p-6 rounded-lg bg-card border border-border flex flex-col items-center gap-3">
                <Barcode value={issued.barcode} />
                <div className="font-mono text-sm tracking-widest">{issued.barcode}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => printPermit(issued)}>
                  <Printer className="size-4 mr-1" /> Print permit (PDF)
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(issued.barcode);
                    toast.success("Barcode copied");
                  }}
                >
                  <Copy className="size-4 mr-1" /> Copy barcode
                </Button>
                <Button variant="secondary" onClick={() => navigate({ to: "/permits" })}>
                  View all permits
                </Button>
                <Button variant="ghost" onClick={reset}>
                  Issue another
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <Section title="Holder details">
            <Field label="Surname *">
              <Input value={form.surname} onChange={(e) => update("surname", e.target.value)} placeholder="e.g. OKAFOR" maxLength={80} />
            </Field>
            <Field label="Given names *">
              <Input value={form.givenNames} onChange={(e) => update("givenNames", e.target.value)} placeholder="e.g. Amara Joy" maxLength={120} />
            </Field>
            <Field label="Passport number *">
              <Input value={form.passport} onChange={(e) => update("passport", e.target.value)} placeholder="e.g. A12345678" maxLength={20} />
            </Field>
            <Field label="Nationality *">
              <Input value={form.nationality} onChange={(e) => update("nationality", e.target.value)} placeholder="e.g. Nigerian" maxLength={60} />
            </Field>
            <Field label="Date of birth *">
              <Input type="date" value={form.dateOfBirth} max={TODAY} onChange={(e) => update("dateOfBirth", e.target.value)} />
            </Field>
            <Field label="Gender">
              <Select value={form.gender} onValueChange={(v) => update("gender", v as Gender)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section title="Permit details">
            <Field label="Permit type *" full>
              <Select value={form.permitType} onValueChange={(v) => update("permitType", v as PermitType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PERMIT_TYPE_LABELS) as PermitType[]).map((k) => (
                    <SelectItem key={k} value={k}>{PERMIT_TYPE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Issue date *">
              <Input type="date" value={form.issueDate} onChange={(e) => update("issueDate", e.target.value)} />
            </Field>
            <Field label="Expiry date *">
              <Input type="date" value={form.expiryDate} min={form.issueDate} onChange={(e) => update("expiryDate", e.target.value)} />
            </Field>
            <Field label="Port / place of issue *" full>
              <Select value={form.portOfIssue} onValueChange={(v) => update("portOfIssue", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SA_PORTS_OF_ENTRY.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {isWork && (
              <>
                <Field label="Employer">
                  <Input value={form.employer} onChange={(e) => update("employer", e.target.value)} placeholder="Registered SA employer" maxLength={120} />
                </Field>
                <Field label="Occupation">
                  <Input value={form.occupation} onChange={(e) => update("occupation", e.target.value)} placeholder="e.g. Software Engineer" maxLength={120} />
                </Field>
              </>
            )}

            {isStudy && (
              <Field label="Institution" full>
                <Input value={form.institution} onChange={(e) => update("institution", e.target.value)} placeholder="e.g. University of Cape Town" maxLength={160} />
              </Field>
            )}

            <Field label="Conditions / endorsements" full>
              <Textarea
                value={form.conditions}
                onChange={(e) => update("conditions", e.target.value)}
                placeholder="Special conditions printed on the permit (optional)"
                rows={3}
                maxLength={500}
              />
            </Field>
          </Section>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => navigate({ to: "/permits" })} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="size-4 mr-1 animate-spin" />}
              Issue permit
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 lg:p-8">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">{title}</h3>
      <div className="grid sm:grid-cols-2 gap-5">{children}</div>
    </Card>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function Barcode({ value }: { value: string }) {
  const bars = value.split("").flatMap((c, i) => {
    const n = c.charCodeAt(0);
    return [
      { w: (n % 3) + 1, dark: true, key: `${i}-a` },
      { w: ((n >> 1) % 3) + 1, dark: false, key: `${i}-b` },
    ];
  });
  return (
    <div className="flex items-end gap-[2px] h-20">
      {bars.map((b) => (
        <div
          key={b.key}
          style={{ width: b.w * 2, background: b.dark ? "currentColor" : "transparent" }}
          className="h-full text-foreground"
        />
      ))}
    </div>
  );
}