// Merging two diverged copies of a student's study data (e.g. phone + tablet, or a restored backup plus
// work done since). Pure + tested.
//
// Most data is append-only collections keyed by id, so the merge is a union. Where the same id exists on
// both sides and can legitimately differ, a fixed rule picks the more "progressed" version:
//   cards    → more repetitions, then later due date    topics   → higher review stage, then later next review
//   sessions → done > skipped > planned, then later slot  subjects → later exam date (keeps a course link either side has)
//   anything still tied → a fixed, side-independent choice, so merge(a, b) ≡ merge(b, a) and devices converge
// Focus logs and flashcard reviews have no ids, so they are combined as a multiset (the larger count of each
// identical entry), which is right when both copies share history and each added its own.
// Known limit: deletions can come back after a merge (an item deleted on one side but still present on the other).
import { StudyData, FocusLog, Review, Card, Topic, PlannedSession, Subject, normalizeData } from "./studyTypes";

function byId<T extends { id: string }>(a: T[], b: T[], pick: (local: T, remote: T) => T): T[] {
  const remote = new Map(b.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const out = a.map((l) => { seen.add(l.id); const r = remote.get(l.id); return r ? pick(l, r) : l; });
  b.forEach((r) => { if (!seen.has(r.id)) out.push(r); });
  return out;
}

function multiset<T>(a: T[], b: T[], key: (x: T) => string): T[] {
  const count = (xs: T[]) => xs.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map<string, number>());
  const ca = count(a), cb = count(b), used = new Map<string, number>();
  const out: T[] = [];
  [...a, ...b].forEach((x) => {
    const k = key(x), want = Math.max(ca.get(k) ?? 0, cb.get(k) ?? 0), have = used.get(k) ?? 0;
    if (have < want) { out.push(x); used.set(k, have + 1); }
  });
  return out;
}

const later = (x?: string, y?: string) => ((x ?? "") >= (y ?? "") ? x : y);
// Final tie-break when two versions of the same item differ in ways no rule ranks. It must not depend on which
// side is "local": merge(a, b) and merge(b, a) have to agree, or two devices would keep pushing "news" at each other.
const tie = <T,>(a: T, b: T): T => (JSON.stringify(a) >= JSON.stringify(b) ? a : b);
const sessionWhen = (x: PlannedSession) => `${x.date} ${x.time ?? ""}`;
const rank = { planned: 0, skipped: 1, done: 2 } as const;

export function mergeStudyData(localIn: StudyData, remoteIn: unknown): StudyData {
  const l = localIn, r = normalizeData(remoteIn);
  const byDate = <T extends { date: string }>(xs: T[]) => [...xs].sort((p, q) => p.date.localeCompare(q.date)); // stable: keeps same-day order
  return {
    subjects: byId<Subject>(l.subjects, r.subjects, (a, b) => ({ ...tie(a, b), examDate: later(a.examDate, b.examDate), courseId: a.courseId ?? b.courseId ?? undefined })),
    topics: byId<Topic>(l.topics, r.topics, (a, b) => (a.stage !== b.stage ? (a.stage > b.stage ? a : b) : { ...tie(a, b), nextReview: later(a.nextReview, b.nextReview) })),
    notes: byId(l.notes, r.notes, tie),
    questions: byId(l.questions, r.questions, tie),
    cards: byId<Card>(l.cards, r.cards, (a, b) => (a.reps !== b.reps ? (a.reps > b.reps ? a : b) : a.due !== b.due ? (a.due > b.due ? a : b) : tie(a, b))),
    sessions: byId<PlannedSession>(l.sessions, r.sessions, (a, b) => (rank[a.status] !== rank[b.status] ? (rank[a.status] > rank[b.status] ? a : b) : sessionWhen(a) !== sessionWhen(b) ? (sessionWhen(a) > sessionWhen(b) ? a : b) : tie(a, b))),
    attempts: byDate(byId(l.attempts, r.attempts, tie)),
    focus: byDate(multiset<FocusLog>(l.focus, r.focus, (x) => `${x.date}|${x.subject}|${x.minutes}`)),
    reviews: byDate(multiset<Review>(l.reviews, r.reviews, (x) => `${x.date}|${x.subjectId}|${x.topicId ?? ""}|${x.rating}`)),
    prefs: l.prefs.setupDone !== r.prefs.setupDone ? (l.prefs.setupDone ? l.prefs : r.prefs) : tie(l.prefs, r.prefs),
  };
}

/** True if there's anything worth backing up (so an empty fresh install never overwrites a real backup). */
export const hasContent = (d: StudyData) =>
  d.subjects.length + d.notes.length + d.questions.length + d.cards.length + d.attempts.length + d.focus.length + d.sessions.length > 0 || d.prefs.setupDone;

const sortKeys = (v: any): any =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
/** Order-independent serialisation: two copies with the same content compare equal however their arrays/keys are ordered. */
export function canonicalStudyJson(d: StudyData): string {
  const sorted = <T,>(xs: T[], key: (x: T) => string) => [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const id = (x: { id: string }) => x.id;
  return JSON.stringify(sortKeys({
    ...d,
    subjects: sorted(d.subjects, id), topics: sorted(d.topics, id), notes: sorted(d.notes, id), questions: sorted(d.questions, id),
    cards: sorted(d.cards, id), sessions: sorted(d.sessions, id), attempts: sorted(d.attempts, id),
    focus: sorted(d.focus, (x) => `${x.date}|${x.subject}|${x.minutes}`),
    reviews: sorted(d.reviews, (x) => `${x.date}|${x.subjectId}|${x.topicId ?? ""}|${x.rating}`),
  }));
}
