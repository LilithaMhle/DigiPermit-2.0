import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";
import { computedStatus, type PermitRecord } from "./permits-firestore";
import { createAlert, hasOpenAlert } from "./alerts-firestore";

export type VerificationResult = "valid" | "expired" | "revoked" | "not_found";

export interface ScanEvent {
  id: string;
  barcode: string;
  permitId: string | null;
  permitNumber: string | null;
  holderName: string | null;
  officerUid: string;
  officerName: string;
  timestamp: Timestamp | null;
  lat: number;
  lng: number;
  locationLabel: string;
  result: VerificationResult;
}

export interface Checkpoint {
  label: string;
  lat: number;
  lng: number;
}

export const CHECKPOINTS: Checkpoint[] = [
  { label: "OR Tambo International Airport", lat: -26.139, lng: 28.246 },
  { label: "Cape Town International Airport", lat: -33.969, lng: 18.597 },
  { label: "King Shaka International Airport", lat: -29.612, lng: 31.119 },
  { label: "Beitbridge Border Post", lat: -22.216, lng: 29.991 },
  { label: "Lebombo Border Post", lat: -25.441, lng: 31.987 },
  { label: "Maseru Bridge Border Post", lat: -29.310, lng: 27.553 },
  { label: "Oshoek Border Post", lat: -26.183, lng: 30.999 },
  { label: "Durban Harbour", lat: -29.867, lng: 31.025 },
  { label: "Cape Town Harbour", lat: -33.905, lng: 18.430 },
  { label: "Pretoria DHA Checkpoint", lat: -25.747, lng: 28.229 },
];

const SCANS = "scans";

function jitter(v: number) {
  return v + (Math.random() - 0.5) * 0.01;
}

async function findPermitByBarcode(barcode: string): Promise<PermitRecord | null> {
  const q = query(
    collection(firebaseDb(), "permits"),
    where("barcode", "==", barcode),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...(d.data() as Omit<PermitRecord, "id">) };
}

export async function verifyAndLogScan(input: {
  barcode: string;
  checkpoint: Checkpoint;
  officer: { uid: string; name: string };
}): Promise<{ result: VerificationResult; permit: PermitRecord | null; scanId: string }> {
  const barcode = input.barcode.trim().toUpperCase();
  const permit = await findPermitByBarcode(barcode);

  let result: VerificationResult = "not_found";
  if (permit) {
    const s = computedStatus(permit);
    result = s === "valid" ? "valid" : s === "expired" ? "expired" : "revoked";
  }

  const docRef = await addDoc(collection(firebaseDb(), SCANS), {
    barcode,
    permitId: permit?.id ?? null,
    permitNumber: permit?.permitNumber ?? null,
    holderName: permit ? `${permit.givenNames} ${permit.surname}` : null,
    officerUid: input.officer.uid,
    officerName: input.officer.name,
    timestamp: serverTimestamp(),
    lat: jitter(input.checkpoint.lat),
    lng: jitter(input.checkpoint.lng),
    locationLabel: input.checkpoint.label,
    result,
  });

  // Fire-and-forget AI detection
  void runAiDetection({ barcode, result, checkpoint: input.checkpoint, permit });

  return { result, permit, scanId: docRef.id };
}

async function runAiDetection(opts: {
  barcode: string;
  result: VerificationResult;
  checkpoint: Checkpoint;
  permit: PermitRecord | null;
}) {
  try {
    const oneHourAgo = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000);

    // Rule 1: repeated expired/revoked scans of same barcode in 1h
    if (opts.result === "expired" || opts.result === "revoked") {
      const q1 = query(
        collection(firebaseDb(), SCANS),
        where("barcode", "==", opts.barcode),
        where("timestamp", ">=", oneHourAgo),
      );
      const s1 = await getDocs(q1);
      const matching = s1.docs.filter((d) => {
        const r = d.data().result as VerificationResult;
        return r === "expired" || r === "revoked";
      });
      if (matching.length >= 2 && !(await hasOpenAlert("repeated_expired", opts.barcode))) {
        await createAlert({
          type: "repeated_expired",
          description: `Permit ${opts.barcode} scanned ${matching.length} times while ${opts.result} in the last hour.`,
          barcode: opts.barcode,
          locationLabel: opts.checkpoint.label,
        });
      }
    }

    // Rule 2: burst of not_found scans at the same checkpoint in 1h
    if (opts.result === "not_found") {
      const q2 = query(
        collection(firebaseDb(), SCANS),
        where("locationLabel", "==", opts.checkpoint.label),
        where("result", "==", "not_found"),
        where("timestamp", ">=", oneHourAgo),
      );
      const s2 = await getDocs(q2);
      if (s2.size >= 3 && !(await hasOpenAlert("burst_invalid", opts.checkpoint.label))) {
        await createAlert({
          type: "burst_invalid",
          description: `${s2.size} unregistered barcodes scanned at ${opts.checkpoint.label} in the last hour.`,
          barcode: "—",
          locationLabel: opts.checkpoint.label,
        });
      }
    }

    // Rule 3: same permit scanned at 3+ distinct checkpoints in 1h
    if (opts.permit) {
      const q3 = query(
        collection(firebaseDb(), SCANS),
        where("barcode", "==", opts.barcode),
        where("timestamp", ">=", oneHourAgo),
      );
      const s3 = await getDocs(q3);
      const locations = new Set(s3.docs.map((d) => d.data().locationLabel as string));
      if (locations.size >= 3 && !(await hasOpenAlert("location_anomaly", opts.barcode))) {
        await createAlert({
          type: "location_anomaly",
          description: `Permit ${opts.barcode} scanned at ${locations.size} different checkpoints in the last hour.`,
          barcode: opts.barcode,
          locationLabel: opts.checkpoint.label,
        });
      }
    }
  } catch (err) {
    console.warn("AI detection failed", err);
  }
}

export function subscribeToScans(
  cb: (scans: ScanEvent[]) => void,
  max = 200,
  officerUid?: string,
): () => void {
  // If an officerUid is provided, restrict the real-time feed to that officer's scans.
  const base = collection(firebaseDb(), SCANS);
  const q = officerUid
    ? query(base, where("officerUid", "==", officerUid), orderBy("timestamp", "desc"), limit(max))
    : query(base, orderBy("timestamp", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScanEvent, "id">) })));
  });
}

export async function listScans(max = 200): Promise<ScanEvent[]> {
  const q = query(collection(firebaseDb(), SCANS), orderBy("timestamp", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScanEvent, "id">) }));
}