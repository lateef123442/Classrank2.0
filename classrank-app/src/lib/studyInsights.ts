// Pure derived logic over StudyData: topic/subject strength, streaks, XP, achievements,
// quiz building + analysis, the "what should I do next?" recommender, and the schedule suggester.
// No React / RN imports so it can be unit-tested with plain node.
import {
  StudyData, Question, QuizMode, QuizAttempt, Prefs,
  dateStr, addDaysStr, daysAgo, daysUntil,
} from "./studyTypes";

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30]; // days between reviews as a topic is retained
export type Strength = "Strong" | "Improving" | "Needs review" | "Not enough data";

// ── lookups ──
export const subjectName = (d: StudyData, id: string) => d.subjects.find((s) => s.id === id)?.name ?? "Subject";
export const topicName = (d: StudyData, id?: string) => (id ? d.topics.find((t) => t.id === id)?.name : undefined) ?? "General";
export const todaySessions = (d: StudyData) => d.sessions.filter((s) => s.date === dateStr());
export const focusMinutes = (d: StudyData, fromDaysAgo: number, toDaysAgo: number) =>
  d.focus.filter((f) => f.date >= daysAgo(fromDaysAgo) && f.date <= daysAgo(toDaysAgo)).reduce((a, f) => a + f.minutes, 0);
export const dueCards = (d: StudyData) => d.cards.filter((c) => c.due <= dateStr());
export const dueTopics = (d: StudyData) => d.topics.filter((t) => t.nextReview && t.nextReview <= dateStr());
export const missedSessions = (d: StudyData) => d.sessions.filter((s) => s.date < dateStr() && s.status === "planned");
export const attemptedToday = (d: StudyData, mode?: QuizMode) => d.attempts.some((a) => a.date === dateStr() && (!mode || a.mode === mode));

const labelFor = (acc: number | null): Strength => (acc === null ? "Not enough data" : acc >= 80 ? "Strong" : acc >= 60 ? "Improving" : "Needs review");
const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : 0);

// ── topic + subject performance ──
export function topicStats(d: StudyData) {
  return d.topics.map((t) => {
    // Evidence = quiz answers + flashcard ratings for this topic (Good/Easy counts as correct).
    const rows = [
      ...d.attempts.flatMap((a) => a.answers.filter((x) => x.topicId === t.id)),
      ...d.reviews.filter((r) => r.topicId === t.id).map((r) => ({ correct: r.rating >= 2 })),
    ];
    const answered = rows.length;
    const accuracy = answered >= 3 ? pct(rows.filter((r) => r.correct).length, answered) : null;
    let label = labelFor(accuracy);
    // A low overall score that's clearly climbing lately reads as "Improving", not "Needs review".
    if (label === "Needs review" && answered >= 6) {
      const recent = rows.slice(-4), earlier = rows.slice(0, -4);
      if (earlier.length && pct(recent.filter((r) => r.correct).length, recent.length) - pct(earlier.filter((r) => r.correct).length, earlier.length) >= 20) label = "Improving";
    }
    return { id: t.id, subjectId: t.subjectId, name: t.name, answered, accuracy, label, due: !!t.nextReview && t.nextReview <= dateStr() };
  });
}

export function subjectStats(d: StudyData) {
  return d.subjects.map((s) => {
    const rev = d.reviews.filter((r) => r.subjectId === s.id);
    const ans = d.attempts.flatMap((a) => a.answers.filter((x) => x.subjectId === s.id));
    const total = rev.length + ans.length;
    const good = rev.filter((r) => r.rating >= 2).length + ans.filter((x) => x.correct).length;
    const accuracy = total >= 5 ? pct(good, total) : null;
    return {
      id: s.id, name: s.name, accuracy, label: labelFor(accuracy), reviews: rev.length, quizAnswers: ans.length,
      cards: d.cards.filter((c) => c.subjectId === s.id).length,
      questions: d.questions.filter((q) => q.subjectId === s.id).length,
      topics: d.topics.filter((t) => t.subjectId === s.id).length,
      minutes: d.focus.filter((f) => f.subject === s.name).reduce((a, f) => a + f.minutes, 0),
    };
  }).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101));
}

