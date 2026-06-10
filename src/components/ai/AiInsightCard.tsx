import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, TrendingUp, ShieldCheck, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Risk = "low" | "medium" | "high" | "critical";

interface Section {
  label: string;
  items: string[];
}

export interface AiInsightCardProps {
  title?: string;
  loading: boolean;
  error?: string | null;
  risk?: Risk;
  headline?: string;
  summary?: string;
  sections?: Section[];
  analyzedAt?: Date | null;
  onRefresh?: () => void;
  compact?: boolean;
  emptyMessage?: string;
}

export function AiInsightCard({
  title = "DigiPermit AI Insight",
  loading,
  error,
  risk,
  headline,
  summary,
  sections,
  analyzedAt,
  onRefresh,
  compact,
  emptyMessage,
}: AiInsightCardProps) {
  const hasContent = headline || summary || (sections && sections.some((s) => s.items.length > 0));
  return (
    <Card className={`relative overflow-hidden border-accent/40 ${compact ? "p-4" : "p-5"}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{ background: "var(--gradient-accent, linear-gradient(135deg,#7c3aed,#06b6d4))" }}
      />
      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </div>
            <div>
              <div className="font-semibold text-sm flex items-center gap-2">
                {title}
                {risk && <RiskBadge risk={risk} />}
              </div>
              <div className="text-xs text-muted-foreground">
                {loading
                  ? "DigiPermit AI is analyzing…"
                  : analyzedAt
                    ? `Analyzed ${formatDistanceToNow(analyzedAt, { addSuffix: true })}`
                    : hasContent
                      ? "Live"
                      : (emptyMessage ?? "Waiting for data")}
              </div>
            </div>
          </div>
          {onRefresh && (
            <Button size="sm" variant="ghost" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
            <span className="text-destructive">{error}</span>
          </div>
        )}

        {!loading && !error && hasContent && (
          <div className="space-y-3 pt-1">
            {headline && <h3 className="font-semibold text-sm">{headline}</h3>}
            {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
            {sections?.map(
              (s, i) =>
                s.items.length > 0 && (
                  <div key={i}>
                    <div className="text-[10px] font-medium uppercase text-muted-foreground mb-1.5 flex items-center gap-1.5">
                      {s.label.toLowerCase().includes("action") ? (
                        <ShieldCheck className="size-3" />
                      ) : (
                        <TrendingUp className="size-3" />
                      )}
                      {s.label}
                    </div>
                    <ul className="text-sm space-y-1 list-disc pl-5">
                      {s.items.map((it, j) => (
                        <li key={j}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ),
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function RiskBadge({ risk }: { risk: Risk }) {
  const variant =
    risk === "critical" || risk === "high"
      ? "destructive"
      : risk === "medium"
        ? "default"
        : "secondary";
  return (
    <Badge variant={variant} className="uppercase text-[10px] tracking-wide">
      {risk} risk
    </Badge>
  );
}