import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateStructured } from "./ai-structured.server";

function gateway() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createLovableAiGatewayProvider(key);
}

function handleErr(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("429")) throw new Error("AI is busy — please retry shortly.");
  if (msg.includes("402"))
    throw new Error("AI credits exhausted. Add credits in your Lovable workspace billing.");
  throw new Error(`AI analysis failed: ${msg}`);
}

const MODEL = "google/gemini-3-flash-preview";

// ─────────────────────────────────────────────────────────────────────────────
// 1) Scans page — operational briefing over recent scans
// ─────────────────────────────────────────────────────────────────────────────

const ScanRow = z.object({
  barcode: z.string(),
  result: z.string(),
  locationLabel: z.string(),
  officerName: z.string(),
  ageMinutes: z.number().nullable(),
});

const ScanInsightOut = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  headline: z.string(),
  summary: z.string(),
  hotspots: z.array(z.string()).max(5),
  watchBarcodes: z.array(z.string()).max(5),
  recommendations: z.array(z.string()).max(5),
});
export type ScanInsight = z.infer<typeof ScanInsightOut>;

export const analyzeScans = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scans: z.array(ScanRow).max(80) }).parse(input),
  )
  .handler(async ({ data }): Promise<ScanInsight> => {
    if (data.scans.length === 0) {
      return {
        riskLevel: "low",
        headline: "No recent scans",
        summary: "No scan activity to analyze yet.",
        hotspots: [],
        watchBarcodes: [],
        recommendations: ["Start verifying permits to populate the scan feed."],
      };
    }
    try {
      return await generateStructured({
        model: gateway()(MODEL),
        system:
          "You are an AI operations analyst for the SA Department of Home Affairs DigiPermit Verification System. Analyze recent permit scan events at border posts, airports, and harbours. Identify hotspot checkpoints, repeat-offending barcodes, unusual activity, and produce concrete officer-facing recommendations. Be concise and reference checkpoints/barcodes by name.",
        prompt: `Recent ${data.scans.length} scans:\n${JSON.stringify(data.scans)}`,
        schema: ScanInsightOut,
      });
    } catch (e) {
      handleErr(e);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2) Verify page — per-scan risk explanation
// ─────────────────────────────────────────────────────────────────────────────

const VerifyInsightOut = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  recommendedAction: z.enum(["allow", "secondary_inspection", "detain_and_report"]),
  reasoning: z.string(),
  notes: z.array(z.string()).max(4),
});
export type VerifyInsight = z.infer<typeof VerifyInsightOut>;

export const explainVerification = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        barcode: z.string(),
        result: z.string(),
        checkpoint: z.string(),
        permit: z
          .object({
            permitType: z.string(),
            nationality: z.string(),
            issueDate: z.string(),
            expiryDate: z.string(),
            status: z.string(),
          })
          .nullable(),
        recentHistory: z
          .array(
            z.object({
              checkpoint: z.string(),
              result: z.string(),
              ageMinutes: z.number().nullable(),
            }),
          )
          .max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<VerifyInsight> => {
    try {
      return await generateStructured({
        model: gateway()(MODEL),
        system:
          "You are an AI officer-assist for SA DHA permit verification. Given a single scan event with permit details and the permit's recent scan history, classify risk and recommend ONE action: allow, secondary_inspection, or detain_and_report. Be factual and brief. Consider expired/revoked status, location anomalies (same permit at multiple checkpoints within an hour = impossible travel), and patterns of repeat invalid scans.",
        prompt: JSON.stringify(data),
        schema: VerifyInsightOut,
      });
    } catch (e) {
      handleErr(e);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3) Overview — shift briefing
// ─────────────────────────────────────────────────────────────────────────────

const OverviewBriefOut = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  headline: z.string(),
  summary: z.string(),
  trends: z.array(z.string()).max(4),
  topActions: z.array(z.string()).max(4),
});
export type OverviewBrief = z.infer<typeof OverviewBriefOut>;

export const briefOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        totalPermits: z.number(),
        expiringCount: z.number(),
        pendingRenewals: z.number(),
        openAlerts: z.number(),
        scansToday: z.number(),
        invalidRateToday: z.number(),
        topHotspots: z
          .array(z.object({ location: z.string(), invalid: z.number(), total: z.number() }))
          .max(5),
        recentAlertTypes: z.array(z.string()).max(10),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<OverviewBrief> => {
    try {
      return await generateStructured({
        model: gateway()(MODEL),
        system:
          "You are an AI shift commander briefing for SA DHA's permit monitoring operations. Given today's KPIs, hotspots, and open alert types, produce a 1-2 sentence executive summary and the top concrete actions to take this shift. Tone: calm, factual, decisive.",
        prompt: JSON.stringify(data),
        schema: OverviewBriefOut,
      });
    } catch (e) {
      handleErr(e);
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4) Renewals — decision support
// ─────────────────────────────────────────────────────────────────────────────

const RenewalReviewOut = z.object({
  recommendation: z.enum(["approve", "request_more_info", "reject"]),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
  riskFactors: z.array(z.string()).max(5),
  suggestedExpiryMonths: z.number().min(0).max(60).nullable(),
});
export type RenewalReview = z.infer<typeof RenewalReviewOut>;

export const reviewRenewal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        permitNumber: z.string(),
        permitType: z.string().nullable(),
        currentStatus: z.string().nullable(),
        currentExpiry: z.string().nullable(),
        holderName: z.string(),
        comments: z.string(),
        priorRenewals: z.number(),
        openAlertsForBarcode: z.number(),
        recentInvalidScans: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<RenewalReview> => {
    try {
      return await generateStructured({
        model: gateway()(MODEL),
        system:
          "You are an AI case officer for SA DHA permit renewals. Given the renewal request context, recommend ONE action: approve, request_more_info, or reject. The human officer makes the final decision — you are advisory. Be objective and cite specific risk factors.",
        prompt: JSON.stringify(data),
        schema: RenewalReviewOut,
      });
    } catch (e) {
      handleErr(e);
    }
  });