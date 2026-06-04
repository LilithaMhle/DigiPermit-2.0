import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PermitType = "visa" | "residence" | "work";
export type PermitStatus = "valid" | "revoked" | "expired";
export type VerificationResult = "valid" | "expired" | "revoked" | "not_found";

export interface Permit {
  id: string;
  barcode: string;
  holderName: string;
  passport: string;
  nationality: string;
  permitType: PermitType;
  issueDate: string;
  expiryDate: string;
  status: PermitStatus;
  issuedBy: string;
}

export interface ScanEvent {
  id: string;
  barcode: string;
  permitId: string | null;
  officer: string;
  timestamp: string;
  lat: number;
  lng: number;
  locationLabel: string;
  result: VerificationResult;
}

export interface AIAlert {
  id: string;
  type: "repeated_expired" | "location_anomaly" | "burst_invalid";
  description: string;
  barcode: string;
  timestamp: string;
  resolved: boolean;
}

const LOCATIONS = [
  { label: "OR Tambo Intl Airport", lat: -26.139, lng: 28.246 },
  { label: "Beitbridge Border Post", lat: -22.216, lng: 29.991 },
  { label: "Cape Town Intl Airport", lat: -33.969, lng: 18.597 },
  { label: "Lebombo Border Post", lat: -25.441, lng: 31.987 },
  { label: "Durban Harbour", lat: -29.867, lng: 31.025 },
  { label: "Pretoria CBD Checkpoint", lat: -25.747, lng: 28.229 },
];

function randomBarcode() {
  return "ZA" + Math.floor(100000000 + Math.random() * 899999999).toString();
}

function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedPermits(): Permit[] {
  return [
    {
      id: crypto.randomUUID(),
      barcode: "ZA482910337",
      holderName: "Amara Okafor",
      passport: "A04829103",
      nationality: "Nigerian",
      permitType: "work",
      issueDate: isoDaysFromNow(-200),
      expiryDate: isoDaysFromNow(160),
      status: "valid",
      issuedBy: "admin.naidoo",
    },
    {
      id: crypto.randomUUID(),
      barcode: "ZA771204556",
      holderName: "Chen Wei",
      passport: "E77120455",
      nationality: "Chinese",
      permitType: "residence",
      issueDate: isoDaysFromNow(-800),
      expiryDate: isoDaysFromNow(-30),
      status: "expired",
      issuedBy: "admin.naidoo",
    },
    {
      id: crypto.randomUUID(),
      barcode: "ZA339488112",
      holderName: "Priya Sharma",
      passport: "S33948811",
      nationality: "Indian",
      permitType: "visa",
      issueDate: isoDaysFromNow(-60),
      expiryDate: isoDaysFromNow(30),
      status: "valid",
      issuedBy: "admin.dlamini",
    },
    {
      id: crypto.randomUUID(),
      barcode: "ZA665012998",
      holderName: "João Mendes",
      passport: "P66501299",
      nationality: "Portuguese",
      permitType: "work",
      issueDate: isoDaysFromNow(-400),
      expiryDate: isoDaysFromNow(200),
      status: "revoked",
      issuedBy: "admin.naidoo",
    },
    {
      id: crypto.randomUUID(),
      barcode: "ZA101122334",
      holderName: "Sarah Mitchell",
      passport: "M10112233",
      nationality: "British",
      permitType: "residence",
      issueDate: isoDaysFromNow(-1000),
      expiryDate: isoDaysFromNow(700),
      status: "valid",
      issuedBy: "admin.dlamini",
    },
  ];
}

function seedScans(permits: Permit[]): ScanEvent[] {
  const scans: ScanEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < 48; i++) {
    const permit = permits[Math.floor(Math.random() * permits.length)];
    const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    const ts = new Date(now - Math.floor(Math.random() * 1000 * 60 * 60 * 24)).toISOString();
    let result: VerificationResult = "valid";
    if (permit.status === "expired") result = "expired";
    else if (permit.status === "revoked") result = "revoked";
    scans.push({
      id: crypto.randomUUID(),
      barcode: permit.barcode,
      permitId: permit.id,
      officer: ["off.smith", "off.zulu", "off.patel", "off.nkosi"][Math.floor(Math.random() * 4)],
      timestamp: ts,
      lat: loc.lat + (Math.random() - 0.5) * 0.05,
      lng: loc.lng + (Math.random() - 0.5) * 0.05,
      locationLabel: loc.label,
      result,
    });
  }
  // a few "not_found" rows
  for (let i = 0; i < 4; i++) {
    const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
    scans.push({
      id: crypto.randomUUID(),
      barcode: randomBarcode(),
      permitId: null,
      officer: "off.zulu",
      timestamp: new Date(now - Math.floor(Math.random() * 1000 * 60 * 60 * 12)).toISOString(),
      lat: loc.lat,
      lng: loc.lng,
      locationLabel: loc.label,
      result: "not_found",
    });
  }
  return scans.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function seedAlerts(scans: ScanEvent[]): AIAlert[] {
  const expired = scans.filter((s) => s.result === "expired");
  const alerts: AIAlert[] = [];
  if (expired.length) {
    alerts.push({
      id: crypto.randomUUID(),
      type: "repeated_expired",
      description: `Permit ${expired[0].barcode} scanned ${expired.length} times while expired in the last 24h.`,
      barcode: expired[0].barcode,
      timestamp: new Date().toISOString(),
      resolved: false,
    });
  }
  alerts.push({
    id: crypto.randomUUID(),
    type: "burst_invalid",
    description: "Unusual spike of 4 unregistered barcodes scanned at Beitbridge Border Post.",
    barcode: "—",
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    resolved: false,
  });
  return alerts;
}