export function weakestTopic(d: StudyData) {
  return topicStats(d).filter((t) => t.label === "Needs review").sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))[0];
}

/** Score history for "am I improving?": one point per attempt, oldest first. */
export const scoreHistory = (d: StudyData) => d.attempts.map((a) => ({ date: a.date, pct: pct(a.correct, a.total), mode: a.mode }));

// ── streak / XP / achievements ──
export function studyDays(d: StudyData): Set<string> {
  const s = new Set<string>();
  d.focus.forEach((f) => s.add(f.date));
  d.attempts.forEach((a) => s.add(a.date));
  d.reviews.forEach((r) => s.add(r.date));
  d.sessions.forEach((x) => x.status === "done" && s.add(x.date));
  return s;
}
export function studyStreak(d: StudyData): number {
  const days = studyDays(d);
  let n = days.has(dateStr()) ? 0 : 1; // today not studied yet: streak is still alive through yesterday
  if (n === 1 && !days.has(addDaysStr(-1))) return 0;
  let streak = 0;
  for (let i = n; days.has(addDaysStr(-i)); i++) streak++;
  return streak;
}
export function longestStudyStreak(d: StudyData): number {
  const sorted = [...studyDays(d)].sort();
  let best = 0, run = 0, prev: string | null = null;
  for (const day of sorted) {
    run = prev && addDaysStr(1, new Date(prev + "T00:00:00")) === day ? run + 1 : 1;
    best = Math.max(best, run); prev = day;
  }
  return best;
}
export const totalAnswers = (d: StudyData) => d.attempts.reduce((a, x) => a + x.answers.length, 0);
export const totalFocusMinutes = (d: StudyData) => d.focus.reduce((a, f) => a + f.minutes, 0);
export const accuracyOverall = (d: StudyData) => { const t = totalAnswers(d); return t ? pct(d.attempts.reduce((a, x) => a + x.correct, 0), t) : null; };

export function xpInfo(d: StudyData) {
  const xp = d.attempts.reduce((a, x) => a + x.correct * 10 + 20, 0) + totalFocusMinutes(d) + d.reviews.length * 2 + d.sessions.filter((s) => s.status === "done").length * 15;
  const level = Math.floor(xp / 500) + 1;
  return { xp, level, intoLevel: xp % 500, toNext: 500 - (xp % 500) };
}

export function achievements(d: StudyData) {
  const answers = totalAnswers(d), mins = totalFocusMinutes(d), longest = longestStudyStreak(d);
  const mk = (id: string, title: string, desc: string, have: number, need: number) => ({ id, title, desc, have: Math.min(have, need), need, earned: have >= need });
  return [
    mk("first_quiz", "First Quiz", "Complete your first practice quiz", d.attempts.length, 1),
    mk("perfect", "Perfect Score", "Score 100% on a quiz of 3+ questions", d.attempts.some((a) => a.total >= 3 && a.correct === a.total) ? 1 : 0, 1),
    mk("q100", "100 Questions", "Answer 100 practice questions", answers, 100),
    mk("hours10", "10 Hours Studied", "Log 10 hours of focus time", mins, 600),
    mk("streak7", "7-Day Study Streak", "Study 7 days in a row", longest, 7),
    mk("plan1", "Stuck to the Plan", "Complete a planned session", d.sessions.filter((s) => s.status === "done").length, 1),
    mk("cards50", "50 Cards Reviewed", "Review 50 flashcards", d.reviews.length, 50),
  ];
}

// ── spaced review of topics ──
export function reviewAfterQuiz(stage: number, accuracy: number) {
  const next = accuracy >= 80 ? Math.min(stage + 1, REVIEW_INTERVALS.length - 1) : accuracy >= 60 ? stage : 0;
  // Struggling → see it again tomorrow; otherwise the interval grows with each successful review.
  return { stage: next, nextReview: addDaysStr(accuracy < 60 ? 1 : REVIEW_INTERVALS[next]) };
}

