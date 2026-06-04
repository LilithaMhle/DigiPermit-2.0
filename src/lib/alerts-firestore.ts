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
  updateDoc,
  where,
  doc,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";

export type AlertType = "repeated_expired" | "location_anomaly" | "burst_invalid";

export interface AIAlert {
  id: string;
  type: AlertType;
  description: string;
  barcode: string;
  locationLabel: string;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Timestamp | null;
  timestamp: Timestamp | null;
}

const ALERTS = "alerts";

export async function createAlert(input: {
  type: AlertType;
  description: string;
  barcode: string;
  locationLabel: string;
}): Promise<void> {
  await addDoc(collection(firebaseDb(), ALERTS), {
    ...input,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    timestamp: serverTimestamp(),
  });
}

/**
 * Check whether an open (unresolved) alert already exists for this type
 * and either barcode or locationLabel (whichever the caller passes as `key`).
 */
export async function hasOpenAlert(type: AlertType, key: string): Promise<boolean> {
  // Try barcode match first
  const byBarcode = query(
    collection(firebaseDb(), ALERTS),
    where("type", "==", type),
    where("barcode", "==", key),
    where("resolved", "==", false),
    limit(1),
  );
  const a = await getDocs(byBarcode);
  if (!a.empty) return true;

  const byLocation = query(
    collection(firebaseDb(), ALERTS),
    where("type", "==", type),
    where("locationLabel", "==", key),
    where("resolved", "==", false),
    limit(1),
  );
  const b = await getDocs(byLocation);
  return !b.empty;
}

export async function resolveAlert(id: string, resolvedBy: string): Promise<void> {
  await updateDoc(doc(firebaseDb(), ALERTS, id), {
    resolved: true,
    resolvedBy,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToAlerts(cb: (alerts: AIAlert[]) => void, max = 200): () => void {
  const q = query(collection(firebaseDb(), ALERTS), orderBy("timestamp", "desc"), limit(max));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AIAlert, "id">) })));
  });
}

export async function listAlerts(max = 200): Promise<AIAlert[]> {
  const q = query(collection(firebaseDb(), ALERTS), orderBy("timestamp", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AIAlert, "id">) }));
}