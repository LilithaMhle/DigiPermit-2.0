import { create } from "zustand";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User as FbUser,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "./firebase";

export type Role = "admin" | "officer" | "permit_holder";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permitNumber?: string;
  contactPhone?: string;
}

interface AuthState {
  user: AppUser | null;
  initialized: boolean;
  initPromise: Promise<void> | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  register: (input: { fullName: string; email: string; password: string; role: Role }) =>
    Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Incorrect email or password.";
    case "auth/email-already-in-use": return "That email is already registered.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/network-request-failed": return "Network error — check your connection.";
    default: return (err as Error)?.message ?? "Something went wrong.";
  }
}

async function loadAppUser(fb: FbUser): Promise<AppUser> {
  const ref = doc(firebaseDb(), "users", fb.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data() as { fullName?: string; role?: Role; email?: string; suspended?: boolean; permitNumber?: string; contactPhone?: string };
    if (d.suspended) {
      throw new Error("Your account has been suspended. Contact an administrator.");
    }
    return {
      id: fb.uid,
      email: fb.email ?? d.email ?? "",
      fullName: d.fullName ?? fb.displayName ?? fb.email ?? "User",
      role: (d.role as Role) ?? "officer",
      permitNumber: d.permitNumber,
      contactPhone: d.contactPhone,
    };
  }
  // Fallback profile for accounts created outside the app
  const fallback: AppUser = {
    id: fb.uid,
    email: fb.email ?? "",
    fullName: fb.displayName ?? fb.email ?? "User",
    role: "officer",
  };
  await setDoc(ref, { ...fallback, createdAt: serverTimestamp() });
  return fallback;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,
  initPromise: null,
  init: () => {
    if (typeof window === "undefined") return Promise.resolve();
    const existing = get().initPromise;
    if (existing) return existing;
    const p = new Promise<void>((resolve) => {
      onAuthStateChanged(firebaseAuth(), async (fb) => {
        if (fb) {
          try {
            const u = await loadAppUser(fb);
            set({ user: u, initialized: true });
          } catch {
            set({ user: null, initialized: true });
          }
        } else {
          set({ user: null, initialized: true });
        }
        resolve();
      });
    });
    set({ initPromise: p });
    return p;
  },
  login: async (email, password) => {
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      const u = await loadAppUser(cred.user);
      set({ user: u });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  },
  register: async ({ fullName, email, password, role }) => {
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      await updateProfile(cred.user, { displayName: fullName });
      const profile: AppUser = { id: cred.user.uid, email: cred.user.email ?? email, fullName, role };
      await setDoc(doc(firebaseDb(), "users", cred.user.uid), {
        ...profile,
        createdAt: serverTimestamp(),
      });
      set({ user: profile });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: friendly(err) };
    }
  },
  logout: async () => {
    await signOut(firebaseAuth());
    set({ user: null });
  },
}));

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}

/** Pages that require admin role. All other authenticated routes are open. */
export const ADMIN_ONLY_PATHS = ["/issue", "/permits", "/alerts", "/users", "/renewals"] as const;
export const PERMIT_HOLDER_ONLY_PATHS = ["/permit-holder"] as const;

export function canAccess(path: string, role: Role | undefined): boolean {
  if (!role) return false;
  if (ADMIN_ONLY_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return role === "admin" || role === "officer";
  }
  if (PERMIT_HOLDER_ONLY_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return role === "permit_holder";
  }
  return true;
}