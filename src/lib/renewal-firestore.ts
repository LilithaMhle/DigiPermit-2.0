import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  arrayUnion,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";

export type RenewalStatus = "submitted" | "under_review" | "approved" | "rejected" | "info_required";

export interface RenewalAttachment {
  name: string;
  type: string;
  data: string;
}

export interface RenewalRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  permitNumber: string;
  permitId?: string;
  status: RenewalStatus;
  submittedAt: any;
  updatedAt?: any;
  comments?: string;
  adminComment?: string;
  attachments?: RenewalAttachment[];
  responses?: { from: string; message: string; at: any }[];
}

const COLLECTION = "renewal_requests";

export async function createRenewalRequest(payload: {
  userId: string;
  userEmail: string;
  userName: string;
  permitNumber: string;
  permitId?: string;
  comments?: string;
  attachments?: RenewalAttachment[];
}): Promise<void> {
  const ref = collection(firebaseDb(), COLLECTION);
  await addDoc(ref, {
    userId: payload.userId,
    userEmail: payload.userEmail,
    userName: payload.userName,
    permitNumber: payload.permitNumber,
    ...(payload.permitId !== undefined ? { permitId: payload.permitId } : {}),
    comments: payload.comments,
    ...(payload.attachments !== undefined ? { attachments: payload.attachments } : {}),
    status: "submitted",
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function listRenewalRequests(): Promise<RenewalRequest[]> {
  const q = query(collection(firebaseDb(), COLLECTION), orderBy("submittedAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
}

export async function listUserRenewalRequests(userId: string): Promise<RenewalRequest[]> {
  const q = query(
    collection(firebaseDb(), COLLECTION),
    where("userId", "==", userId),
    orderBy("submittedAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
}

export async function updateRenewalRequestStatus(requestId: string, status: RenewalStatus, adminComment?: string): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, requestId);
  await updateDoc(ref, {
    status,
    ...(adminComment !== undefined ? { adminComment } : {}),
    updatedAt: serverTimestamp(),
  });
}

export async function addRenewalResponse(requestId: string, responderId: string, message: string): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, requestId);
  await updateDoc(ref, {
    responses: arrayUnion({ from: responderId, message, at: new Date().toISOString() }),
    status: "under_review",
    updatedAt: serverTimestamp(),
  });
}

export async function getRenewalRequest(requestId: string): Promise<RenewalRequest | null> {
  const ref = doc(firebaseDb(), COLLECTION, requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as any) };
}
