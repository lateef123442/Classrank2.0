// Shared types + date helpers for the local-first study data.
// Kept dependency-free so the insight logic can be unit-tested without React Native.

export interface Subject { id: string; name: string; examDate?: string; /** Set when this subject mirrors a teacher-run course. */ courseId?: string } // examDate: YYYY-MM-DD
export interface Topic {
  id: string; subjectId: string; name: string;
  /** Spaced-review stage: index into REVIEW_INTERVALS. */
  stage: number;
  /** Next date (YYYY-MM-DD) this topic should be reviewed; unset until first quiz or "mark learned". */
  nextReview?: string;
}
export interface Note { id: string; remoteId?: string; subjectId: string; topicId?: string; title: string; body: string; date: string; /** Storage path of the teacher's uploaded file this note stands for (course files only). */ filePath?: string }
export interface Question {
  id: string; remoteId?: string; subjectId: string; topicId?: string;
  q: string; options: string[]; correct: number; explanation: string;
  source: "manual" | "ai" | "course";
}
export type QuizMode = "quick" | "topic" | "subject" | "mock" | "daily" | "review";
export interface AnswerRecord { qid: string; subjectId: string; topicId?: string; picked: number | null; correct: boolean }
export interface QuizAttempt {
  id: string; mode: QuizMode; subjectId?: string; topicId?: string;
  date: string; seconds: number; total: number; correct: number; answers: AnswerRecord[];
}
export interface PlannedSession {
  id: string; subjectId: string; topicId?: string; date: string; minutes: number;
  status: "planned" | "done" | "skipped";
  /** Optional start time "HH:MM" (used for reminders). */
  time?: string;
}
export interface FocusLog { subject: string; minutes: number; date: string }
export interface Card { id: string; subjectId: string; topicId?: string; front: string; back: string; due: string; interval: number; ease: number; reps: number }
export interface Review { subjectId: string; topicId?: string; rating: 0 | 1 | 2 | 3; date: string } // 0 again, 1 hard, 2 good, 3 easy

export interface NotifPrefs { sessions: boolean; missed: boolean; dailyQuiz: boolean; reviews: boolean; /** push alerts for course announcements and group replies */ push: boolean }
export interface Prefs {
  goals: string[];
  preferredTime: string;   // "HH:MM" — when the student likes to study
  dailyMinutes: number;    // available study time per day
  quietStart: string;      // "HH:MM"
  quietEnd: string;
  notif: NotifPrefs;
  setupDone: boolean;
}
export const DEFAULT_PREFS: Prefs = {
  goals: [], preferredTime: "20:00", dailyMinutes: 45, quietStart: "22:00", quietEnd: "07:00",
  notif: { sessions: true, missed: true, dailyQuiz: true, reviews: true, push: true }, setupDone: false,
};

export interface StudyData {
  subjects: Subject[]; topics: Topic[]; notes: Note[]; questions: Question[]; attempts: QuizAttempt[];
  sessions: PlannedSession[]; focus: FocusLog[]; cards: Card[]; reviews: Review[]; prefs: Prefs;
}
export const EMPTY_DATA: StudyData = {
  subjects: [], topics: [], notes: [], questions: [], attempts: [],
  sessions: [], focus: [], cards: [], reviews: [], prefs: DEFAULT_PREFS,
};

/** Merge whatever was stored (possibly the older v1 shape) onto safe defaults. */
export function normalizeData(p: any): StudyData {
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  return {
    subjects: arr(p?.subjects), topics: arr(p?.topics), notes: arr(p?.notes), questions: arr(p?.questions),
    attempts: arr(p?.attempts), sessions: arr(p?.sessions), focus: arr(p?.focus), cards: arr(p?.cards), reviews: arr(p?.reviews),
    prefs: { ...DEFAULT_PREFS, ...(p?.prefs ?? {}), notif: { ...DEFAULT_PREFS.notif, ...(p?.prefs?.notif ?? {}) } },
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysStr = (n: number, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return dateStr(d); };
export const daysAgo = (n: number) => addDaysStr(-n);
export const daysUntil = (iso: string) => Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const addMinutesToTime = (t: string, m: number) => {
  const [h, mm] = t.split(":").map(Number); const total = (h * 60 + mm + m) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};
export const fmtTime12 = (t: string) => { const [h, m] = t.split(":").map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`; };
