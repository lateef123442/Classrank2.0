import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  StudyData, EMPTY_DATA, normalizeData, Question, QuizAttempt, Prefs, PlannedSession,
  dateStr, addDaysStr, uid,
} from "./studyTypes";
import { reviewAfterQuiz, nextCardState, Proposal } from "./studyInsights";
import { mergeCourseContent, CourseBundle } from "./studyCourseSync";

// Local-first study data (subjects, topics, notes, questions, quiz attempts, planned sessions,
// focus log, flashcards, preferences). Stored on the device so it works offline; a Supabase
// sync table can be added later without changing the screens, since they only use this module.
// Storage is scoped per signed-in user (`classrank:study:v1:<userId>`) so a shared phone never shows one student's
// data to another. The first user to sign in after upgrading adopts the old unscoped save (LEGACY_KEY), once.
// Older saves are upgraded in place by normalizeData().
const LEGACY_KEY = "classrank:study:v1";
const keyFor = (id: string) => `${LEGACY_KEY}:${id}`;
let userId: string | null = null;

// Everything derived (stats, streaks, recommendations…) lives in studyInsights and is re-exported
// here so existing imports from "studyStore" keep working.
export * from "./studyTypes";
export * from "./studyInsights";
export * from "./studyCourseSync";

let data: StudyData = EMPTY_DATA;
let loaded = false;
const listeners = new Set<() => void>();

const changeListeners = new Set<() => void>();

// Never persist before the saved copy has been read (an early write would overwrite it with an empty one),
// or without a signed-in user to own it.
function persist(next: StudyData) {
  if (loaded && userId) AsyncStorage.setItem(keyFor(userId), JSON.stringify(next)).catch(() => {});
}

/** Every student-initiated change goes through here. */
function commit(next: StudyData) {
  data = next;
  listeners.forEach((l) => l());
  persist(next);
  changeListeners.forEach((l) => l()); // tells cloud sync there is something new to back up
}

/** Replace everything with data that came from the cloud (restore / merge). Does NOT count as a local change. */
export function replaceStudyData(next: StudyData) {
  data = next;
  listeners.forEach((l) => l());
  persist(next);
}
/** Fires only for the student's own edits, not for loads or restores. */
export function subscribeStudyChanges(cb: () => void) { changeListeners.add(cb); return () => { changeListeners.delete(cb); }; }

// ── subjects ──
export function addSubject(name: string, examDate?: string) {
  const id = uid();
  commit({ ...data, subjects: [...data.subjects, { id, name: name.trim(), examDate: examDate || undefined }] });
  return id;
}
export const setSubjectExam = (id: string, examDate?: string) =>
  commit({ ...data, subjects: data.subjects.map((s) => (s.id === id ? { ...s, examDate: examDate || undefined } : s)) });
export const removeSubject = (id: string) =>
  commit({
    ...data,
    subjects: data.subjects.filter((s) => s.id !== id),
    topics: data.topics.filter((t) => t.subjectId !== id),
    notes: data.notes.filter((n) => n.subjectId !== id),
    questions: data.questions.filter((q) => q.subjectId !== id),
    attempts: data.attempts.filter((a) => a.subjectId !== id),
    cards: data.cards.filter((c) => c.subjectId !== id),
    reviews: data.reviews.filter((r) => r.subjectId !== id),
    sessions: data.sessions.filter((s) => s.subjectId !== id),
  });

// ── topics ──
export function addTopic(subjectId: string, name: string) {
  if (!name.trim()) return;
  commit({ ...data, topics: [...data.topics, { id: uid(), subjectId, name: name.trim(), stage: 0 }] });
}
export const removeTopic = (id: string) =>
  commit({
    ...data,
    topics: data.topics.filter((t) => t.id !== id),
    questions: data.questions.map((q) => (q.topicId === id ? { ...q, topicId: undefined } : q)),
    notes: data.notes.map((n) => (n.topicId === id ? { ...n, topicId: undefined } : n)),
  });
