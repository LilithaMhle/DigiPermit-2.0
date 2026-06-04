import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";
import {
  Shield,
  ScanLine,
  ShieldCheck,
  BadgeCheck,
  Brain,
  Fingerprint,
  Globe,
  Lock,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SPVMS · Smart Permit Verification & Monitoring" },
      { name: "description", content: "Secure, real-time validation of visas, residence and work permits for the Department of Home Affairs, South Africa." },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const navigate = useNavigate();
  const { init, user, initialized } = useAuthStore();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (initialized && user) {
      navigate({ to: "/overview" });
    }
  }, [user, initialized, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg flex items-center justify-center text-primary-foreground" style={{ background: "var(--gradient-hero)" }}>
              <Shield className="size-4" />
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight">SPVMS</span>
              <span className="text-[11px] text-muted-foreground ml-2 hidden sm:inline">Department of Home Affairs · RSA</span>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 80% 20%, oklch(0.7 0.16 165 / 0.5), transparent 55%)" }} />
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28 relative">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-primary-foreground text-xs mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              National permit verification system
            </div>
            <h1 className="text-4xl lg:text-5xl font-semibold text-primary-foreground leading-tight tracking-tight">
              Smart Permit Verification &amp; Monitoring
            </h1>
            <p className="mt-5 text-lg text-primary-foreground/80 max-w-lg leading-relaxed">
              Secure, real-time validation of visas, residence and work permits — built for Home Affairs officials and field enforcement officers across South Africa.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90">
                <Link to="/auth">
                  Access the system <ArrowRight className="size-4 ml-2" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/25 text-primary-foreground hover:bg-white/10 hover:text-primary-foreground bg-transparent">
                <Link to="/auth">Register</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          <Stat value="6" label="Border checkpoints" />
          <Stat value="&lt;2s" label="Average scan time" />
          <Stat value="24/7" label="Real-time monitoring" />
          <Stat value="100%" label="Audit trail coverage" />
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="text-center max-w-xl mx-auto mb-14">
          <h2 className="text-2xl font-semibold tracking-tight">Built for modern border security</h2>
          <p className="mt-2 text-muted-foreground">A unified platform that connects issuance, verification, and intelligence in one system.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={ScanLine}
            title="Instant barcode verification"
            description="Scan any permit barcode at checkpoints and receive validated results in under two seconds, with full holder details."
          />
          <FeatureCard
            icon={BadgeCheck}
            title="Digital permit issuing"
            description="Issue, extend, and revoke visas, residence and work permits from a centralised console with automated compliance checks."
          />
          <FeatureCard
            icon={Brain}
            title="AI fraud detection"
            description="Machine-learning models flag repeated expired scans, location anomalies, and burst invalid patterns in real time."
          />
          <FeatureCard
            icon={Fingerprint}
            title="Full audit trail"
            description="Every checkpoint scan is recorded with timestamp, location, and officer identity for complete traceability."
          />
          <FeatureCard
            icon={Globe}
            title="Multi-location coverage"
            description="Deployed at major airports, harbours, and land border posts with centralised data synchronisation."
          />
          <FeatureCard
            icon={Lock}
            title="Role-based access control"
            description="Administrators manage permits and alerts while enforcement officers perform field verification securely."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-16 lg:py-20 text-center">
          <ShieldCheck className="size-10 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-semibold tracking-tight">Authorised personnel only</h2>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            Access to the Smart Permit Verification &amp; Monitoring System is restricted to registered Home Affairs administrators and enforcement officers.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/auth">Sign in to SPVMS</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Shield className="size-4" />
            <span className="font-medium text-foreground">SPVMS</span>
            <span>· Department of Home Affairs · Republic of South Africa</span>
          </div>
          <span>Prototype build · Authorised personnel only</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border border-border bg-card hover:shadow-md transition-shadow">
      <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
        <Icon className="size-5" />
      </div>
      <h3 className="font-semibold text-sm">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