// ── quizzes ──
const shuffle = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
export const QUIZ_SIZE: Record<QuizMode, number> = { quick: 5, daily: 5, review: 5, topic: 10, subject: 20, mock: 30 };

export function questionPool(d: StudyData, mode: QuizMode, subjectId?: string, topicId?: string): Question[] {
  if (mode === "topic") return topicId ? d.questions.filter((q) => q.topicId === topicId) : [];
  if (mode === "daily") return d.questions;
  if (mode === "review") {
    // Spaced review: topics that are due, or that the student is struggling with.
    const ids = new Set([...dueTopics(d).map((t) => t.id), ...topicStats(d).filter((t) => t.label === "Needs review").map((t) => t.id)]);
    return d.questions.filter((q) => q.topicId && ids.has(q.topicId) && (!subjectId || q.subjectId === subjectId));
  }
  return subjectId ? d.questions.filter((q) => q.subjectId === subjectId) : d.questions;
}
export function buildQuiz(d: StudyData, mode: QuizMode, subjectId?: string, topicId?: string) {
  if (mode === "review") return { questions: buildReviewQuiz(d, subjectId), timeLimit: undefined };
  const rank = new Map(topicStats(d).map((t) => [t.id, t.label === "Needs review" ? 0 : t.label === "Not enough data" ? 1 : 2]));
  const pool = shuffle(questionPool(d, mode, subjectId, topicId));
  // Short quizzes lean toward what the student is weakest at; long ones cover everything.
  const ordered = mode === "quick" || mode === "daily" ? pool.sort((a, b) => (rank.get(a.topicId ?? "") ?? 1) - (rank.get(b.topicId ?? "") ?? 1)) : pool;
  const questions = ordered.slice(0, QUIZ_SIZE[mode]);
  return { questions, timeLimit: mode === "mock" ? questions.length * 60 : undefined };
}

/**
 * Spaced-review session: a few questions from each topic that is due or struggling.
 * A topic you only just learned gets 3 questions; one that has matured (stage 1+) gets 5. Capped at 15 overall.
 */
export function buildReviewQuiz(d: StudyData, subjectId?: string): Question[] {
  const ids = new Set([...dueTopics(d).map((t) => t.id), ...topicStats(d).filter((t) => t.label === "Needs review").map((t) => t.id)]);
  const picked: Question[] = [];
  d.topics.filter((t) => ids.has(t.id)).sort((a, b) => a.stage - b.stage).forEach((t) => {
    const n = t.stage <= 0 ? 3 : 5;
    picked.push(...shuffle(d.questions.filter((q) => q.topicId === t.id && (!subjectId || q.subjectId === subjectId))).slice(0, n));
  });
  return shuffle(picked).slice(0, 15);
}

export function analyzeAttempt(d: StudyData, a: QuizAttempt) {
  const groups = new Map<string, { topicId?: string; subjectId: string; name: string; c: number; t: number }>();
  a.answers.forEach((x) => {
    const key = x.topicId ?? `general:${x.subjectId}`;
    const g = groups.get(key) ?? { topicId: x.topicId, subjectId: x.subjectId, name: x.topicId ? topicName(d, x.topicId) : subjectName(d, x.subjectId), c: 0, t: 0 };
    g.t++; if (x.correct) g.c++; groups.set(key, g);
  });
  const list = [...groups.values()];
  const score = pct(a.correct, a.total);
  const wentWell = list.filter((g) => pct(g.c, g.t) >= 80).map((g) => `${g.name} — ${g.c}/${g.t} correct`);
  const struggled = list.filter((g) => pct(g.c, g.t) < 60).map((g) => `${g.name} — ${g.c}/${g.t} correct`);
  const revise = list.filter((g) => pct(g.c, g.t) < 70).map((g) => ({ topicId: g.topicId, subjectId: g.subjectId, name: g.name }));
  const skipped = a.answers.filter((x) => x.picked === null).length;
  let next: { text: string; cta: string; target: "Subject" | "PracticeSession" | "Practice"; params?: any };
  if (revise[0]) next = { text: `Review ${revise[0].name} first, then retake a short quiz on it.`, cta: `Review ${revise[0].name}`, target: "Subject", params: { subjectId: revise[0].subjectId } };
  else if (score === 100 && a.total >= 5) next = { text: "Flawless. Step up to a timed mock exam to test it under pressure.", cta: "Try a mock exam", target: "Practice" };
  else next = { text: "Solid. Keep it fresh with another quick quiz tomorrow.", cta: "Back to practice", target: "Practice" };
  return { score, wentWell, struggled, revise, skipped, next };
}

