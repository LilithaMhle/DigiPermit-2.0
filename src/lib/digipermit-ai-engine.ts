export type RiskLevel = "low" | "medium" | "high" | "critical";

type AlertPriority = RiskLevel;

export interface DigiPermitAlertInput {
  id: string;
  type: string;
  description: string;
  barcode: string;
  locationLabel: string;
  resolved: boolean;
  ageMinutes: number | null;
}

export interface DigiPermitAlertAnalysis {
  overallRisk: RiskLevel;
  headline: string;
  summary: string;
  prioritized: Array<{
    alertId: string;
    priority: AlertPriority;
    reasoning: string;
    recommendedAction: string;
  }>;
  patterns: string[];
  recommendations: string[];
}

export interface DigiPermitScanInput {
  barcode: string;
  result: string;
  locationLabel: string;
  officerName: string;
  ageMinutes: number | null;
}

export interface DigiPermitScanInsight {
  riskLevel: RiskLevel;
  headline: string;
  summary: string;
  hotspots: string[];
  watchBarcodes: string[];
  recommendations: string[];
}

export interface DigiPermitVerifyInsight {
  riskLevel: RiskLevel;
  recommendedAction: "allow" | "secondary_inspection" | "detain_and_report";
  reasoning: string;
  notes: string[];
}

export interface DigiPermitOverviewBrief {
  riskLevel: RiskLevel;
  headline: string;
  summary: string;
  trends: string[];
  topActions: string[];
}

export interface DigiPermitRenewalReview {
  recommendation: "approve" | "request_more_info" | "reject";
  confidence: "low" | "medium" | "high";
  reasoning: string;
  riskFactors: string[];
  suggestedExpiryMonths: number | null;
}

function riskFromScore(score: number): RiskLevel {
  if (score >= 85) return "critical";
  if (score >= 60) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function countBy<T>(items: T[], keyFn: (item: T) => string) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item) || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function topEntries(map: Map<string, number>, max = 5) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, max);
}

function resultLabel(result: string) {
  return result.replace(/_/g, " ");
}

function alertTypeLabel(type: string) {
  if (type === "repeated_expired") return "repeated expired/revoked permit scans";
  if (type === "location_anomaly") return "impossible-travel location anomaly";
  if (type === "burst_invalid") return "burst of unregistered barcode scans";
  return resultLabel(type);
}

function alertScore(alert: DigiPermitAlertInput, barcodeCount: number, locationCount: number) {
  let score = 20;
  if (alert.type === "location_anomaly") score += 50;
  if (alert.type === "repeated_expired") score += 42;
  if (alert.type === "burst_invalid") score += 36;
  if (alert.ageMinutes !== null && alert.ageMinutes <= 20) score += 8;
  if (barcodeCount >= 2 && alert.barcode !== "—") score += 12;
  if (locationCount >= 2) score += 10;
  return Math.min(100, score);
}