interface State {
  permits: Permit[];
  scans: ScanEvent[];
  alerts: AIAlert[];
  initialized: boolean;
  seed: () => void;
  addPermit: (p: Omit<Permit, "id" | "barcode" | "status" | "issuedBy"> & { status?: PermitStatus }) => Permit;
  updatePermitStatus: (id: string, status: PermitStatus) => void;
  extendPermit: (id: string, newExpiry: string) => void;
  deletePermit: (id: string) => void;
  verifyBarcode: (barcode: string, officer?: string) => { result: VerificationResult; permit: Permit | null; scan: ScanEvent };
  resolveAlert: (id: string) => void;
}

export const usePermitStore = create<State>()(
  persist(
    (set, get) => ({
      permits: [],
      scans: [],
      alerts: [],
      initialized: false,
      seed: () => {
        if (get().initialized) return;
        const permits = seedPermits();
        const scans = seedScans(permits);
        const alerts = seedAlerts(scans);
        set({ permits, scans, alerts, initialized: true });
      },
      addPermit: (p) => {
        const permit: Permit = {
          id: crypto.randomUUID(),
          barcode: randomBarcode(),
          status: p.status ?? "valid",
          issuedBy: "admin.current",
          ...p,
        };
        set({ permits: [permit, ...get().permits] });
        return permit;
      },
      updatePermitStatus: (id, status) =>
        set({ permits: get().permits.map((p) => (p.id === id ? { ...p, status } : p)) }),
      extendPermit: (id, newExpiry) =>
        set({
          permits: get().permits.map((p) =>
            p.id === id ? { ...p, expiryDate: newExpiry, status: "valid" } : p,
          ),
        }),
      deletePermit: (id) => set({ permits: get().permits.filter((p) => p.id !== id) }),
      verifyBarcode: (barcode, officer = "off.current") => {
        const permit = get().permits.find((p) => p.barcode === barcode.trim()) ?? null;
        let result: VerificationResult = "not_found";
        if (permit) {
          if (permit.status === "revoked") result = "revoked";
          else if (new Date(permit.expiryDate) < new Date()) result = "expired";
          else result = "valid";
        }
        const loc = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
        const scan: ScanEvent = {
          id: crypto.randomUUID(),
          barcode,
          permitId: permit?.id ?? null,
          officer,
          timestamp: new Date().toISOString(),
          lat: loc.lat,
          lng: loc.lng,
          locationLabel: loc.label,
          result,
        };
        const scans = [scan, ...get().scans];
        // simple AI rule: 2+ expired scans of same permit in last hour
        const alerts = [...get().alerts];
        if (result === "expired") {
          const recent = scans.filter(
            (s) =>
              s.barcode === barcode &&
              s.result === "expired" &&
              Date.now() - new Date(s.timestamp).getTime() < 60 * 60 * 1000,
          );
          if (recent.length >= 2 && !alerts.some((a) => a.barcode === barcode && !a.resolved && a.type === "repeated_expired")) {
            alerts.unshift({
              id: crypto.randomUUID(),
              type: "repeated_expired",
              description: `Permit ${barcode} scanned ${recent.length} times while expired in the last hour.`,
              barcode,
              timestamp: new Date().toISOString(),
              resolved: false,
            });
          }
        }
        set({ scans, alerts });
        return { result, permit, scan };
      },
      resolveAlert: (id) =>
        set({ alerts: get().alerts.map((a) => (a.id === id ? { ...a, resolved: true } : a)) }),
    }),
    { name: "permit-store" },
  ),
);

export { LOCATIONS };