import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { generateStructured } from "./ai-structured.server";

const AlertInput = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  barcode: z.string(),
  locationLabel: z.string(),
  resolved: z.boolean(),
  ageMinutes: z.number().nullable(),
});

const InputSchema = z.object({
  alerts: z.array(AlertInput).max(100),
});

const OutputSchema = z.object({
  overallRisk: z.enum(["low", "medium", "high", "critical"]),
  headline: z.string(),
  summary: z.string(),
  prioritized: z
    .array(
      z.object({
        alertId: z.string(),
        priority: z.enum(["low", "medium", "high", "critical"]),
        reasoning: z.string(),
        recommendedAction: z.string(),
      }),
    )
    .max(20),
  patterns: z.array(z.string()).max(8),
  recommendations: z.array(z.string()).max(6),
});

export type AiAnalystResult = z.infer<typeof OutputSchema>;

export const analyzeAlerts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AiAnalystResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    if (data.alerts.length === 0) {
      return {
        overallRisk: "low",
        headline: "No open alerts",
        summary:
          "There are no open fraud or anomaly alerts to analyze. The system is monitoring scan activity in real time.",
        prioritized: [],
        patterns: [],
        recommendations: ["Continue normal monitoring."],
      };
    }

    const gateway = createLovableAiGatewayProvider(key);

    const system = `You are an AI fraud analyst for the South African Department of Home Affairs DigiPermit Verification System (DigiPermit).
You receive a list of fraud / anomaly alerts produced by rule-based detection on permit scan events at border posts, airports, harbours, and DHA checkpoints.
Alert types:
- repeated_expired: same permit barcode scanned 2+ times while expired or revoked within an hour
- location_anomaly: same permit scanned at 3+ distinct checkpoints within an hour (impossible travel)
- burst_invalid: 3+ unregistered barcodes scanned at the same checkpoint within an hour (possible counterfeit attack)

Your job: prioritize alerts, identify cross-alert patterns (e.g. coordinated fraud rings, hotspot checkpoints, repeat offending barcodes), and recommend concrete enforcement actions for DHA officers. Be concise, factual, and actionable. Reference barcodes and checkpoints by name.`;

    const prompt = `Analyze these ${data.alerts.length} alerts and produce a prioritized briefing:\n\n${JSON.stringify(
      data.alerts,
      null,
      2,
    )}`;

    try {
      return await generateStructured({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt,
        schema: OutputSchema,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) {
        throw new Error("AI rate limit reached. Please wait a moment and try again.");
      }
      if (msg.includes("402")) {
        throw new Error(
          "AI credits exhausted. Add credits in your Lovable workspace billing to continue.",
        );
      }
      throw new Error(`AI analysis failed: ${msg}`);
    }
  });