export function analyzeDigiPermitAlerts(input: {
  alerts: DigiPermitAlertInput[];
}): DigiPermitAlertAnalysis {
  const open = input.alerts.filter((a) => !a.resolved);
  if (open.length === 0) {
    return {
      overallRisk: "low",
      headline: "No open alerts",
      summary:
        "DigiPermit AI is monitoring scan activity continuously. No unresolved fraud or anomaly alerts require analyst action right now.",
      prioritized: [],
      patterns: [],
      recommendations: ["Continue normal checkpoint monitoring."],
    };
  }

  const barcodeCounts = countBy(open.filter((a) => a.barcode !== "—"), (a) => a.barcode);
  const locationCounts = countBy(open, (a) => a.locationLabel);
  const typeCounts = countBy(open, (a) => a.type);

  const prioritized = open
    .map((alert) => {
      const score = alertScore(
        alert,
        barcodeCounts.get(alert.barcode) ?? 0,
        locationCounts.get(alert.locationLabel) ?? 0,
      );
      const priority = riskFromScore(score);
      return {
        alertId: alert.id,
        priority,
        score,
        reasoning: `${alertTypeLabel(alert.type)} at ${alert.locationLabel}${
          alert.barcode !== "—" ? ` involving permit ${alert.barcode}` : ""
        }. ${alert.description}`,
        recommendedAction:
          alert.type === "location_anomaly"
            ? "Hold the holder for secondary inspection, verify travel timeline, and compare identity documents."
            : alert.type === "burst_invalid"
              ? "Inspect devices and documents at the checkpoint, then preserve barcode samples for fraud investigation."
              : "Do not clear the permit until status and holder identity are manually confirmed.",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ score: _score, ...item }) => item);

  const peakScore = Math.max(...prioritized.map((p) => ({ low: 15, medium: 40, high: 68, critical: 90 })[p.priority]));
  const concentration = Math.min(20, Math.max(0, open.length - 1) * 5);
  const overallRisk = riskFromScore(peakScore + concentration);
  const topLocation = topEntries(locationCounts, 1)[0];
  const topType = topEntries(typeCounts, 1)[0];

  const patterns = [
    `${open.length} unresolved alert${open.length === 1 ? "" : "s"} currently active.`,
    topLocation ? `${topLocation[0]} is the leading hotspot with ${topLocation[1]} alert${topLocation[1] === 1 ? "" : "s"}.` : "",
    topType ? `Most common signal: ${alertTypeLabel(topType[0])} (${topType[1]} case${topType[1] === 1 ? "" : "s"}).` : "",
    ...topEntries(barcodeCounts, 3)
      .filter(([, count]) => count > 1)
      .map(([barcode, count]) => `Permit ${barcode} appears in ${count} open alerts.`),
  ].filter(Boolean).slice(0, 8);

  const recommendations = [
    topLocation ? `Assign a supervisor to ${topLocation[0]} until the alert queue is cleared.` : "Review all open alerts by priority.",
    "Verify holder identity against passport details before clearing high-risk cases.",
    "Record officer notes when resolving each alert so future reviews have a clear audit trail.",
  ];

  return {
    overallRisk,
    headline: `${overallRisk === "critical" ? "Critical" : overallRisk === "high" ? "High" : overallRisk === "medium" ? "Moderate" : "Low"} fraud risk detected`,
    summary: `DigiPermit AI ranked ${open.length} open alert${open.length === 1 ? "" : "s"} using alert type, location concentration, repeat barcode signals, and recency.`,
    prioritized,
    patterns,
    recommendations,
  };
}

export function analyzeDigiPermitScans(input: { scans: DigiPermitScanInput[] }): DigiPermitScanInsight {
  const scans = input.scans;
  if (scans.length === 0) {
    return {
      riskLevel: "low",
      headline: "No recent scans",
      summary: "DigiPermit AI is ready, but there is no scan activity to analyze yet.",
      hotspots: [],
      watchBarcodes: [],
      recommendations: ["Start verifying permits to populate the scan feed."],
    };
  }

  const invalid = scans.filter((s) => s.result !== "valid");
  const invalidRate = Math.round((invalid.length / scans.length) * 100);
  const locationInvalid = new Map<string, number>();
  const locationTotal = new Map<string, number>();
  const barcodeInvalid = new Map<string, number>();
  const barcodeTotal = new Map<string, number>();
  const barcodeLocations = new Map<string, Set<string>>();

  for (const scan of scans) {
    locationTotal.set(scan.locationLabel, (locationTotal.get(scan.locationLabel) ?? 0) + 1);
    barcodeTotal.set(scan.barcode, (barcodeTotal.get(scan.barcode) ?? 0) + 1);
    if (!barcodeLocations.has(scan.barcode)) barcodeLocations.set(scan.barcode, new Set());
    barcodeLocations.get(scan.barcode)?.add(scan.locationLabel);
    if (scan.result !== "valid") {
      locationInvalid.set(scan.locationLabel, (locationInvalid.get(scan.locationLabel) ?? 0) + 1);
      barcodeInvalid.set(scan.barcode, (barcodeInvalid.get(scan.barcode) ?? 0) + 1);
    }
  }

  const impossibleTravel = Array.from(barcodeLocations.entries()).filter(([, locations]) => locations.size >= 3);
  const repeatedInvalid = topEntries(barcodeInvalid, 5).filter(([, count]) => count >= 2);
  const score = Math.min(
    100,
    invalidRate * 1.5 + invalid.length * 4 + impossibleTravel.length * 25 + repeatedInvalid.length * 12,
  );
  const riskLevel = riskFromScore(score);
  const topHotspots = topEntries(locationInvalid, 5);
  const topHotspot = topHotspots[0];

  const hotspots = topHotspots.map(([location, count]) => {
    const total = locationTotal.get(location) ?? count;
    return `${location}: ${count} invalid of ${total} recent scan${total === 1 ? "" : "s"}.`;
  });

  const watchBarcodes = [
    ...repeatedInvalid.map(([barcode, count]) => `Permit ${barcode}: ${count} invalid scan${count === 1 ? "" : "s"}.`),
    ...impossibleTravel
      .slice(0, 5)
      .map(([barcode, locations]) => `Permit ${barcode}: scanned at ${locations.size} different checkpoints.`),
  ].slice(0, 5);

  const recommendations = invalid.length
    ? [
        topHotspot ? `Prioritize document checks at ${topHotspot[0]}.` : "Prioritize invalid scan review.",
        repeatedInvalid.length ? "Escalate repeat invalid barcodes to fraud review." : "Keep monitoring for repeat invalid barcodes.",
        impossibleTravel.length ? "Treat multi-checkpoint repeats as possible impossible travel." : "Compare locations when the same permit reappears.",
      ]
    : ["No invalid scan pattern detected in the current feed.", "Maintain normal verification throughput."];

  return {
    riskLevel,
    headline: invalid.length
      ? `${invalidRate}% invalid rate across recent scans`
      : "Recent scans are clearing normally",
    summary: `DigiPermit AI reviewed ${scans.length} recent verification event${scans.length === 1 ? "" : "s"}; ${invalid.length} require closer analyst attention.`,
    hotspots,
    watchBarcodes,
    recommendations,
  };
}

