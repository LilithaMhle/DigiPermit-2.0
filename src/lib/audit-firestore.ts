import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "./firebase";

export interface AuditEvent {
  actorId: string;
  actorEmail?: string;
  action: string;
  targetId?: string;
  targetType?: string;
  details?: string;
  createdAt?: unknown;
}

export async function logAuditEvent(event: AuditEvent) {
  await addDoc(collection(firebaseDb(), "audit_logs"), {
    ...event,
    createdAt: serverTimestamp(),
  });
}
