# Plan: System-wide AI for SPVMS

Today AI only runs once on the Alerts page (`analyzeAlerts` over open alerts). Users don't feel AI working elsewhere — Scans, Permits, Renewals, Verify, Overview, Users all run on raw rules/queries. Goal: surface AI assistance in every major workflow with a consistent UX, while keeping cost and latency under control.

## Architecture

Introduce a shared AI layer instead of one-off server fns.

```text
src/lib/ai/
  ai-gateway.server.ts        (existing, reused)
  ai-analyst.functions.ts     (existing — alerts triage, keep)
  ai-scan-insight.functions.ts    (per-scan risk explanation)
  ai-permit-review.functions.ts   (permit holder risk + duplicate/forgery hints)
  ai-renewal-review.functions.ts  (renewal request decision support)
  ai-overview-brief.functions.ts  (daily/shift situational briefing)
  ai-assistant.functions.ts       (free-form Q&A grounded in recent data)
  ai-cache.ts                     (signature -> result cache, TTL + in-flight dedupe)
```

All functions:
- Use `google/gemini-3-flash-preview` via existing gateway helper.
- Validate input with Zod, return `Output.object(...)` structured results.
- Handle 429 / 402 explicitly and surface a typed error.
- Are short, scoped prompts (≤ ~50 rows of context) — no full DB dumps.

Shared UI: `src/components/ai/AiInsightCard.tsx` (sparkle icon, risk badge, headline, summary, bullets, "Analyzed Xs ago", loading + error states). Used on every page so AI feels like one consistent assistant.

## Per-page improvements

1. **Alerts** (`_app.alerts.tsx`)
   - Keep current panel.
   - Add "Re-analyze" button (manual refresh).
   - Add per-alert "Ask AI: why is this suspicious?" expander that calls a lighter function with just that alert + recent related scans.
   - Cache by `openSignature` (dedupe re-renders / tab focus).

2. **Scans** (`_app.scans.tsx`)
   - New `AiInsightCard` above the table: AI summarizes last N scans — hot checkpoints, top flagged barcodes, unusual time-of-day patterns, recommended focus.
   - Per-row "AI" chip on suspicious scans (uses cached scan-insight result).

3. **Verify** (`_app.verify.tsx`)
   - After a scan/verify result, call `aiScanInsight` with the permit + recent history for that barcode → returns: risk level, plain-English explanation, recommended officer action ("allow / secondary inspection / detain & report").
   - Renders inside existing verification result card.

4. **Permits** (`_app.permits.tsx`) and **Permit Holder profile**
   - `aiPermitReview`: looks at the permit's scan history, renewal history, related alerts → returns risk profile, anomaly notes, duplicate-identity hints.
   - Shown on the permit detail card.

5. **Renewals** (`_app.renewals.tsx`)
   - `aiRenewalReview` for each pending request: recommends approve/review/deny with reasoning based on permit status, prior renewals, open alerts, scan anomalies. Decision still belongs to the officer; AI is advisory and the reason is logged in audit.

6. **Overview** (`_app.overview.tsx`)
   - `aiOverviewBrief`: 1–2 sentence "AI shift briefing" at the top — today's risk level, hotspots, trend vs yesterday, top 3 recommended actions. Auto-refreshes every 10 min.

7. **Global AI Assistant** (new, lives in `AppLayout` as a floating button)
   - Drawer with chat-style Q&A grounded in: recent scans, open alerts, permits matching the user's query.
   - Powered by `aiAssistant` server fn using AI SDK `generateText` with a tight system prompt and read-only "tools" (lookupPermit, recentScansForBarcode, openAlertsAtLocation). `stopWhen: stepCountIs(50)`.
   - Officers can ask: "Any suspicious activity at OR Tambo today?", "Show me barcode X history", "Why was alert Y raised?".

## Cross-cutting concerns

- **Cost / rate limits**: in-memory signature cache (5 min TTL) + in-flight dedupe per function; debounce auto-runs; manual refresh button everywhere; never call AI inside a tight loop or on every keystroke.
- **Latency UX**: skeleton + "AI is analyzing…" with sparkle animation in `AiInsightCard`. Stale results shown while refreshing.
- **Errors**: 429 → toast "AI is busy, retrying shortly"; 402 → inline "AI credits exhausted — add credits in workspace billing"; other → quiet inline error, page still works without AI.
- **Auditability**: when an officer acts on AI advice (resolve alert, approve renewal, escalate), persist `aiSuggestion` snapshot to the audit log so decisions are traceable.
- **Privacy**: send only fields needed for the task (barcode, type, timestamps, location, status). Never send full holder PII to the model.
- **Server boundary**: all AI work in `createServerFn` (already required by `LOVABLE_API_KEY` being server-only). Client just calls via `useServerFn` + `useQuery`.

## Rollout order
1. Shared `AiInsightCard` + `ai-cache`.
2. Scans page insight + Verify per-scan insight (highest "AI is working" signal).
3. Overview shift briefing.
4. Renewals + Permits review.
5. Global AI Assistant drawer.
6. Polish: per-alert deep-dive, audit logging of AI suggestions.

## Out of scope
- Training/fine-tuning custom models.
- Streaming chat UI (drawer can be added later with `useChat` if desired).
- Predictive ML (forecasting) — kept rule + LLM reasoning only.