export function explainDigiPermitVerification(input: {
  barcode: string;
  result: string;
  checkpoint: string;
  permit: {
    permitType: string;
    nationality: string;
    issueDate: string;
    expiryDate: string;
    status: string;
  } | null;
  recentHistory: Array<{ checkpoint: string; result: string; ageMinutes: number | null }>;
}): DigiPermitVerifyInsight {
  let score = input.result === "valid" ? 8 : input.result === "expired" ? 52 : input.result === "revoked" ? 88 : 70;
  const notes: string[] = [];

  if (input.result === "valid") notes.push("Permit status returned valid for this scan.");
  if (input.result === "expired") notes.push("Permit is expired and should not be cleared without manual authority.");
  if (input.result === "revoked") notes.push("Permit is revoked; officer should escalate immediately.");
  if (input.result === "not_found") notes.push("Barcode was not found in the permit registry.");

  const invalidHistory = input.recentHistory.filter((h) => h.result !== "valid");
  const locations = new Set(input.recentHistory.map((h) => h.checkpoint));
  if (invalidHistory.length >= 2) {
    score += 15;
    notes.push(`${invalidHistory.length} recent scan results for this barcode were not valid.`);
  }
  if (locations.size >= 3) {
    score += 30;
    notes.push(`Recent history shows ${locations.size} checkpoints, which may indicate impossible travel.`);
  }
  if (input.permit?.expiryDate && new Date(input.permit.expiryDate) < new Date()) {
    score += 20;
    notes.push("Permit expiry date is already in the past.");
  }

  const riskLevel = riskFromScore(Math.min(100, score));
  const recommendedAction: DigiPermitVerifyInsight["recommendedAction"] =
    riskLevel === "critical" || input.result === "revoked"
      ? "detain_and_report"
      : riskLevel === "high" || riskLevel === "medium" || input.result !== "valid"
        ? "secondary_inspection"
        : "allow";

  return {
    riskLevel,
    recommendedAction,
    reasoning: `DigiPermit AI classified permit ${input.barcode} as ${riskLevel} risk at ${input.checkpoint} because the scan result is ${resultLabel(input.result)}${
      input.recentHistory.length ? ` with ${input.recentHistory.length} recent history item${input.recentHistory.length === 1 ? "" : "s"}` : ""
    }.`,
    notes: notes.slice(0, 4),
  };
}

