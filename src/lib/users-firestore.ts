import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { deleteApp } from "firebase/app";
import { firebaseDb, firebaseTempAuth, firebaseTempDb } from "./firebase";
import { logAuditEvent } from "./audit-firestore";

const COLLECTION = "users";

export interface AppUserProfile {
  id: string;
  email?: string | null;
  fullName?: string | null;
  role?: string | null;
  suspended?: boolean;
  permitNumber?: string | null;
  contactPhone?: string | null;
  createdAt?: any;
}

export async function createUserInBackground(input: {
  fullName: string;
  email: string;
  password: string;
  role: string;
  createdBy?: { id: string; email?: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await firebaseTempAuth();
    const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await updateProfile(cred.user, { displayName: input.fullName });
    const profile = {
      id: cred.user.uid,
      email: cred.user.email ?? input.email,
      fullName: input.fullName,
      role: input.role,
      suspended: false,
      createdAt: serverTimestamp(),
    };
    // Persist the user profile using the main Firebase app so the current signed-in
    // admin user can write the document under Firestore rules.
    await setDoc(doc(firebaseDb(), COLLECTION, cred.user.uid), profile);
    await logAuditEvent({
      actorId: input.createdBy?.id ?? "system",
      actorEmail: input.createdBy?.email,
      action: "user_created",
      targetId: cred.user.uid,
      targetType: "user",
      details: JSON.stringify({ email: input.email, role: input.role }),
    });
    await signOut(auth);
    await deleteApp(auth.app);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message || "Unable to create user." };
  }
}

export async function createUsersFromCsv(fileContents: string, createdBy?: { id: string; email?: string }): Promise<{ ok: boolean; created: number; errors: string[] }> {
  const lines = fileContents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headers = lines[0]?.split(",").map((h) => h.trim().toLowerCase());
  const emailIndex = headers?.indexOf("email");
  const fullNameIndex = headers?.indexOf("fullname");
  const roleIndex = headers?.indexOf("role");
  const passwordIndex = headers?.indexOf("password");

  const errors: string[] = [];
  let created = 0;
  if (emailIndex < 0 || fullNameIndex < 0 || roleIndex < 0 || passwordIndex < 0) {
    return { ok: false, created: 0, errors: ["CSV must include email, fullName, role, and password columns."] };
  }

  for (let i = 1; i < lines.length; i += 1) {
    const row = lines[i].split(",").map((cell) => cell.trim());
    if (!row[emailIndex] || !row[fullNameIndex] || !row[roleIndex] || !row[passwordIndex]) {
      errors.push(`Row ${i + 1} is missing required columns.`);
      continue;
    }
    const r = await createUserInBackground({
      fullName: row[fullNameIndex],
      email: row[emailIndex],
      password: row[passwordIndex],
      role: row[roleIndex],
      createdBy,
    });
    if (!r.ok) {
      errors.push(`Row ${i + 1}: ${r.error}`);
    } else {
      created += 1;
    }
  }
  return { ok: true, created, errors };
}

export async function listUsersFirestore(): Promise<AppUserProfile[]> {
  const q = query(collection(firebaseDb(), COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function setUserRoleFirestore(userId: string, role: string): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, userId);
  await updateDoc(ref, { role });
}

export async function deleteUserFirestore(userId: string): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, userId);
  await deleteDoc(ref);
}

export async function suspendUserFirestore(userId: string, suspended: boolean): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, userId);
  await updateDoc(ref, { suspended });
}

export async function updateUserProfile(userId: string, patch: Partial<Omit<AppUserProfile, "id">>): Promise<void> {
  const ref = doc(firebaseDb(), COLLECTION, userId);
  await updateDoc(ref, patch);
}
