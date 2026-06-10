import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  analyzeDigiPermitAlerts,
  type DigiPermitAlertAnalysis,
} from "./digipermit-ai-engine";

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

export type AiAnalystResult = DigiPermitAlertAnalysis;

export const analyzeAlerts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AiAnalystResult> => {
    return analyzeDigiPermitAlerts(data);
  });