// ── "What should I do next?" ──
export type NavTarget = "Study" | "Planner" | "Cards" | "Progress" | "Practice" | "PracticeSession" | "Subject" | "StudySetup";
export interface Recommendation { text: string; cta: string; target: NavTarget; params?: any; steps?: string[] }

export function recommend(d: StudyData): Recommendation {
  if (d.subjects.length === 0) return { text: "Add your first subject so I can plan your study time.", cta: "Set up subjects", target: "Planner" };

  // Brand-new student who hasn't told us their goals / study times yet.
  if (!d.prefs.setupDone && d.attempts.length === 0 && d.sessions.length === 0)
    return { text: "Tell me your goals and when you like to study, and I'll personalise your plan.", cta: "Set up my study profile", target: "StudySetup" };

  const weak = weakestTopic(d);
  const weakSubject = weak && d.subjects.find((s) => s.id === weak.subjectId);
  const examIn = weakSubject?.examDate ? daysUntil(weakSubject.examDate) : null;
  const weakRec = (): Recommendation => {
    const hasQ = d.questions.some((q) => q.topicId === weak!.id);
    return {
      text: `You scored ${weak!.accuracy}% in ${weak!.name}${examIn !== null && examIn >= 0 ? ` and have a ${weakSubject!.name} exam in ${examIn} day${examIn === 1 ? "" : "s"}` : ""}.`,
      steps: [`Review ${weak!.name}`, "Study for 15 minutes", "Take a 5-question quiz"],
      cta: hasQ ? "Start topic quiz" : "Open subject room",
      ...(hasQ ? { target: "PracticeSession" as const, params: { mode: "topic", subjectId: weak!.subjectId, topicId: weak!.id } } : { target: "Subject" as const, params: { subjectId: weak!.subjectId } }),
    };
  };
  if (weak && examIn !== null && examIn >= 0 && examIn <= 14) return weakRec();

  const next = todaySessions(d).find((s) => s.status === "planned");
  if (next) return { text: `Next up: ${subjectName(d, next.subjectId)} for ${next.minutes} min.`, cta: "Start focus session", target: "Study", params: { subject: subjectName(d, next.subjectId) } };

  const missed = missedSessions(d);
  if (missed.length) return { text: `You missed ${subjectName(d, missed[0].subjectId)} earlier. Want to move it to today?`, cta: "Reschedule", target: "Planner" };
  if (weak) return weakRec();

  const dt = dueTopics(d);
  if (dt.length) return { text: `${dt[0].name} is due for review${dt.length > 1 ? ` (+${dt.length - 1} more)` : ""}. A short quiz locks it in.`, cta: "Start review", ...(questionPool(d, "review").length ? { target: "PracticeSession" as const, params: { mode: "review" } } : { target: "Subject" as const, params: { subjectId: dt[0].subjectId } }) };

  const dueN = dueCards(d).length;
  if (dueN > 0) return { text: `${dueN} flashcard${dueN > 1 ? "s" : ""} due for review. A few minutes now helps it stick.`, cta: "Review cards", target: "Cards" };

  const exam = d.subjects.filter((s) => s.examDate && daysUntil(s.examDate) >= 0 && daysUntil(s.examDate) <= 14).sort((a, b) => daysUntil(a.examDate!) - daysUntil(b.examDate!))[0];
  if (exam && todaySessions(d).length === 0) return { text: `${exam.name} exam in ${daysUntil(exam.examDate!)} days. Plan a session today.`, cta: "Plan a session", target: "Planner" };

  if (d.questions.length >= 3 && !attemptedToday(d)) return { text: "Your daily challenge is waiting. Five questions, a few minutes.", cta: "Start daily challenge", target: "PracticeSession", params: { mode: "daily" } };
  if (d.questions.length === 0) return { text: "Add practice questions to a subject (or generate them) so I can find your weak spots.", cta: "Open a subject", target: "Subject", params: { subjectId: d.subjects[0].id } };
  return { text: todaySessions(d).length ? "Today's plan is done. Nice work — take a break." : "Nothing planned today. Add a short session?", cta: "Open planner", target: "Planner" };
}