export function briefDigiPermitOverview(input: {
  totalPermits: number;
  expiringCount: number;
  pendingRenewals: number;
  openAlerts: number;
  scansToday: number;
  invalidRateToday: number;
  topHotspots: Array<{ location: string; invalid: number; total: number }>;
  recentAlertTypes: string[];
}): DigiPermitOverviewBrief {
  const score = Math.min(
    100,
    input.openAlerts * 14 + input.invalidRateToday * 1.4 + input.pendingRenewals * 3 + input.expiringCount * 1.5,
  );
  const riskLevel = riskFromScore(score);
  const hotspot = input.topHotspots[0];
  const activeWork = input.openAlerts + input.pendingRenewals + input.expiringCount;

  const trends = [
    `${input.scansToday} scan${input.scansToday === 1 ? "" : "s"} recorded today with ${input.invalidRateToday}% invalid rate.`,
    `${input.openAlerts} open alert${input.openAlerts === 1 ? "" : "s"} and ${input.pendingRenewals} pending renewal case${input.pendingRenewals === 1 ? "" : "s"}.`,
    hotspot ? `${hotspot.location} leads hotspot activity with ${hotspot.invalid} invalid of ${hotspot.total} scans.` : "No hotspot concentration detected yet.",
    input.expiringCount ? `${input.expiringCount} permit${input.expiringCount === 1 ? "" : "s"} expire within 30 days.` : "No 30-day expiry pressure detected.",
  ].slice(0, 4);

  const topActions = [
    input.openAlerts ? "Clear high-priority fraud alerts before routine casework." : "Maintain live alert monitoring.",
    hotspot && hotspot.invalid > 0 ? `Brief officers at ${hotspot.location} on invalid-scan handling.` : "Keep checkpoint verification coverage steady.",
    input.pendingRenewals ? "Review pending renewals with expired or high-risk status first." : "No urgent renewal backlog action required.",
    input.expiringCount ? "Notify holders with permits expiring within 30 days." : "Continue normal permit lifecycle monitoring.",
  ];

  return {
    riskLevel,
    headline:
      activeWork > 0
        ? `${riskLevel === "low" ? "Stable" : riskLevel === "medium" ? "Elevated" : riskLevel === "high" ? "High" : "Critical"} operational posture`
        : "Stable operational posture",
    summary: `DigiPermit AI reviewed ${input.totalPermits} permits, today's scan flow, open alerts, renewal load, and hotspot activity to produce this shift briefing.`,
    trends,
    topActions,
  };
}

export function reviewDigiPermitRenewal(input: {
  permitNumber: string;
  permitType: string | null;
  currentStatus: string | null;
  currentExpiry: string | null;
  holderName: string;
  comments: string;
  priorRenewals: number;
  openAlertsForBarcode: number;
  recentInvalidScans: number;
}): DigiPermitRenewalReview {
  let score = 10;
  const riskFactors: string[] = [];

  if (!input.currentStatus) {
    score += 30;
    riskFactors.push("Current permit record could not be confirmed.");
  } else if (input.currentStatus === "revoked") {
    score += 70;
    riskFactors.push("Current permit status is revoked.");
  } else if (input.currentStatus === "expired") {
    score += 25;
    riskFactors.push("Current permit status is expired.");
  }

  if (input.currentExpiry) {
    const daysToExpiry = Math.ceil((new Date(input.currentExpiry).getTime() - Date.now()) / 86400000);
    if (daysToExpiry < 0) {
      score += 18;
      riskFactors.push(`Permit expired ${Math.abs(daysToExpiry)} day${Math.abs(daysToExpiry) === 1 ? "" : "s"} ago.`);
    } else if (daysToExpiry <= 30) {
      riskFactors.push(`Permit expires in ${daysToExpiry} day${daysToExpiry === 1 ? "" : "s"}.`);
    }
  }

  if (!input.comments.trim()) {
    score += 10;
    riskFactors.push("Holder did not provide supporting comments.");
  }
  if (input.openAlertsForBarcode > 0) {
    score += input.openAlertsForBarcode * 25;
    riskFactors.push(`${input.openAlertsForBarcode} open alert${input.openAlertsForBarcode === 1 ? "" : "s"} linked to this barcode.`);
  }
  if (input.recentInvalidScans > 0) {
    score += input.recentInvalidScans * 12;
    riskFactors.push(`${input.recentInvalidScans} recent invalid scan${input.recentInvalidScans === 1 ? "" : "s"} linked to this permit.`);
  }
  if (input.priorRenewals >= 3) {
    score += 10;
    riskFactors.push(`${input.priorRenewals} prior holder replies/renewal interactions require review.`);
  }

  const finalScore = Math.min(100, score);
  const recommendation: DigiPermitRenewalReview["recommendation"] =
    finalScore >= 70 ? "reject" : finalScore >= 35 ? "request_more_info" : "approve";
  const confidence = finalScore <= 20 || finalScore >= 75 ? "high" : finalScore >= 30 && finalScore <= 45 ? "medium" : "medium";
  const factors = riskFactors.length ? riskFactors : ["No supplied alert, invalid-scan, or status risk factors were detected."];

  return {
    recommendation,
    confidence,
    reasoning: `DigiPermit AI reviewed renewal ${input.permitNumber} for ${input.holderName} using current status, expiry timing, holder comments, alert counts, and invalid-scan history.`,
    riskFactors: factors.slice(0, 5),
    suggestedExpiryMonths: recommendation === "approve" ? (input.permitType === "permanent_residence" ? 60 : 24) : null,
  };
}