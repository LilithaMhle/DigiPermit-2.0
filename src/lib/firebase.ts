import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;

export function firebaseApp(): FirebaseApp {
  if (!_app) {
    _app = getApps()[0] ?? initializeApp(firebaseConfig);
  }
  return _app;
}

export function firebaseAuth(): Auth {
  if (!_auth) _auth = getAuth(firebaseApp());
  return _auth;
}

export function firebaseDb(): Firestore {
  if (!_db) _db = getFirestore(firebaseApp());
  return _db;
}

export function firebaseConfigObject() {
  return firebaseConfig;
}

export function createTempApp(name = `temp-${Date.now()}`): FirebaseApp {
  return initializeApp(firebaseConfig, name);
}

export async function firebaseTempAuth(): Promise<Auth> {
  const app = createTempApp();
  const auth = getAuth(app);
  await setPersistence(auth, inMemoryPersistence);
  return auth;
}

export function firebaseTempDb(app: FirebaseApp) {
  return getFirestore(app);
}
