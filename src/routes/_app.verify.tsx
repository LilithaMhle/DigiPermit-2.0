import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ScanLine,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  MapPin,
  User2,
  Calendar,
  Loader2,
  Camera,
  CameraOff,
  RefreshCw,
  Keyboard,
  ChevronDown,
  ChevronUp,
  Shield,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { format } from "date-fns";
import {
  CHECKPOINTS,
  verifyAndLogScan,
  type Checkpoint,
  type VerificationResult,
} from "@/lib/scans-firestore";
import { PERMIT_TYPE_LABELS, type PermitRecord } from "@/lib/permits-firestore";
import { useCurrentUser } from "@/lib/auth-store";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { explainVerification, type VerifyInsight } from "@/lib/ai-insights.functions";
import { AiInsightCard } from "@/components/ai/AiInsightCard";

export const Route = createFileRoute("/_app/verify")({
  head: () => ({ meta: [{ title: "Verify Permit · DigiPermit" }] }),
  component: VerifyPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanResult = {
  result: VerificationResult;
  permit: PermitRecord | null;
  location: string;
  ms: number;
  at: Date;
  barcode: string;
};

type CameraState = "starting" | "active" | "error" | "unsupported" | "idle";

// ─── VerifyPage ───────────────────────────────────────────────────────────────

function VerifyPage() {
  const user = useCurrentUser();
  const qc = useQueryClient();

  const [barcode, setBarcode] = useState("");
  const [checkpoint, setCheckpoint] = useState<Checkpoint>(CHECKPOINTS[0]);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [latestResult, setLatestResult] = useState<ScanResult | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("starting");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [aiInsight, setAiInsight] = useState<VerifyInsight | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [aiInsightError, setAiInsightError] = useState<string | null>(null);
  const runExplain = useServerFn(explainVerification);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);
  const detectorRef = useRef<any>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastScannedRef = useRef<string>("");
  const cooldownRef = useRef<boolean>(false);
  const mountedRef = useRef(true);

  // ── Stop camera ────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      window.clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    try {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop();
      }
    } catch {
      // already stopped or invalid state — safe to ignore
    }
    scannerControlsRef.current = null;
    readerRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
    setScannerReady(false);
    setCameraState("idle");
  }, []);

  // ── Scan frame (native BarcodeDetector) ───────────────────────────────────

  const onDetected = useCallback(
    (raw: string) => {
      const value = raw.trim().toUpperCase();
      if (!value) return;
      if (cooldownRef.current) return;
      if (value === lastScannedRef.current) return;

      lastScannedRef.current = value;
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
        lastScannedRef.current = "";
      }, 3000);

      setBarcode(value);
      triggerVerify(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkpoint]
  );

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !detectorRef.current) return;
    try {
      const barcodes = await detectorRef.current.detect(video);
      if (!barcodes?.length) return;
      onDetected(String(barcodes[0]?.rawValue ?? ""));
    } catch {
      // silent
    }
  }, [onDetected]);

  // ── Start camera ───────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported");
      return;
    }

    setCameraState("starting");
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraState("active");
      setScannerReady(false);

      // Use ZXing as the primary scanner — broader format support and more
      // reliable than the native BarcodeDetector across browsers.
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      if (videoRef.current) {
        scannerControlsRef.current = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (res, err) => {
            if (res) onDetected(String(res.getText() ?? ""));
          }
        );
      }

      if (!mountedRef.current) {
        stopCamera();
        return;
      }

      // Also run native BarcodeDetector in parallel when available — whichever
      // decodes first wins. Cooldown in onDetected prevents duplicates.
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          detectorRef.current = new (window as any).BarcodeDetector({
            formats: [
              "code_128", "code_39", "code_93", "codabar",
              "ean_13", "ean_8", "upc_a", "upc_e",
              "itf", "qr_code", "pdf417", "data_matrix", "aztec",
            ],
          });
          scanIntervalRef.current = window.setInterval(scanFrame, 200);
        } catch {
          detectorRef.current = null;
        }
      }

      if (!mountedRef.current) {
        stopCamera();
        return;
      }

      setTimeout(() => {
        if (mountedRef.current) setScannerReady(true);
      }, 600);
    } catch (err) {
      const msg = (err as Error)?.message ?? "Unable to access camera.";
      setCameraError(msg);
      setCameraState("error");
    }
  }, [scanFrame, onDetected]);

  // ── Auto-start camera on mount ────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    void startCamera();
    return () => {
      mountedRef.current = false;
      stopCamera();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutation ───────────────────────────────────────────────────────────────

  const mut = useMutation({
    mutationFn: async (code: string) => {
      if (!user) throw new Error("You must be signed in to verify permits.");
      const start = performance.now();
      const r = await verifyAndLogScan({
        barcode: code,
        checkpoint,
        officer: { uid: user.id, name: user.fullName || user.email },
      });
      return { ...r, ms: Math.round(performance.now() - start) };
    },
    onSuccess: (r, code) => {
      const entry: ScanResult = {
        result: r.result,
        permit: r.permit,
        location: checkpoint.label,
        ms: r.ms,
        at: new Date(),
        barcode: code,
      };
      setLatestResult(entry);
      setResults((prev) => [entry, ...prev].slice(0, 20));
      setScanCount((n) => n + 1);
      setLastScanTime(new Date());
      void qc.invalidateQueries({ queryKey: ["scans"] });
      void qc.invalidateQueries({ queryKey: ["alerts"] });

      // AI assist for this scan
      setAiInsight(null);
      setAiInsightError(null);
      setAiInsightLoading(true);
      const recentHistory = [entry, ...results]
        .filter((x) => x.barcode === entry.barcode)
        .slice(0, 20)
        .map((x) => ({
          checkpoint: x.location,
          result: x.result,
          ageMinutes: Math.round((Date.now() - x.at.getTime()) / 60000),
        }));
      runExplain({
        data: {
          barcode: entry.barcode,
          result: entry.result,
          checkpoint: entry.location,
          permit: entry.permit
            ? {
                permitType: entry.permit.permitType,
                nationality: entry.permit.nationality,
                issueDate: entry.permit.issueDate,
                expiryDate: entry.permit.expiryDate,
                status: entry.permit.status,
              }
            : null,
          recentHistory,
        },
      })
        .then((res) => setAiInsight(res))
        .catch((e) => setAiInsightError((e as Error).message ?? "AI assist failed."))
        .finally(() => setAiInsightLoading(false));
    },
    onError: (err) => toast.error((err as Error).message ?? "Verification failed."),
  });

  const triggerVerify = useCallback(
    (code?: string) => {
      const v = (code ?? barcode).trim().toUpperCase();
      if (!v || mut.isPending) return;
      mut.mutate(v);
    },
    [barcode, mut]
  );

  const scanning = mut.isPending;

  return (
    <div className="verify-root">
      {/* ── Page header ── */}
      <div className="verify-header">
        <div className="verify-header-left">
          <div className="verify-badge">
            <Shield className="verify-badge-icon" />
            <span>Field Officer</span>
          </div>
          <h1 className="verify-title">Verify Permit</h1>
          <p className="verify-subtitle">
            Point the camera at any permit barcode — verification happens automatically.
          </p>
        </div>

        <div className="verify-stats">
          <StatPill icon={<Activity className="stat-icon" />} label="Scans today" value={scanCount} />
          {lastScanTime && (
            <StatPill
              icon={<Clock className="stat-icon" />}
              label="Last scan"
              value={format(lastScanTime, "HH:mm:ss")}
            />
          )}
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="verify-grid">

        {/* ── Camera panel ── */}
        <div className="camera-panel">
          <div className="camera-wrapper">
            {/* Video element — always in DOM */}
            <video
              ref={videoRef}
              className={`camera-video ${cameraState === "active" ? "visible" : ""}`}
              muted
              playsInline
              autoPlay
            />

            {/* Overlay states */}
            {cameraState === "starting" && (
              <div className="camera-overlay">
                <Loader2 className="camera-overlay-icon spin" />
                <span>Starting camera…</span>
              </div>
            )}
            {(cameraState === "error" || cameraState === "unsupported") && (
              <div className="camera-overlay camera-overlay--error">
                <CameraOff className="camera-overlay-icon" />
                <span>{cameraError ?? "Camera unavailable"}</span>
                <button className="camera-retry-btn" onClick={startCamera}>
                  <RefreshCw className="size-3.5 mr-1" /> Retry
                </button>
              </div>
            )}

            {/* Scan frame UI */}
            {cameraState === "active" && (
              <div className={`scan-frame ${scannerReady ? "scan-frame--ready" : ""} ${scanning ? "scan-frame--scanning" : ""}`}>
                {/* Corner brackets */}
                <span className="corner corner--tl" />
                <span className="corner corner--tr" />
                <span className="corner corner--bl" />
                <span className="corner corner--br" />

                {/* Laser sweep line */}
                <span className={`scan-laser ${scanning ? "scan-laser--hit" : ""}`} />

                {/* Hint text */}
                <span className="scan-hint">
                  {scanning ? "Verifying…" : "Align barcode within frame"}
                </span>
              </div>
            )}

            {/* Live indicator */}
            {cameraState === "active" && (
              <div className="live-badge">
                <span className="live-dot" />
                LIVE
              </div>
            )}

            {/* Result flash overlay */}
            {latestResult && (
              <div className={`result-flash result-flash--${latestResult.result}`}>
                {resultConfig[latestResult.result].flashIcon}
              </div>
            )}
          </div>

          {/* Camera controls strip */}
          <div className="camera-controls">
            {cameraState === "active" ? (
              <button className="cam-ctrl-btn cam-ctrl-btn--stop" onClick={stopCamera}>
                <CameraOff className="size-3.5 mr-1.5" /> Stop Camera
              </button>
            ) : (
              <button className="cam-ctrl-btn cam-ctrl-btn--start" onClick={startCamera} disabled={cameraState === "starting"}>
                <Camera className="size-3.5 mr-1.5" />
                {cameraState === "starting" ? "Starting…" : "Start Camera"}
              </button>
            )}
            <span className="cam-format-hint">
              Supports QR · Code 128 · Code 39 · EAN · UPC · PDF417
            </span>
          </div>
        </div>

        {/* ── Controls panel ── */}
        <div className="controls-panel">

          {/* Checkpoint */}
          <div className="field-group">
            <Label className="field-label">
              <MapPin className="field-label-icon" /> Checkpoint Location
            </Label>
            <Select
              value={checkpoint.label}
              onValueChange={(v) => {
                const found = CHECKPOINTS.find((c) => c.label === v);
                if (found) setCheckpoint(found);
              }}
            >
              <SelectTrigger className="field-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECKPOINTS.map((c) => (
                  <SelectItem key={c.label} value={c.label}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Manual entry toggle */}
          <div className="manual-entry-section">
            <button
              className="manual-toggle"
              onClick={() => setManualOpen((o) => !o)}
            >
              <Keyboard className="size-3.5 mr-1.5" />
              Manual barcode entry
              {manualOpen ? (
                <ChevronUp className="size-3.5 ml-auto" />
              ) : (
                <ChevronDown className="size-3.5 ml-auto" />
              )}
            </button>

            {manualOpen && (
              <div className="manual-entry-body">
                <div className="flex gap-2">
                  <Input
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="e.g. 6008454002605"
                    className="field-input font-mono"
                    onKeyDown={(e) => e.key === "Enter" && triggerVerify()}
                    disabled={scanning}
                  />
                  <Button
                    onClick={() => triggerVerify()}
                    disabled={scanning || !barcode.trim()}
                    className="verify-btn"
                  >
                    {scanning ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ScanLine className="size-4" />
                    )}
                  </Button>
                </div>
                <p className="field-hint">
                  Press Enter or click the button to verify manually.
                </p>
              </div>
            )}
          </div>

          {/* Scan history */}
          {results.length > 1 && (
            <div className="scan-history">
              <div className="scan-history-header">
                <Activity className="size-3.5" /> Recent scans
              </div>
              <div className="scan-history-list">
                {results.slice(1, 6).map((r, i) => (
                  <HistoryRow key={i} result={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Full result card (below grid) ── */}
      {latestResult && <ResultCard result={latestResult} />}

      {latestResult && (aiInsightLoading || aiInsight || aiInsightError) && (
        <AiInsightCard
          title="AI Officer Assist"
          loading={aiInsightLoading}
          error={aiInsightError}
          risk={aiInsight?.riskLevel}
          headline={
            aiInsight
              ? aiInsight.recommendedAction === "allow"
                ? "Allow holder to proceed"
                : aiInsight.recommendedAction === "secondary_inspection"
                  ? "Refer to secondary inspection"
                  : "Detain and report to DHA"
              : undefined
          }
          summary={aiInsight?.reasoning}
          sections={aiInsight ? [{ label: "Notes", items: aiInsight.notes }] : []}
          analyzedAt={aiInsight ? new Date() : null}
        />
      )}

      <style>{STYLES}</style>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="stat-pill">
      {icon}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

function HistoryRow({ result }: { result: ScanResult }) {
  const cfg = resultConfig[result.result];
  return (
    <div className={`history-row history-row--${result.result}`}>
      <cfg.Icon className={`history-icon ${cfg.color}`} />
      <span className="history-code">{result.barcode}</span>
      <span className="history-time">{format(result.at, "HH:mm:ss")}</span>
      <span className={`history-badge history-badge--${result.result}`}>{cfg.title}</span>
    </div>
  );
}

function ResultCard({ result }: { result: ScanResult }) {
  const cfg = resultConfig[result.result];
  const { Icon } = cfg;
  const p = result.permit;

  return (
    <div className={`result-card result-card--${result.result}`}>
      <div className="result-card-header">
        <Icon className={`result-card-icon ${cfg.color}`} />
        <div className="result-card-titles">
          <h2 className="result-card-title">{cfg.title}</h2>
          <p className="result-card-msg">{cfg.message}</p>
        </div>
        <div className="result-card-meta">
          <StatusBadge status={result.result} />
          <span className="result-card-ms">{result.ms}ms</span>
        </div>
      </div>

      {p && (
        <div className="result-card-fields">
          <Field icon={User2} label="Holder" value={`${p.givenNames} ${p.surname}`} />
          <Field icon={User2} label="Passport / Nationality" value={`${p.passport} · ${p.nationality}`} />
          <Field icon={Calendar} label="Permit type" value={PERMIT_TYPE_LABELS[p.permitType]} />
          <Field icon={Calendar} label="Expires" value={format(new Date(p.expiryDate), "d MMM yyyy")} />
          <Field icon={ScanLine} label="Permit #" value={p.permitNumber} mono />
          <Field icon={MapPin} label="Scan location" value={result.location} />
          {p.employer && <Field icon={User2} label="Employer" value={p.employer} />}
          {p.institution && <Field icon={User2} label="Institution" value={p.institution} />}
          <Field icon={Clock} label="Logged" value={format(result.at, "d MMM yyyy HH:mm:ss")} />
        </div>
      )}

      {!p && (
        <div className="result-card-fields">
          <Field icon={AlertTriangle} label="Barcode" value={result.barcode} mono />
          <Field icon={MapPin} label="Scan location" value={result.location} />
          <Field icon={Clock} label="Logged" value={format(result.at, "d MMM yyyy HH:mm:ss")} />
        </div>
      )}
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="result-field">
      <Icon className="result-field-icon" />
      <div>
        <div className="result-field-label">{label}</div>
        <div className={`result-field-value ${mono ? "font-mono" : ""}`}>{value}</div>
      </div>
    </div>
  );
}

// ─── Result config ─────────────────────────────────────────────────────────────

const resultConfig = {
  valid: {
    Icon: CheckCircle2,
    color: "text-emerald-500",
    title: "Permit Valid",
    message: "Holder is authorized to proceed.",
    flashIcon: <CheckCircle2 className="size-16 text-emerald-400" />,
  },
  expired: {
    Icon: Clock,
    color: "text-amber-500",
    title: "Permit Expired",
    message: "Holder must reapply before re-entry.",
    flashIcon: <Clock className="size-16 text-amber-400" />,
  },
  revoked: {
    Icon: XCircle,
    color: "text-red-500",
    title: "Permit Revoked",
    message: "Detain and escalate to Home Affairs.",
    flashIcon: <XCircle className="size-16 text-red-400" />,
  },
  not_found: {
    Icon: HelpCircle,
    color: "text-slate-400",
    title: "Not Registered",
    message: "Barcode not in central database — possible fraud.",
    flashIcon: <HelpCircle className="size-16 text-slate-400" />,
  },
} as const;

// ─── Styles ────────────────────────────────────────────────────────────────────

const STYLES = `
  /* ── Root & layout ── */
  .verify-root {
    padding: 1.25rem;
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    font-family: 'DM Sans', 'Geist', system-ui, sans-serif;
  }
  @media (min-width: 1024px) {
    .verify-root { padding: 2rem; gap: 1.75rem; }
  }

  /* ── Header ── */
  .verify-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .verify-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted-foreground);
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 99px;
    padding: 0.2rem 0.65rem;
    width: fit-content;
    margin-bottom: 0.35rem;
  }
  .verify-badge-icon { width: 0.75rem; height: 0.75rem; }
  .verify-title {
    font-size: clamp(1.5rem, 4vw, 2rem);
    font-weight: 700;
    letter-spacing: -0.03em;
    color: var(--foreground);
    line-height: 1.1;
  }
  .verify-subtitle {
    font-size: 0.85rem;
    color: var(--muted-foreground);
    margin-top: 0.3rem;
  }
  .verify-stats { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .stat-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 0.5rem 0.85rem;
    min-width: 110px;
  }
  .stat-icon { width: 0.85rem; height: 0.85rem; color: var(--muted-foreground); }
  .stat-label { font-size: 0.65rem; color: var(--muted-foreground); line-height: 1; }
  .stat-value { font-size: 0.85rem; font-weight: 600; color: var(--foreground); line-height: 1.3; }

  /* ── Main grid ── */
  .verify-grid {
    display: grid;
    gap: 1.25rem;
  }
  @media (min-width: 1024px) {
    .verify-grid {
      grid-template-columns: 1fr 1fr;
      align-items: start;
      gap: 1.5rem;
    }
  }

  /* ── Camera panel ── */
  .camera-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-radius: 1.25rem;
    overflow: hidden;
    border: 1px solid var(--border);
    background: #0a0a0a;
    order: -1; /* Mobile: camera always first */
  }
  @media (min-width: 1024px) {
    .camera-panel { order: 0; }
  }

  .camera-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #0d0d0d;
    overflow: hidden;
  }

  .camera-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.4s ease;
  }
  .camera-video.visible { opacity: 1; }

  /* overlay states */
  .camera-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: #888;
    font-size: 0.8rem;
    background: #0d0d0d;
    z-index: 5;
  }
  .camera-overlay--error { color: #f87171; }
  .camera-overlay-icon { width: 2.5rem; height: 2.5rem; }
  .camera-retry-btn {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    padding: 0.4rem 0.85rem;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 99px;
    color: #ccc;
    cursor: pointer;
    margin-top: 0.25rem;
    transition: background 0.15s;
  }
  .camera-retry-btn:hover { background: rgba(255,255,255,0.12); }

  /* scan frame overlay */
  .scan-frame {
    position: absolute;
    inset: 0;
    z-index: 10;
    pointer-events: none;
  }
  /* Dark vignette around scan zone */
  .scan-frame::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom,
        rgba(0,0,0,0.45) 0%,
        transparent 28%,
        transparent 72%,
        rgba(0,0,0,0.45) 100%
      ),
      linear-gradient(to right,
        rgba(0,0,0,0.35) 0%,
        transparent 20%,
        transparent 80%,
        rgba(0,0,0,0.35) 100%
      );
  }

  /* Corner brackets */
  .corner {
    position: absolute;
    width: 28px;
    height: 28px;
    border-color: rgba(255,255,255,0.85);
    border-style: solid;
    border-width: 0;
    transition: border-color 0.3s;
  }
  .scan-frame--ready .corner { border-color: #34d399; }
  .scan-frame--scanning .corner { border-color: #60a5fa; }

  .corner--tl { top: 18%; left: 12%; border-top-width: 3px; border-left-width: 3px; border-radius: 3px 0 0 0; }
  .corner--tr { top: 18%; right: 12%; border-top-width: 3px; border-right-width: 3px; border-radius: 0 3px 0 0; }
  .corner--bl { bottom: 22%; left: 12%; border-bottom-width: 3px; border-left-width: 3px; border-radius: 0 0 0 3px; }
  .corner--br { bottom: 22%; right: 12%; border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 3px 0; }

  /* Laser sweep */
  .scan-laser {
    position: absolute;
    left: 12%;
    right: 12%;
    top: 18%;
    height: 2px;
    background: linear-gradient(to right, transparent, #34d399, #34d399cc, transparent);
    box-shadow: 0 0 8px 2px #34d39988;
    border-radius: 99px;
    animation: laserSweep 2.2s ease-in-out infinite;
    opacity: 0.9;
  }
  .scan-laser--hit {
    background: linear-gradient(to right, transparent, #60a5fa, #60a5facc, transparent);
    box-shadow: 0 0 12px 3px #60a5fa88;
    animation: laserHit 0.4s ease-out forwards;
  }
  @keyframes laserSweep {
    0%   { top: 20%; opacity: 0.9; }
    50%  { top: 72%; opacity: 1; }
    100% { top: 20%; opacity: 0.9; }
  }
  @keyframes laserHit {
    0%   { opacity: 1; transform: scaleX(1); }
    100% { opacity: 0; transform: scaleX(1.4); }
  }

  /* Scan grid lines (subtle) */
  .scan-frame::after {
    content: '';
    position: absolute;
    left: 12%; right: 12%;
    top: 18%; bottom: 22%;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 20% 20%;
  }

  /* Scan hint */
  .scan-hint {
    position: absolute;
    bottom: 18%;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.72rem;
    color: rgba(255,255,255,0.7);
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    padding: 0.25rem 0.75rem;
    border-radius: 99px;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }

  /* LIVE badge */
  .live-badge {
    position: absolute;
    top: 0.75rem;
    left: 0.75rem;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #fff;
    background: rgba(239,68,68,0.85);
    backdrop-filter: blur(4px);
    padding: 0.2rem 0.5rem;
    border-radius: 99px;
  }
  .live-dot {
    width: 5px; height: 5px;
    border-radius: 99px;
    background: #fff;
    animation: livePulse 1.2s ease-in-out infinite;
  }
  @keyframes livePulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.7); }
  }

  /* Result flash */
  .result-flash {
    position: absolute;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: flashIn 0.25s ease-out forwards, flashOut 0.5s ease-in 0.8s forwards;
    pointer-events: none;
  }
  .result-flash--valid    { background: rgba(16,185,129,0.35); }
  .result-flash--expired  { background: rgba(245,158,11,0.35); }
  .result-flash--revoked  { background: rgba(239,68,68,0.35); }
  .result-flash--not_found { background: rgba(100,116,139,0.25); }
  @keyframes flashIn  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes flashOut { from { opacity: 1; } to { opacity: 0; } }

  /* Camera controls strip */
  .camera-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.65rem 0.85rem;
    background: var(--card);
    border-top: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .cam-ctrl-btn {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 0.35rem 0.85rem;
    border-radius: 99px;
    border: 1px solid var(--border);
    cursor: pointer;
    transition: all 0.15s;
    background: var(--background);
    color: var(--foreground);
  }
  .cam-ctrl-btn:hover { background: var(--muted); }
  .cam-ctrl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .cam-ctrl-btn--stop { border-color: #f87171; color: #f87171; }
  .cam-ctrl-btn--stop:hover { background: rgba(239,68,68,0.08); }
  .cam-format-hint {
    font-size: 0.65rem;
    color: var(--muted-foreground);
    text-align: right;
    flex: 1;
  }

  /* ── Controls panel ── */
  .controls-panel {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  /* Field group */
  .field-group { display: flex; flex-direction: column; gap: 0.4rem; }
  .field-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--foreground);
  }
  .field-label-icon { width: 0.8rem; height: 0.8rem; color: var(--muted-foreground); }
  .field-select { font-size: 0.85rem; }
  .field-hint { font-size: 0.72rem; color: var(--muted-foreground); margin-top: 0.25rem; }

  /* Manual entry */
  .manual-entry-section {
    border: 1px solid var(--border);
    border-radius: 0.85rem;
    overflow: hidden;
    background: var(--card);
  }
  .manual-toggle {
    display: flex;
    align-items: center;
    width: 100%;
    gap: 0.4rem;
    padding: 0.7rem 0.9rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--muted-foreground);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: color 0.15s, background 0.15s;
  }
  .manual-toggle:hover { color: var(--foreground); background: var(--muted)/50; }
  .manual-entry-body { padding: 0 0.9rem 0.9rem; display: flex; flex-direction: column; gap: 0.4rem; }
  .verify-btn { padding: 0 0.75rem; }

  /* Inline result */
  .inline-result {
    border-radius: 0.85rem;
    border: 1.5px solid var(--border);
    overflow: hidden;
    animation: slideUp 0.3s ease-out;
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .inline-result--valid    { border-color: #34d39944; background: rgba(16,185,129,0.06); }
  .inline-result--expired  { border-color: #f59e0b44; background: rgba(245,158,11,0.06); }
  .inline-result--revoked  { border-color: #ef444444; background: rgba(239,68,68,0.07); }
  .inline-result--not_found { border-color: var(--border); background: var(--card); }

  .inline-result-header {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  .inline-result-icon { width: 1.4rem; height: 1.4rem; flex-shrink: 0; }
  .inline-result-title { font-size: 0.85rem; font-weight: 600; color: var(--foreground); }
  .inline-result-code { font-size: 0.7rem; font-family: monospace; color: var(--muted-foreground); }

  .inline-result-details {
    padding: 0.6rem 0.8rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--border);
  }
  .detail-row { display: flex; flex-direction: column; gap: 0.1rem; }
  .detail-label { font-size: 0.62rem; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; }
  .detail-value { font-size: 0.78rem; font-weight: 500; color: var(--foreground); }

  .inline-result-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.8rem;
    font-size: 0.72rem;
    color: var(--muted-foreground);
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .inline-result-time { font-family: monospace; }

  /* Scan history */
  .scan-history {
    border: 1px solid var(--border);
    border-radius: 0.85rem;
    overflow: hidden;
    background: var(--card);
  }
  .scan-history-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.6rem 0.85rem;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--border);
    background: var(--muted)/30;
  }
  .scan-history-list { display: flex; flex-direction: column; }
  .history-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.85rem;
    border-bottom: 1px solid var(--border);
    font-size: 0.78rem;
    animation: slideUp 0.2s ease-out;
  }
  .history-row:last-child { border-bottom: none; }
  .history-icon { width: 0.9rem; height: 0.9rem; flex-shrink: 0; }
  .history-code { font-family: monospace; font-size: 0.73rem; color: var(--foreground); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .history-time { font-family: monospace; font-size: 0.68rem; color: var(--muted-foreground); }
  .history-badge {
    font-size: 0.62rem;
    font-weight: 600;
    padding: 0.15rem 0.5rem;
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .history-badge--valid    { background: rgba(16,185,129,0.15); color: #34d399; }
  .history-badge--expired  { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .history-badge--revoked  { background: rgba(239,68,68,0.15);  color: #f87171; }
  .history-badge--not_found { background: var(--muted); color: var(--muted-foreground); }

  /* ── Full result card ── */
  .result-card {
    border-radius: 1.25rem;
    border: 2px solid var(--border);
    overflow: hidden;
    animation: slideUp 0.35s ease-out;
  }
  .result-card--valid    { border-color: #34d39933; background: rgba(16,185,129,0.05); }
  .result-card--expired  { border-color: #f59e0b33; background: rgba(245,158,11,0.05); }
  .result-card--revoked  { border-color: #ef444433; background: rgba(239,68,68,0.06); }
  .result-card--not_found { border-color: var(--border); background: var(--card); }

  .result-card-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .result-card-icon { width: 2.25rem; height: 2.25rem; flex-shrink: 0; }
  .result-card-titles { flex: 1; min-width: 0; }
  .result-card-title { font-size: 1.15rem; font-weight: 700; color: var(--foreground); }
  .result-card-msg { font-size: 0.82rem; color: var(--muted-foreground); margin-top: 0.2rem; }
  .result-card-meta { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
  .result-card-ms { font-size: 0.72rem; color: var(--muted-foreground); font-family: monospace; }

  .result-card-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem 1.25rem;
    padding: 1.25rem 1.5rem;
  }

  .result-field { display: flex; align-items: flex-start; gap: 0.5rem; }
  .result-field-icon { width: 0.9rem; height: 0.9rem; color: var(--muted-foreground); margin-top: 0.15rem; flex-shrink: 0; }
  .result-field-label { font-size: 0.67rem; color: var(--muted-foreground); text-transform: uppercase; letter-spacing: 0.05em; }
  .result-field-value { font-size: 0.85rem; font-weight: 500; color: var(--foreground); margin-top: 0.1rem; }

  /* ── Utility ── */
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;