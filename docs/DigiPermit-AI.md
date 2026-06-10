# DigiPermit AI — User-Facing Overview

This document explains what the DigiPermit AI does, how it works, where it runs in the codebase, and how to use or tune it.

**Summary**
- DigiPermit AI is a deterministic rules-and-heuristics engine that scores permit scan activity, alerts, verification events, overviews, and renewal requests.
- It runs server-side as fast, synchronous functions and returns structured insights (risk levels, headlines, summaries, recommendations) used by the UI.

**Where it lives**
- Core logic: [src/lib/digipermit-ai-engine.ts](src/lib/digipermit-ai-engine.ts)
- Server endpoints (used by UI): [src/lib/ai-insights.functions.ts](src/lib/ai-insights.functions.ts) and [src/lib/ai-analyst.functions.ts](src/lib/ai-analyst.functions.ts)
- UI consumers: pages under `src/routes/` (example: [src/routes/_app.alerts.tsx](src/routes/_app.alerts.tsx), [src/routes/_app.scans.tsx](src/routes/_app.scans.tsx), [src/routes/_app.overview.tsx](src/routes/_app.overview.tsx))

**What it provides (exports)**
- `analyzeDigiPermitAlerts(input: { alerts: DigiPermitAlertInput[] }) -> DigiPermitAlertAnalysis`
  - Prioritizes open alerts, computes overall risk, patterns, and recommended actions.
- `analyzeDigiPermitScans(input: { scans: DigiPermitScanInput[] }) -> DigiPermitScanInsight`
  - Computes invalid rate, hotspots, watch list barcodes (repeated invalids, impossible-travel), and recommendations.
- `explainDigiPermitVerification(input) -> DigiPermitVerifyInsight`
  - Explains a single scan: base score by `result` (valid/expired/revoked/etc.), factors from recent history and expiry date, and recommended action (`allow`, `secondary_inspection`, `detain_and_report`).
- `briefDigiPermitOverview(input) -> DigiPermitOverviewBrief`
  - Produces a shift briefing from counts (open alerts, invalid rates, renewals, hotspots) and suggested top actions.
- `reviewDigiPermitRenewal(input) -> DigiPermitRenewalReview`
  - Decision support for renewals using status, expiry timing, comments, prior renewals, and open alerts.

**How the scoring works (high-level)**
- Scores are numeric (0–100) then mapped to `RiskLevel`: `low`, `medium`, `high`, `critical`.
- Alerts: type-based weights (e.g., `location_anomaly` +50), recency bonus, repeat-barcode and location concentration boost. Top alerts sorted by computed score.
- Scans: invalid rate (percent) and counts drive score; extra weight for "impossible travel" (same barcode at many checkpoints) and repeated invalid barcodes.
- Verification: base score depends on `result` (valid low, expired medium, revoked high), then history (recent invalids, many checkpoints) and expiry date increase risk.
- Renewals: missing/invalid status, expired dates, open alerts and recent invalid scans add risk; recommendation returned as `approve`, `request_more_info`, or `reject`.

**Privacy & external calls**
- The current engine is pure application logic inside the repo and does NOT call external AI/LLM services. All scoring runs server-side in your application process; data does not leave your server for AI inference.
- The project dependencies include `@ai-sdk/openai-compatible` (package.json), but the deterministic engine in `digipermit-ai-engine.ts` is local code — no API keys are required for this logic.

**How the UI uses it**
- Server functions are created with `createServerFn` in `src/lib/ai-insights.functions.ts` and `src/lib/ai-analyst.functions.ts` and invoked from the client via `useServerFn` (see the routes in `src/routes/` such as `_app.alerts.tsx`, `_app.scans.tsx`, and `_app.overview.tsx`).

Example (client usage pattern):

- Call `analyzeScans` from a page/component:

```ts
const runAnalyzeScans = useServerFn(analyzeScans);
await runAnalyzeScans.mutateAsync({ scans: [...] });
```

**Where to change behavior / tune thresholds**
- Edit the weight constants and threshold mapping inside `src/lib/digipermit-ai-engine.ts`:
  - Functions to review: `alertScore`, `riskFromScore`, scan scoring logic, and renewal scoring increments.
  - Change numeric weights (e.g., location_anomaly +50) to adjust sensitivity.

**Suggested next steps (if you want improvements)**
- Add unit tests for each exported function in `digipermit-ai-engine.ts` to lock in expected behavior for edge cases.
- Add feature flags or config values for adjustable thresholds instead of hard-coded numbers.
- If you want natural-language summaries or analyst-style explanations from an LLM, integrate an LLM client and add a layer that formats the deterministic outputs into richer prose — ensure privacy requirements are satisfied before sending data externally.

**Contact / maintenance notes**
- File to inspect for logic: [src/lib/digipermit-ai-engine.ts](src/lib/digipermit-ai-engine.ts)
- Endpoints: [src/lib/ai-insights.functions.ts](src/lib/ai-insights.functions.ts), [src/lib/ai-analyst.functions.ts](src/lib/ai-analyst.functions.ts)

---
If you want, I can:
- Add unit tests for the scoring functions.
- Replace hard-coded weights with a small JSON config and an admin UI to tune them.
- Draft a short training note for officers about how the AI risk labels should be interpreted.