/** "I've studied this" — starts the spaced-review clock: back tomorrow, then at growing gaps. */
export const markTopicLearned = (id: string) =>
  commit({ ...data, topics: data.topics.map((t) => (t.id === id ? { ...t, stage: 0, nextReview: addDaysStr(1) } : t)) });

// ── notes ──
export const addNote = (subjectId: string, title: string, body: string, topicId?: string) =>
  commit({ ...data, notes: [{ id: uid(), subjectId, topicId, title: title.trim() || "Untitled", body: body.trim(), date: dateStr() }, ...data.notes] });
export const removeNote = (id: string) => commit({ ...data, notes: data.notes.filter((n) => n.id !== id) });

// ── questions ──
export const addQuestions = (qs: Omit<Question, "id">[]) =>
  commit({ ...data, questions: [...data.questions, ...qs.map((q) => ({ ...q, id: uid() }))] });
export const removeQuestion = (id: string) => commit({ ...data, questions: data.questions.filter((q) => q.id !== id) });

// ── quiz attempts ──
/** Saves an attempt and updates each touched topic's spaced-review schedule from how it went. */
export function recordAttempt(a: Omit<QuizAttempt, "id">): QuizAttempt {
  const saved = { ...a, id: uid() };
  const byTopic = new Map<string, { c: number; t: number }>();
  a.answers.forEach((x) => { if (x.topicId) { const g = byTopic.get(x.topicId) ?? { c: 0, t: 0 }; g.t++; if (x.correct) g.c++; byTopic.set(x.topicId, g); } });
  commit({
    ...data,
    attempts: [...data.attempts, saved],
    topics: data.topics.map((t) => {
      const g = byTopic.get(t.id);
      return g && g.t >= 2 ? { ...t, ...reviewAfterQuiz(t.stage, Math.round((g.c / g.t) * 100)) } : t;
    }),
  });
  return saved;
}

// ── planner ──
export const addSession = (subjectId: string, minutes: number, date = dateStr(), time?: string, topicId?: string) =>
  commit({ ...data, sessions: [...data.sessions, { id: uid(), subjectId, topicId, date, minutes, time, status: "planned" }] });
export const setSessionStatus = (id: string, status: PlannedSession["status"]) =>
  commit({ ...data, sessions: data.sessions.map((s) => (s.id === id ? { ...s, status } : s)) });
export const rescheduleSession = (id: string, date: string, time?: string) =>
  commit({ ...data, sessions: data.sessions.map((s) => (s.id === id ? { ...s, date, time: time ?? s.time, status: "planned" } : s)) });
export const removeSession = (id: string) => commit({ ...data, sessions: data.sessions.filter((s) => s.id !== id) });
export const applySchedule = (ps: Proposal[]) =>
  commit({ ...data, sessions: [...data.sessions, ...ps.map((p) => ({ id: uid(), subjectId: p.subjectId, topicId: p.topicId, date: p.date, minutes: p.minutes, time: p.time, status: "planned" as const }))] });

export const logFocus = (subject: string, minutes: number) =>
  minutes > 0 && commit({ ...data, focus: [...data.focus, { subject, minutes, date: dateStr() }] });

// ── teacher-run courses (Phase 3) ──
/** Builds / refreshes the student's Subject Room for a course. Idempotent; never touches their own content. */
export function importCourseBundle(b: CourseBundle) {
  const r = mergeCourseContent(data, b);
  commit(r.data);
  return { subjectId: r.subjectId, counts: r.counts };
}
/** After leaving a course: keep what's been learned, but stop linking (and reporting) to it. */
export const detachCourse = (courseId: string) =>
  commit({
    ...data,
    subjects: data.subjects.map((s) => (s.courseId === courseId ? { ...s, courseId: undefined } : s)),
    questions: data.questions.map((q) => (data.subjects.find((s) => s.id === q.subjectId)?.courseId === courseId ? { ...q, remoteId: undefined, source: "manual" as const } : q)),
    notes: data.notes.map((n) => (data.subjects.find((s) => s.id === n.subjectId)?.courseId === courseId ? { ...n, remoteId: undefined } : n)),
  });

