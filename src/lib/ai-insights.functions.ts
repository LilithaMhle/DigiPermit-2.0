import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  analyzeDigiPermitScans,
  briefDigiPermitOverview,
  explainDigiPermitVerification,
  reviewDigiPermitRenewal,
  type DigiPermitOverviewBrief,
  type DigiPermitRenewalReview,
  type DigiPermitScanInsight,
  type DigiPermitVerifyInsight,
} from "./digipermit-ai-engine";

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

export type ScanInsight = DigiPermitScanInsight;

export const analyzeScans = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ scans: z.array(ScanRow).max(80) }).parse(input),
  )
  .handler(async ({ data }): Promise<ScanInsight> => {
    return analyzeDigiPermitScans(data);
  });

// ─────────────────────────────────────────────────────────────────────────────
// 2) Verify page — per-scan risk explanation
// ─────────────────────────────────────────────────────────────────────────────

export type VerifyInsight = DigiPermitVerifyInsight;

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
    return explainDigiPermitVerification(data);
  });

// ─────────────────────────────────────────────────────────────────────────────
// 3) Overview — shift briefing
// ─────────────────────────────────────────────────────────────────────────────

export type OverviewBrief = DigiPermitOverviewBrief;

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
    return briefDigiPermitOverview(data);
  });

// ─────────────────────────────────────────────────────────────────────────────
// 4) Renewals — decision support
// ─────────────────────────────────────────────────────────────────────────────

export type RenewalReview = DigiPermitRenewalReview;

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
    return reviewDigiPermitRenewal(data);
  });