// ── schedule suggester ──
export interface Proposal { subjectId: string; topicId?: string; date: string; minutes: number; time: string }

/** Suggest sessions for the next `days` days from exams, weakness, missed sessions and available time. */
export function generateSchedule(d: StudyData, days = 7): Proposal[] {
  if (!d.subjects.length) return [];
  const budget = d.prefs.dailyMinutes;
  const stats = new Map(subjectStats(d).map((s) => [s.id, s]));
  const weakTopic = new Map<string, string>();
  topicStats(d).sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101)).forEach((t) => {
    if ((t.label === "Needs review" || t.due) && !weakTopic.has(t.subjectId)) weakTopic.set(t.subjectId, t.id);
  });
  const tm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const LAST_START = 23 * 60 + 45; // never propose a session that would run past midnight
  const weekAgo = daysAgo(7);
  const missedCount = (sid: string) => d.sessions.filter((s) => s.subjectId === sid && s.date >= weekAgo && (s.status === "skipped" || (s.status === "planned" && s.date < dateStr()))).length;
  const assigned = new Map<string, number>();
  const out: Proposal[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDaysStr(i);
    const existing = d.sessions.filter((s) => s.date === date && s.status !== "skipped");
    let remaining = budget - existing.reduce((a, s) => a + s.minutes, 0);
    const used = new Set(existing.map((s) => s.subjectId));
    let cursorMin = tm(d.prefs.preferredTime) + existing.reduce((a, s) => a + s.minutes, 0);
    if (i === 0) { // today: start at the next quarter-hour at least 15 min from now, never in the past
      const n = new Date();
      cursorMin = Math.max(cursorMin, Math.ceil((n.getHours() * 60 + n.getMinutes() + 15) / 15) * 15);
    }
    let count = 0;
    while (remaining >= 10 && count < 4 && cursorMin + 10 <= LAST_START) {
      const scored = d.subjects
        .filter((s) => !used.has(s.id) && (!s.examDate || s.examDate >= date))
        .map((s) => {
          const acc = stats.get(s.id)?.accuracy;
          const weakness = acc === null || acc === undefined ? 0.5 : (100 - acc) / 100;
          const urgency = s.examDate ? Math.min(2, 6 / Math.max(1, daysUntil(s.examDate) - i)) : 0;
          return { s, score: weakness + urgency + Math.min(0.6, missedCount(s.id) * 0.15) - 0.3 * (assigned.get(s.id) ?? 0) };
        }).sort((a, b) => b.score - a.score);
      if (!scored.length) break;
      const pick = scored[0];
      const block = Math.min(remaining, remaining >= 30 && pick.score > 1 ? 25 : remaining >= 20 ? 20 : remaining >= 15 ? 15 : 10);
      out.push({ subjectId: pick.s.id, topicId: weakTopic.get(pick.s.id), date, minutes: block, time: hhmm(cursorMin) });
      assigned.set(pick.s.id, (assigned.get(pick.s.id) ?? 0) + 1);
      used.add(pick.s.id); remaining -= block; cursorMin += block; count++;
    }
  }
  return out;
}

// ── notification helpers (pure so they're testable) ──
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export function inQuietHours(p: Prefs, at: Date) {
  const m = at.getHours() * 60 + at.getMinutes(), s = toMin(p.quietStart), e = toMin(p.quietEnd);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e; // window may wrap midnight (22:00–07:00)
}

