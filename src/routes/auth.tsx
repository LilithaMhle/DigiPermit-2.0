import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuthStore, type Role } from "@/lib/auth-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, ScanLine, ShieldCheck, BadgeCheck, Brain } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · DigiPermit" },
      { name: "description", content: "Authorised access for Home Affairs administrators and enforcement officers." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { init, login, register, user, initialized } = useAuthStore();
  const [mode, setMode] = useState<"login" | "register">("login");

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (initialized && user) {
      if (user.role === "permit_holder") {
        navigate({ to: "/permit-holder" });
      } else if (user.role === "officer") {
        navigate({ to: "/verify" });
      } else {
        navigate({ to: "/overview" });
      }
    }
  }, [user, initialized, navigate]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 20% 10%, oklch(0.7 0.16 165 / 0.4), transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Shield className="size-6" />
            </div>
            <div>
              <div className="font-semibold tracking-tight">DigiPermit</div>
              <div className="text-xs opacity-80">Department of Home Affairs · RSA</div>
            </div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            DigiPermit Verification System
          </h1>
          <p className="text-base opacity-85 max-w-md">
            Secure, real-time validation of visas, residence and work permits — built for Home Affairs officials and field enforcement officers.
          </p>
          <ul className="space-y-3 text-sm">
            <Feature icon={ScanLine} text="Instant barcode verification in under 2 seconds" />
            <Feature icon={BadgeCheck} text="Centralised digital permit issuing &amp; revocation" />
            <Feature icon={Brain} text="AI-driven fraud and anomaly detection" />
            <Feature icon={ShieldCheck} text="Full audit trail of every checkpoint scan" />
          </ul>
        </div>
        <div className="relative text-xs opacity-70">
          Prototype build · Authorised personnel only
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 justify-center">
            <Shield className="size-5 text-primary" />
            <span className="font-semibold">DigiPermit</span>
          </div>

          <div className="inline-flex p-1 rounded-lg bg-secondary w-full">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 text-sm py-2 rounded-md transition-colors ${mode === "login" ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("register")}
              className={`flex-1 text-sm py-2 rounded-md transition-colors ${mode === "register" ? "bg-card shadow-sm font-medium" : "text-muted-foreground"}`}
            >
              Register
            </button>
          </div>

          {mode === "login" ? (
            <LoginForm onDone={() => {}} onSwitch={() => setMode("register")} login={login} />
          ) : (
            <RegisterForm onDone={() => {}} register={register} />
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="size-8 rounded-md bg-white/10 border border-white/15 flex items-center justify-center">
        <Icon className="size-4" />
      </span>
      <span dangerouslySetInnerHTML={{ __html: text }} />
    </li>
  );
}

function LoginForm({
  onDone,
  onSwitch,
  login,
}: {
  onDone: () => void;
  onSwitch: () => void;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await login(email, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    toast.success("Signed in");
    onDone();
  };

  return (
    <Card className="p-6 lg:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
        <p className="text-sm text-muted-foreground">Sign in to access the verification system.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="u">Email</Label>
          <Input id="u" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@homeaffairs.gov.za" autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p">Password</Label>
          <Input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>

      <p className="text-sm text-muted-foreground text-center">
        New here?{" "}
        <button onClick={onSwitch} className="text-primary hover:underline font-medium">Create an account</button>
      </p>
    </Card>
  );
}

function RegisterForm({
  onDone,
  register,
}: {
  onDone: () => void;
  register: (u: { fullName: string; email: string; password: string; role: Role }) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  // Registrations from the public register page should always create permit holder accounts
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirm: "", role: "permit_holder" as Role });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.fullName || !form.email || !form.password) return setError("Please fill all fields.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");
    setBusy(true);
    const r = await register({ fullName: form.fullName, email: form.email, password: form.password, role: "permit_holder" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    toast.success("Account created");
    onDone();
  };

  return (
    <Card className="p-6 lg:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Create your account</h2>
        <p className="text-sm text-muted-foreground">Register as a permit holder. Administrator and officer accounts must be created via the Users page.</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fn">Full name</Label>
          <Input id="fn" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Thandi Mokoena" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ru">Email</Label>
          <Input id="ru" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@homeaffairs.gov.za" autoComplete="email" />
        </div>
        {/* Role is fixed to permit_holder for self-registration */}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rp">Password</Label>
            <Input id="rp" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rc">Confirm</Label>
            <Input id="rc" type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
        <p className="text-xs text-muted-foreground text-center">
          By continuing you confirm you are authorised personnel.{" "}
          <Link to="/auth" className="text-primary hover:underline">Back to sign in</Link>
        </p>
      </form>
    </Card>
  );
}