import type { PermitRecord } from "./permits-firestore";

export type VerificationQuestionKey = "passport" | "dateOfBirth" | "surname" | "nationality" | "issueDate";

export interface VerificationQuestion {
  key: VerificationQuestionKey;
  label: string;
  hint?: string;
  type: "text" | "date";
  expected: string; // normalized expected answer
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const ALL_KEYS: VerificationQuestionKey[] = ["passport", "dateOfBirth", "surname", "nationality", "issueDate"];

function buildQuestion(k: VerificationQuestionKey, p: PermitRecord): VerificationQuestion {
  switch (k) {
    case "passport":
      return { key: k, label: "Passport number", hint: "As shown on your passport", type: "text", expected: norm(p.passport) };
    case "dateOfBirth":
      return { key: k, label: "Date of birth", type: "date", expected: p.dateOfBirth };
    case "surname":
      return { key: k, label: "Surname", hint: "Family name on the permit", type: "text", expected: norm(p.surname) };
    case "nationality":
      return { key: k, label: "Nationality", type: "text", expected: norm(p.nationality) };
    case "issueDate":
      return { key: k, label: "Permit issue date", type: "date", expected: p.issueDate };
  }
}

/** Pick N random distinct verification questions from the permit. */
export function pickVerificationQuestions(p: PermitRecord, n = 3): VerificationQuestion[] {
  const shuffled = [...ALL_KEYS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n).map((k) => buildQuestion(k, p));
}

export function checkAnswer(q: VerificationQuestion, answer: string): boolean {
  if (q.type === "date") return (answer ?? "").trim() === q.expected;
  return norm(answer ?? "") === q.expected;
}

// ============= Attempt tracking & lockout (per permit number) =============

export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptState {
  count: number;
  lockedUntil?: number;
}

const KEY = "spvms.verifyAttempts";

function loadAll(): Record<string, AttemptState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveAll(all: Record<string, AttemptState>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

function keyFor(permitNumber: string, userId?: string): string {
  return `${userId ?? "anon"}::${permitNumber.toUpperCase()}`;
}

export function getLockState(permitNumber: string, userId?: string): { locked: boolean; remainingMs: number; attemptsUsed: number } {
  const all = loadAll();
  const s = all[keyFor(permitNumber, userId)] ?? { count: 0 };
  const now = Date.now();
  if (s.lockedUntil && s.lockedUntil > now) {
    return { locked: true, remainingMs: s.lockedUntil - now, attemptsUsed: s.count };
  }
  if (s.lockedUntil && s.lockedUntil <= now) {
    // expired lock — reset
    delete all[keyFor(permitNumber, userId)];
    saveAll(all);
    return { locked: false, remainingMs: 0, attemptsUsed: 0 };
  }
  return { locked: false, remainingMs: 0, attemptsUsed: s.count };
}

export function recordFailure(permitNumber: string, userId?: string): { locked: boolean; attemptsUsed: number; remaining: number } {
  const all = loadAll();
  const k = keyFor(permitNumber, userId);
  const cur = all[k] ?? { count: 0 };
  cur.count += 1;
  if (cur.count >= MAX_ATTEMPTS) {
    cur.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  all[k] = cur;
  saveAll(all);
  return { locked: !!cur.lockedUntil, attemptsUsed: cur.count, remaining: Math.max(0, MAX_ATTEMPTS - cur.count) };
}

export function recordSuccess(permitNumber: string, userId?: string): void {
  const all = loadAll();
  delete all[keyFor(permitNumber, userId)];
  saveAll(all);
}

export function formatLockRemaining(ms: number): string {
  const m = Math.ceil(ms / 60000);
  return `${m} minute${m === 1 ? "" : "s"}`;
}