// ── preferences ──
export const setPrefs = (p: Partial<Prefs>) => commit({ ...data, prefs: { ...data.prefs, ...p } });

// ── flashcards + spaced repetition (SM-2 style) ──
export const addCard = (subjectId: string, front: string, back: string, topicId?: string) => addCards([{ subjectId, topicId, front, back }]);
/** Bulk add (AI generation, "save missed questions"). Skips cards whose front already exists in that subject. */
export function addCards(list: { subjectId: string; topicId?: string; front: string; back: string }[]) {
  const seen = new Set(data.cards.map((c) => `${c.subjectId}|${c.front.trim().toLowerCase()}`));
  const fresh = list.filter((c) => c.front.trim() && c.back.trim() && !seen.has(`${c.subjectId}|${c.front.trim().toLowerCase()}`));
  if (fresh.length) commit({ ...data, cards: [...data.cards, ...fresh.map((c) => ({ id: uid(), subjectId: c.subjectId, topicId: c.topicId, front: c.front.trim(), back: c.back.trim(), due: dateStr(), interval: 0, ease: 2.5, reps: 0 }))] });
  return fresh.length;
}

/** Good/Easy push the card further out each time; Again/Hard bring it back sooner. */
export function rateCard(id: string, rating: 0 | 1 | 2 | 3) {
  const c = data.cards.find((x) => x.id === id);
  if (!c) return;
  const n = nextCardState(c, rating);
  commit({
    ...data,
    cards: data.cards.map((x) => (x.id === id ? { ...x, ...n, due: addDaysStr(n.interval) } : x)),
    reviews: [...data.reviews, { subjectId: c.subjectId, topicId: c.topicId, rating, date: dateStr() }],
  });
}

let loadPromise: Promise<void> | null = null;

/** Switch whose data is loaded. Call with the user id on sign-in and null on sign-out. Memory is cleared immediately. */
export function setStudyUser(id: string | null) {
  if (id === userId) return;
  userId = id;
  data = EMPTY_DATA;
  loaded = false;
  loadPromise = null;
  listeners.forEach((l) => l());
  if (id) loadStudy();
}

/** Loads the current user's saved data once (idempotent). Resolves immediately if nobody is signed in yet. */
export function loadStudy(): Promise<void> {
  const id = userId;
  if (!id) return Promise.resolve();
  if (loadPromise) return loadPromise;
  const p: Promise<void> = (async () => {
    try {
      let raw = await AsyncStorage.getItem(keyFor(id));
      if (!raw) {
        // One-time adoption of the pre-scoping save by whoever signs in first.
        const legacy = await AsyncStorage.getItem(LEGACY_KEY);
        if (legacy) { raw = legacy; await AsyncStorage.setItem(keyFor(id), legacy); await AsyncStorage.removeItem(LEGACY_KEY); }
      }
      if (id === userId && raw) data = normalizeData(JSON.parse(raw));
    } catch { /* unreadable save: start fresh rather than crash */ }
    if (id === userId) { loaded = true; listeners.forEach((l) => l()); }
  })();
  loadPromise = p;
  return p;
}

/** Deletes the signed-in user's saved study data (used when the account is deleted). */
export async function wipeStudyData() {
  const id = userId;
  setStudyUser(null);
  if (id) await AsyncStorage.removeItem(keyFor(id)).catch(() => {});
}
export const getStudyData = () => data;
export const isStudyLoaded = () => loaded;
/** Non-React subscription (used by the reminder sync so it doesn't re-render navigation on every change). */
export function subscribeStudy(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function useStudy() {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    loadStudy();
    return () => { listeners.delete(l); };
  }, []);
  return { data, ready: loaded };
}