// ── flashcard scheduling (pure, so the UI can preview "Good · 3d") ──
export function nextCardState(c: { interval: number; ease: number; reps: number }, rating: 0 | 1 | 2 | 3) {
  let { interval, ease, reps } = c;
  if (rating === 0) { reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2); }
  else if (rating === 1) { interval = Math.max(1, Math.round(Math.max(interval, 1) * 1.2)); ease = Math.max(1.3, ease - 0.15); reps += 1; }
  else if (rating === 2) { interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(interval * ease); reps += 1; }
  else { interval = reps === 0 ? 3 : Math.round(Math.max(interval, 1) * ease * 1.3); ease += 0.15; reps += 1; }
  return { interval, ease, reps };
}
export const fmtInterval = (days: number) => (days <= 0 ? "<1d" : days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`);

// ── deeper analytics ──
/** Last 7 days (oldest first): focus minutes + questions answered, for the activity chart. */
export function weeklyActivity(d: StudyData) {
  return Array.from({ length: 7 }, (_, k) => {
    const date = daysAgo(6 - k);
    return {
      date,
      label: new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
      minutes: d.focus.filter((f) => f.date === date).reduce((a, f) => a + f.minutes, 0),
      questions: d.attempts.filter((a) => a.date === date).reduce((a, x) => a + x.total, 0),
    };
  });
}

/** Per subject: accuracy of the latest 3 attempts vs the 3 before (null until there are 4+ attempts). */
export function subjectTrends(d: StudyData) {
  return d.subjects.map((s) => {
    const at = d.attempts.filter((a) => a.answers.some((x) => x.subjectId === s.id));
    const acc = (xs: QuizAttempt[]) => { const a = xs.flatMap((x) => x.answers.filter((y) => y.subjectId === s.id)); return a.length ? pct(a.filter((y) => y.correct).length, a.length) : 0; };
    const recent = at.slice(-3), earlier = at.slice(-6, -3);
    return { id: s.id, name: s.name, attempts: at.length, delta: at.length >= 4 && earlier.length ? acc(recent) - acc(earlier) : null };
  });
}

export interface Gap { kind: "weak" | "untested" | "overdue" | "empty"; title: string; detail: string; subjectId: string; topicId?: string }
/** Plain-language "where are my knowledge gaps?" — computed locally, so it works offline and never guesses. */
export function knowledgeGaps(d: StudyData): Gap[] {
  const gaps: Gap[] = [];
  topicStats(d).filter((t) => t.label === "Needs review").sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .forEach((t) => gaps.push({ kind: "weak", title: t.name, detail: `${t.accuracy}% over ${t.answered} answers in ${subjectName(d, t.subjectId)}`, subjectId: t.subjectId, topicId: t.id }));
  dueTopics(d).filter((t) => !gaps.some((g) => g.topicId === t.id))
    .forEach((t) => gaps.push({ kind: "overdue", title: t.name, detail: `Review was due ${t.nextReview}`, subjectId: t.subjectId, topicId: t.id }));
  topicStats(d).filter((t) => t.answered === 0)
    .forEach((t) => gaps.push({ kind: "untested", title: t.name, detail: `Never practised in ${subjectName(d, t.subjectId)}`, subjectId: t.subjectId, topicId: t.id }));
  d.subjects.filter((s) => !d.topics.some((t) => t.subjectId === s.id) || !d.questions.some((q) => q.subjectId === s.id))
    .forEach((s) => gaps.push({ kind: "empty", title: s.name, detail: !d.topics.some((t) => t.subjectId === s.id) ? "No topics yet — I can't tell what you're weak at" : "No practice questions yet", subjectId: s.id }));
  return gaps;
}

/** Moves a notification time out of the quiet window (to when it ends), or returns it unchanged. */
export function shiftOutOfQuiet(p: Prefs, when: Date): Date {
  if (!inQuietHours(p, when)) return when;
  const [h, m] = p.quietEnd.split(":").map(Number);
  const out = new Date(when);
  out.setHours(h, m, 0, 0);
  if (out.getTime() <= when.getTime()) out.setDate(out.getDate() + 1); // window wrapped past midnight
  return out;
}
