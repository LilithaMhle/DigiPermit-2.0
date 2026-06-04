import type { PermitStatus, VerificationResult } from "@/lib/permit-store";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  valid: "bg-success/15 text-success-foreground border-success/30",
  expired: "bg-warning/20 text-warning-foreground border-warning/40",
  revoked: "bg-destructive/15 text-destructive border-destructive/30",
  not_found: "bg-muted text-muted-foreground border-border",
};

const labels: Record<string, string> = {
  valid: "Valid",
  expired: "Expired",
  revoked: "Revoked",
  not_found: "Not Found",
};

export function StatusBadge({ status }: { status: PermitStatus | VerificationResult }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border",
        styles[status],
      )}
    >
      <span className={cn("size-1.5 rounded-full", {
        "bg-success": status === "valid",
        "bg-warning": status === "expired",
        "bg-destructive": status === "revoked",
        "bg-muted-foreground": status === "not_found",
      })} />
      {labels[status]}
    </span>
  );
}