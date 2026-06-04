import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from "firebase/firestore";
import { firebaseDb } from "./firebase";

export type PermitType =
  | "visitor_visa"
  | "study_visa"
  | "general_work"
  | "critical_skills"
  | "intra_company_transfer"
  | "business_visa"
  | "relatives_visa"
  | "retired_person"
  | "permanent_residence";

export type PermitStatus = "valid" | "expired" | "revoked";
export type Gender = "male" | "female" | "other";

export interface PermitRecord {
  id: string;
  barcode: string;
  permitNumber: string;
  // Holder
  surname: string;
  givenNames: string;
  passport: string;
  nationality: string;
  dateOfBirth: string; // yyyy-mm-dd
  gender: Gender;
  // Permit
  permitType: PermitType;
  issueDate: string;
  expiryDate: string;
  portOfIssue: string;
  employer?: string;
  occupation?: string;
  institution?: string;
  conditions?: string;
  status: PermitStatus;
  issuedBy: string; // user email or name
  issuedByUid: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type NewPermitInput = Omit<
  PermitRecord,
  "id" | "barcode" | "permitNumber" | "status" | "issuedBy" | "issuedByUid" | "createdAt" | "updatedAt"
>;

const COLLECTION = "permits";

function rand(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export function generateBarcode(): string {
  return "ZA" + rand(9);
}

export function generatePermitNumber(type: PermitType): string {
  const prefix: Record<PermitType, string> = {
    visitor_visa: "VV",
    study_visa: "SV",
    general_work: "GW",
    critical_skills: "CS",
    intra_company_transfer: "ICT",
    business_visa: "BV",
    relatives_visa: "RV",
    retired_person: "RP",
    permanent_residence: "PR",
  };
  const year = new Date().getFullYear();
  return `${prefix[type]}-${year}-${rand(6)}`;
}

export const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
  visitor_visa: "Visitor's visa",
  study_visa: "Study visa",
  general_work: "General work visa",
  critical_skills: "Critical skills work visa",
  intra_company_transfer: "Intra-company transfer visa",
  business_visa: "Business visa",
  relatives_visa: "Relative's visa",
  retired_person: "Retired person's visa",
  permanent_residence: "Permanent residence permit",
};

export const SA_PORTS_OF_ENTRY = [
  "OR Tambo International Airport",
  "Cape Town International Airport",
  "King Shaka International Airport",
  "Lanseria International Airport",
  "Beitbridge Border Post",
  "Lebombo Border Post",
  "Maseru Bridge Border Post",
  "Oshoek Border Post",
  "Kopfontein Border Post",
  "Ficksburg Border Post",
  "Durban Harbour",
  "Cape Town Harbour",
  "DHA Office — Pretoria",
  "DHA Office — Johannesburg",
  "DHA Office — Cape Town",
  "DHA Office — Durban",
];

export async function listPermits(): Promise<PermitRecord[]> {
  const q = query(collection(firebaseDb(), COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PermitRecord, "id">) }));
}

export async function getPermitByNumber(permitNumber: string): Promise<PermitRecord | null> {
  const q = query(collection(firebaseDb(), COLLECTION), where("permitNumber", "==", permitNumber.trim()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<PermitRecord, "id">) };
}

export async function listExpiringPermits(daysAhead = 30): Promise<PermitRecord[]> {
  const all = await listPermits();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + daysAhead);
  return all.filter((p) => {
    const exp = new Date(p.expiryDate);
    return exp >= new Date() && exp <= cutoff;
  });
}

export async function getPermit(id: string): Promise<PermitRecord | null> {
  const ref = doc(firebaseDb(), COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<PermitRecord, "id">) };
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): {
  [K in keyof T as T[K] extends undefined ? never : K]: T[K]
} {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as any;
}

export async function createPermit(
  input: NewPermitInput,
  issuer: { uid: string; name: string },
): Promise<PermitRecord> {
  const barcode = generateBarcode();
  const permitNumber = generatePermitNumber(input.permitType);

  // Firestore rejects explicit `undefined` values.
  const payload = omitUndefined({
    ...input,
    barcode,
    permitNumber,
    status: "valid" as PermitStatus,
    issuedBy: issuer.name,
    issuedByUid: issuer.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ref = await addDoc(collection(firebaseDb(), COLLECTION), payload);
  return { id: ref.id, ...(payload as unknown as Omit<PermitRecord, "id">) };
}

export async function updatePermit(id: string, patch: Partial<PermitRecord>): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, id);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function deletePermit(id: string): Promise<void> {
  await deleteDoc(doc(firebaseDb(), COLLECTION, id));
}

export function computedStatus(p: PermitRecord): PermitStatus {
  if (p.status === "revoked") return "revoked";
  if (new Date(p.expiryDate) < new Date()) return "expired";
  return "valid";
}
