import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, inMemoryPersistence, setPersistence } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyACzn-tW7pSWc9f3njRLh7N7diCPjob1g8",
  authDomain: "permitverification.firebaseapp.com",
  projectId: "permitverification",
  storageBucket: "permitverification.firebasestorage.app",
  messagingSenderId: "871777658026",
  appId: "1:871777658026:web:fb51d5dbbd2afb07d5dcd3",
  measurementId: "G-39DJGD7SHJ",
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
