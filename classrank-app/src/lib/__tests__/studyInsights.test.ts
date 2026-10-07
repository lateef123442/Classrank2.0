import { EMPTY_DATA, StudyData, dateStr, addDaysStr, normalizeData } from "../studyTypes";
import {
  topicStats, subjectStats, studyStreak, longestStudyStreak, recommend, buildQuiz, analyzeAttempt,
  reviewAfterQuiz, generateSchedule, inQuietHours, achievements, xpInfo,
} from "../studyInsights";

const mk = (over: Partial<StudyData> = {}): StudyData => ({
  ...EMPTY_DATA,
  prefs: { ...EMPTY_DATA.prefs, setupDone: true },
  subjects: [{ id: "bio", name: "Biology" }, { id: "math", name: "Mathematics" }],
  topics: [{ id: "gen", subjectId: "bio", name: "Genetics", stage: 0 }, { id: "cell", subjectId: "bio", name: "Cells", stage: 0 }],
  ...over,
});
const q = (id: string, topicId?: string, subjectId = "bio") => ({ id, subjectId, topicId, q: id, options: ["a", "b", "c", "d"], correct: 0, explanation: "because", source: "manual" as const });
const attempt = (results: [string, boolean][], date = dateStr(), mode: any = "topic") => ({
  id: Math.random().toString(), mode, subjectId: "bio", date, seconds: 60, total: results.length,
  correct: results.filter((r) => r[1]).length,
  answers: results.map(([t, ok], i) => ({ qid: "q" + i, subjectId: "bio", topicId: t, picked: ok ? 0 : 1, correct: ok })),
});

describe("normalizeData", () => {
  it("upgrades the older v1 shape without losing data", () => {
    const d = normalizeData({ subjects: [{ id: "a", name: "X" }], cards: [], reviews: [] });
    expect(d.subjects).toHaveLength(1);
    expect(d.topics).toEqual([]);
    expect(d.prefs.dailyMinutes).toBe(45);
  });
});

describe("topicStats", () => {
  it("needs 3+ answers before judging", () => {
    expect(topicStats(mk({ attempts: [attempt([["gen", false], ["gen", false]])] }))[0].label).toBe("Not enough data");
  });
  it("labels strong / improving / needs review", () => {
    const d = mk({ attempts: [attempt([["gen", false], ["gen", false], ["gen", true], ["cell", true], ["cell", true], ["cell", true], ["cell", true]])] });
    const s = Object.fromEntries(topicStats(d).map((t) => [t.name, t.label]));
    expect(s.Genetics).toBe("Needs review");
    expect(s.Cells).toBe("Strong");
  });
});

describe("streak", () => {
  it("counts consecutive study days and survives 'not yet today'", () => {
    const d = mk({ focus: [{ subject: "Biology", minutes: 20, date: addDaysStr(-1) }, { subject: "Biology", minutes: 20, date: addDaysStr(-2) }] });
    expect(studyStreak(d)).toBe(2);
    expect(studyStreak(mk({ focus: [{ subject: "Biology", minutes: 5, date: addDaysStr(-3) }] }))).toBe(0);
    expect(longestStudyStreak(d)).toBe(2);
  });
});

describe("spaced review", () => {
  it("lengthens on success and resets to tomorrow on struggle", () => {
    expect(reviewAfterQuiz(0, 90).stage).toBe(1);
    expect(reviewAfterQuiz(2, 40)).toEqual({ stage: 0, nextReview: addDaysStr(1) });
    expect(reviewAfterQuiz(1, 70).stage).toBe(1);
  });
});

describe("buildQuiz", () => {
  it("respects mode size and topic scoping", () => {
    const qs = Array.from({ length: 12 }, (_, i) => q("q" + i, i % 2 ? "gen" : "cell"));
    const d = mk({ questions: qs });
    expect(buildQuiz(d, "quick").questions).toHaveLength(5);
    expect(buildQuiz(d, "topic", "bio", "gen").questions.every((x) => x.topicId === "gen")).toBe(true);
    expect(buildQuiz(d, "mock", "bio").timeLimit).toBe(12 * 60);
  });
});

describe("analyzeAttempt + recommend", () => {
  it("points the student at the weak topic", () => {
    const a = attempt([["gen", false], ["gen", false], ["gen", true], ["cell", true], ["cell", true]]);
    const r = analyzeAttempt(mk({ attempts: [a] }), a);
    expect(r.struggled[0]).toContain("Genetics");
    expect(r.wentWell[0]).toContain("Cells");
    expect(r.next.cta).toContain("Genetics");
  });
  it("prioritises a weak topic when an exam is close", () => {
    const d = mk({
      subjects: [{ id: "bio", name: "Biology", examDate: addDaysStr(8) }, { id: "math", name: "Mathematics" }],
      questions: [q("x", "gen")],
      attempts: [attempt([["gen", false], ["gen", false], ["gen", true], ["gen", false]])],
      sessions: [{ id: "s", subjectId: "math", date: dateStr(), minutes: 20, status: "planned" }],
    });
    const rec = recommend(d);
    expect(rec.text).toContain("Genetics");
    expect(rec.text).toContain("8 days");
    expect(rec.target).toBe("PracticeSession");
    expect(rec.steps).toHaveLength(3);
  });
  it("falls back to today's session with no weakness signal", () => {
    const d = mk({ sessions: [{ id: "s", subjectId: "math", date: dateStr(), minutes: 20, status: "planned" }] });
    expect(recommend(d).target).toBe("Study");
  });
});

describe("generateSchedule", () => {
  it("stays within the daily budget and favours the subject with the nearer exam", () => {
    const d = mk({ subjects: [{ id: "bio", name: "Biology", examDate: addDaysStr(3) }, { id: "math", name: "Mathematics" }] });
    const plan = generateSchedule(d, 3);
    for (let i = 0; i < 3; i++) {
      const mins = plan.filter((p) => p.date === addDaysStr(i)).reduce((a, p) => a + p.minutes, 0);
      expect(mins).toBeLessThanOrEqual(d.prefs.dailyMinutes);
    }
    expect(plan[0].subjectId).toBe("bio");
    expect(plan.filter((p) => p.subjectId === "bio" && p.date > addDaysStr(3))).toHaveLength(0);
  });
});

describe("quiet hours", () => {
  it("handles windows that wrap midnight", () => {
    const p = { ...EMPTY_DATA.prefs, quietStart: "22:00", quietEnd: "07:00" };
    const at = (h: number) => { const x = new Date(); x.setHours(h, 0, 0, 0); return x; };
    expect(inQuietHours(p, at(23))).toBe(true);
    expect(inQuietHours(p, at(3))).toBe(true);
    expect(inQuietHours(p, at(12))).toBe(false);
  });
});

describe("gamification", () => {
  it("awards First Quiz and XP after an attempt", () => {
    const d = mk({ attempts: [attempt([["gen", true], ["gen", true], ["gen", true]])] });
    expect(achievements(d).find((a) => a.id === "first_quiz")!.earned).toBe(true);
    expect(achievements(d).find((a) => a.id === "perfect")!.earned).toBe(true);
    expect(xpInfo(d).xp).toBe(50);
    expect(subjectStats(d)[0].quizAnswers).toBeGreaterThan(0);
  });
});

import { nextCardState, fmtInterval, weeklyActivity, subjectTrends, knowledgeGaps, questionPool } from "../studyInsights";

describe("phase 2: flashcards", () => {
  it("Again resets, Good/Easy grow the interval, Easy grows it more", () => {
    const c = { interval: 6, ease: 2.5, reps: 3 };
    expect(nextCardState(c, 0).interval).toBe(0);
    expect(nextCardState(c, 2).interval).toBe(15);
    expect(nextCardState(c, 3).interval).toBeGreaterThan(nextCardState(c, 2).interval);
    expect(nextCardState(c, 1).interval).toBeLessThanOrEqual(nextCardState(c, 2).interval);
    expect(fmtInterval(0)).toBe("<1d");
    expect(fmtInterval(45)).toBe("2mo");
  });
  it("flashcard ratings count toward topic strength", () => {
    const d = mk({ reviews: [1, 1, 0, 0].map((r) => ({ subjectId: "bio", topicId: "gen", rating: r as 0 | 1, date: dateStr() })) });
    const g = topicStats(d).find((t) => t.id === "gen")!;
    expect(g.answered).toBe(4);
    expect(g.label).toBe("Needs review");
  });
});

describe("phase 2: review mode + gaps", () => {
  it("review pool = due or weak topics only", () => {
    const d = mk({
      topics: [{ id: "gen", subjectId: "bio", name: "Genetics", stage: 0, nextReview: dateStr() }, { id: "cell", subjectId: "bio", name: "Cells", stage: 1, nextReview: addDaysStr(5) }],
      questions: [q("a", "gen"), q("b", "cell")],
    });
    expect(questionPool(d, "review").map((x) => x.id)).toEqual(["a"]);
  });
  it("finds weak, overdue, untested and empty areas", () => {
    const d = mk({
      topics: [{ id: "gen", subjectId: "bio", name: "Genetics", stage: 0 }, { id: "cell", subjectId: "bio", name: "Cells", stage: 0, nextReview: dateStr() }],
      attempts: [attempt([["gen", false], ["gen", false], ["gen", true]])],
    });
    const kinds = knowledgeGaps(d).map((g) => `${g.kind}:${g.title}`);
    expect(kinds).toContain("weak:Genetics");
    expect(kinds).toContain("overdue:Cells");
    expect(kinds).toContain("empty:Mathematics");
  });
});

describe("phase 2: analytics", () => {
  it("weekly activity has 7 days and sums today's focus", () => {
    const w = weeklyActivity(mk({ focus: [{ subject: "Biology", minutes: 25, date: dateStr() }, { subject: "Biology", minutes: 10, date: dateStr() }] }));
    expect(w).toHaveLength(7);
    expect(w[6].minutes).toBe(35);
  });
  it("subject trend compares the latest 3 attempts with the 3 before", () => {
    const bad = attempt([["gen", false], ["gen", false]]), good = attempt([["gen", true], ["gen", true]]);
    const d = mk({ attempts: [bad, bad, bad, good, good, good] });
    expect(subjectTrends(d).find((t) => t.id === "bio")!.delta).toBe(100);
    expect(subjectTrends(mk({ attempts: [good] })).find((t) => t.id === "bio")!.delta).toBe(null);
  });
});

describe("audit fixes", () => {
  it("topic quiz with no topic selected has no questions (not every untagged one)", () => {
    expect(questionPool(mk({ questions: [q("a"), q("b", "gen")] }), "topic", "bio", undefined)).toHaveLength(0);
  });
  it("nudges a brand-new student to set up, but not once they've started", () => {
    const fresh = { ...mk(), prefs: EMPTY_DATA.prefs };
    expect(recommend(fresh).target).toBe("StudySetup");
    expect(recommend({ ...fresh, prefs: { ...EMPTY_DATA.prefs, setupDone: true } }).target === "StudySetup").toBe(false);
  });
  it("never schedules a session earlier than now today, nor past 23:45", () => {
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
    const d = mk({ prefs: { ...EMPTY_DATA.prefs, setupDone: true, preferredTime: "00:30" } });
    generateSchedule(d, 3).forEach((p) => {
      const [h, m] = p.time.split(":").map(Number);
      expect(h * 60 + m).toBeLessThanOrEqual(23 * 60 + 45);
      if (p.date === dateStr()) expect(h * 60 + m).toBeGreaterThan(nowMin);
    });
  });
  it("focus recommendation carries the subject so Focus can preselect it", () => {
    const d = mk({ sessions: [{ id: "s", subjectId: "math", date: dateStr(), minutes: 20, status: "planned" }] });
    expect(recommend(d).params).toEqual({ subject: "Mathematics" });
  });
});

import { mergeCourseContent, reportableAnswers, nextExamDate, CourseBundle, focusMinutesSince } from "../studyCourseSync";

const bundle = (over: Partial<CourseBundle> = {}): CourseBundle => ({
  course: { id: "c1", code: "CSC201", title: "Data Structures" },
  materials: [{ id: "m1", topic: "Trees", title: "Tree notes", kind: "note", body: "A tree is..." }, { id: "m2", topic: "", title: "Slides", kind: "link", body: "https://x" }],
  questions: [
    { id: "q1", topic: "Trees", question: "Root has how many parents?", options: ["0", "1", "2", "3"], correct_index: 0, explanation: "None." },
    { id: "q2", topic: "Graphs", question: "Edge connects?", options: ["a", "b", "c", "d"], correct_index: 1, explanation: "" },
  ],
  events: [{ id: "e1", kind: "exam", title: "Midterm", body: "", event_date: addDaysStr(10) }, { id: "e2", kind: "exam", title: "Old", body: "", event_date: addDaysStr(-3) }],
  ...over,
});
let n = 0; const nid = () => "id" + n++;

describe("phase 3: course sync", () => {
  it("creates a subject with topics, notes, questions and the next upcoming exam", () => {
    const r = mergeCourseContent(EMPTY_DATA, bundle(), nid);
    const sub = r.data.subjects[0];
    expect(sub.courseId).toBe("c1");
    expect(sub.name).toBe("CSC201 Data Structures");
    expect(sub.examDate).toBe(addDaysStr(10));
    expect(r.data.topics.map((t) => t.name)).toEqual(["Trees", "Graphs"]);
    expect(r.data.questions).toHaveLength(2);
    expect(r.data.questions[0].source).toBe("course");
    expect(r.data.notes[1].title).toBe("🔗 Slides");
  });
  it("is idempotent, updates edited content, and removes what the teacher deleted", () => {
    const first = mergeCourseContent(EMPTY_DATA, bundle(), nid).data;
    const again = mergeCourseContent(first, bundle(), nid);
    expect(again.data.questions).toHaveLength(2);
    expect(again.data.subjects).toHaveLength(1);
    expect(again.counts.questions).toBe(0);
    const edited = bundle({ questions: [{ id: "q1", topic: "Trees", question: "Edited?", options: ["a", "b", "c", "d"], correct_index: 2, explanation: "x" }] });
    const r = mergeCourseContent(again.data, edited, nid).data;
    expect(r.questions).toHaveLength(1);
    expect(r.questions[0].q).toBe("Edited?");
    expect(r.questions[0].correct).toBe(2);
  });
  it("never touches the student's own content", () => {
    const own = mk({ questions: [q("mine", undefined, "bio")], notes: [{ id: "n", subjectId: "bio", title: "mine", body: "b", date: dateStr() }] });
    const r = mergeCourseContent(own, bundle(), nid).data;
    expect(r.questions.some((x) => x.id === "mine")).toBe(true);
    expect(r.notes.some((x) => x.id === "n")).toBe(true);
  });
  it("reports only answers to course questions, grouped by course", () => {
    const d = mergeCourseContent(mk(), bundle(), nid).data;
    const sid = d.subjects.find((s) => s.courseId === "c1")!.id;
    const [courseQ, courseQ2] = d.questions.filter((x) => x.remoteId);
    const own = q("own", undefined, "bio");
    const a = { id: "a", mode: "quick" as const, date: dateStr(), seconds: 1, total: 3, correct: 1, answers: [
      { qid: courseQ.id, subjectId: sid, picked: 0, correct: true },
      { qid: courseQ2.id, subjectId: sid, picked: 3, correct: false },
      { qid: own.id, subjectId: "bio", picked: 0, correct: true },
    ] };
    const out = reportableAnswers({ ...d, questions: [...d.questions, own] }, a);
    expect(out).toHaveLength(1);
    expect(out[0].courseId).toBe("c1");
    // sends the picked option (server grades it), never a client-claimed "correct"
    expect(out[0].answers).toEqual([{ question_id: "q1", picked: 0 }, { question_id: "q2", picked: 3 }]);
  });
  it("mirrors a file material as a pointer note, never exposing the storage path", () => {
    const b = bundle();
    b.materials.push({ id: "m3", topic: "", title: "Syllabus", kind: "file", body: "c1/abc-Syllabus.pdf", file_name: "Syllabus.pdf", file_size: 1000, mime: "application/pdf" });
    const n = mergeCourseContent(EMPTY_DATA, b, nid).data.notes.find((x) => x.remoteId === "m3")!;
    expect(n.title).toBe("📎 Syllabus");
    expect(n.body).toContain("Syllabus.pdf");
    expect(n.body).not.toContain("c1/abc");
  });
  it("does not report skipped course questions", () => {
    const d = mergeCourseContent(mk(), bundle(), nid).data;
    const sid = d.subjects.find((s) => s.courseId === "c1")!.id;
    const [courseQ] = d.questions.filter((x) => x.remoteId);
    const a = { id: "a", mode: "quick" as const, date: dateStr(), seconds: 1, total: 1, correct: 0, answers: [
      { qid: courseQ.id, subjectId: sid, picked: null, correct: false },
    ] };
    expect(reportableAnswers(d, a)).toEqual([]);
  });
  it("finds the next exam and sums focus minutes since a date", () => {
    expect(nextExamDate(bundle())).toBe(addDaysStr(10));
    const d = mk({ focus: [{ subject: "Biology", minutes: 20, date: dateStr() }, { subject: "Math", minutes: 5, date: dateStr() }, { subject: "Biology", minutes: 99, date: addDaysStr(-9) }] });
    expect(focusMinutesSince(d, null, addDaysStr(-1))).toBe(25);
    expect(focusMinutesSince(d, ["Biology"], addDaysStr(-1))).toBe(20);
  });
});

import { buildReviewQuiz, shiftOutOfQuiet } from "../studyInsights";

describe("leftover fixes", () => {
  it("sizes review sessions by topic maturity: 3 for new, 5 for matured, capped at 15", () => {
    const qs = (topic: string, n: number) => Array.from({ length: n }, (_, i) => q(`${topic}${i}`, topic));
    const d = mk({
      topics: [
        { id: "gen", subjectId: "bio", name: "Genetics", stage: 0, nextReview: dateStr() },
        { id: "cell", subjectId: "bio", name: "Cells", stage: 2, nextReview: dateStr() },
        { id: "evo", subjectId: "bio", name: "Evolution", stage: 1, nextReview: addDaysStr(9) },
      ],
      questions: [...qs("gen", 10), ...qs("cell", 10), ...qs("evo", 10)],
    });
    const out = buildReviewQuiz(d);
    expect(out).toHaveLength(8);
    expect(out.filter((x) => x.topicId === "gen")).toHaveLength(3);
    expect(out.filter((x) => x.topicId === "cell")).toHaveLength(5);
    expect(out.filter((x) => x.topicId === "evo")).toHaveLength(0);
    expect(buildQuiz(d, "review").questions).toHaveLength(8);
  });
  it("moves reminders out of quiet hours, wrapping past midnight when needed", () => {
    const p = { ...EMPTY_DATA.prefs, quietStart: "22:00", quietEnd: "07:00" };
    const at = (h: number, daysFromNow = 0) => { const x = new Date(); x.setDate(x.getDate() + daysFromNow); x.setHours(h, 0, 0, 0); return x; };
    const late = shiftOutOfQuiet(p, at(23)); // 23:00 → 07:00 tomorrow
    expect(late.getHours()).toBe(7);
    expect(late.getTime() > at(23).getTime()).toBe(true);
    const early = shiftOutOfQuiet(p, at(3)); // 03:00 → 07:00 same day
    expect(early.getHours()).toBe(7);
    expect(early.getTime() > at(3).getTime()).toBe(true);
    expect(shiftOutOfQuiet(p, at(18)).getTime()).toBe(at(18).getTime());
  });
});

import { pickQuizQuestions } from "../groupQuiz";
import { parseQuestionBlocks } from "../bulkImport";

describe("phase 3+: group quiz + bulk import helpers", () => {
  it("picks quiz questions from one subject only, capped, without answers leaking extra fields", () => {
    const d = mk({ questions: [...Array.from({ length: 8 }, (_, i) => q("b" + i, "gen", "bio")), q("m1", undefined, "math"), q("m2", undefined, "math")] });
    const p = pickQuizQuestions(d, "bio", 5);
    expect(p).toHaveLength(5);
    expect(Object.keys(p[0]).sort()).toEqual(["correct", "explanation", "options", "q"]);
    expect(pickQuizQuestions(d, "math", 5)).toHaveLength(0); // fewer than 3 → can't make a quiz
    expect(pickQuizQuestions(d, "bio", 50)).toHaveLength(8);
  });
  it("parses well-formed blocks incl. multi-line text, alternate markers, topic and explanation", () => {
    const r = parseQuestionBlocks(`Q: What is the root of a tree?
It has no parent.
A) The top node
B. A leaf
(C) An edge
D: A cycle
Answer: a
Why: The root has no parent.
Topic: Trees

2. Which is FIFO?
A) Stack
B) Queue
C) Tree
D) Graph
Answer: (B)`);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].question).toBe("What is the root of a tree? It has no parent.");
    expect(r.questions[0].options).toEqual(["The top node", "A leaf", "An edge", "A cycle"]);
    expect(r.questions[0].correctIndex).toBe(0);
    expect(r.questions[0].topic).toBe("Trees");
    expect(r.questions[1].correctIndex).toBe(1);
    expect(r.questions[1].explanation).toBe("");
  });
  it("reports exactly what is wrong with each bad block and keeps the good ones", () => {
    const r = parseQuestionBlocks(`Q: Good?
A) 1
B) 2
C) 3
D) 4
Answer: C

Q: No answer line
A) 1
B) 2
C) 3
D) 4

Q: Missing D
A) 1
B) 2
C) 3
Answer: A`);
    expect(r.questions).toHaveLength(1);
    expect(r.errors.map((e) => `${e.block}:${e.message}`)).toEqual(['2:Missing the "Answer: B" line', "3:Missing option D"]);
  });
  it("does not mistake a question that starts with 'A. Name' for an option", () => {
    const r = parseQuestionBlocks("A. Smith proposed what?\nA) Theory X\nB) Y\nC) Z\nD) W\nAnswer: A");
    expect(r.errors).toEqual([]);
    expect(r.questions[0].question).toBe("A. Smith proposed what?");
  });
});

import { mergeStudyData, hasContent, canonicalStudyJson } from "../studyMerge";

describe("cloud sync merge", () => {
  const base = mk({ cards: [{ id: "c1", subjectId: "bio", front: "f", back: "b", due: dateStr(), interval: 0, ease: 2.5, reps: 0 }] });
  it("unions items added on each device without duplicating shared ones", () => {
    const phone = { ...base, notes: [{ id: "n1", subjectId: "bio", title: "phone", body: "x", date: dateStr() }] };
    const tablet = { ...base, notes: [{ id: "n2", subjectId: "bio", title: "tablet", body: "y", date: dateStr() }] };
    const m = mergeStudyData(phone, tablet);
    expect(m.notes.map((n) => n.id).sort()).toEqual(["n1", "n2"]);
    expect(m.cards).toHaveLength(1);
    expect(m.subjects).toHaveLength(2);
  });
  it("keeps the more progressed copy of a card, topic and session", () => {
    const a = { ...base, cards: [{ ...base.cards[0], reps: 4, interval: 9, due: addDaysStr(9) }], topics: [{ id: "gen", subjectId: "bio", name: "Genetics", stage: 3, nextReview: addDaysStr(14) }], sessions: [{ id: "s", subjectId: "bio", date: dateStr(), minutes: 20, status: "done" as const }] };
    const b = { ...base, cards: [{ ...base.cards[0], reps: 1, interval: 1, due: addDaysStr(1) }], topics: [{ id: "gen", subjectId: "bio", name: "Genetics", stage: 1, nextReview: addDaysStr(3) }], sessions: [{ id: "s", subjectId: "bio", date: dateStr(), minutes: 20, status: "planned" as const }] };
    for (const [x, y] of [[a, b], [b, a]]) { // symmetric: same winner whichever side is "local"
      const m = mergeStudyData(x, y);
      expect(m.cards[0].reps).toBe(4);
      expect(m.topics[0].stage).toBe(3);
      expect(m.sessions[0].status).toBe("done");
    }
  });
  it("combines focus logs as a multiset: shared history once, new entries from both sides", () => {
    const shared = { subject: "Biology", minutes: 25, date: addDaysStr(-2) };
    const onlyA = { subject: "Biology", minutes: 10, date: addDaysStr(-1) }, onlyB = { subject: "Math", minutes: 30, date: dateStr() };
    const m = mergeStudyData(mk({ focus: [shared, onlyA] }), mk({ focus: [shared, onlyB] }));
    expect(m.focus).toHaveLength(3);
    expect(m.focus.map((f) => f.date)).toEqual([addDaysStr(-2), addDaysStr(-1), dateStr()]); // chronological
    expect(mergeStudyData(mk({ focus: [shared] }), mk({ focus: [shared] })).focus).toHaveLength(1);
  });
  it("keeps attempts chronological and prefers the prefs the student actually set up", () => {
    const old = attempt([["gen", true], ["gen", true], ["gen", true]], addDaysStr(-5)), recent = attempt([["gen", false], ["gen", true], ["gen", true]], addDaysStr(-1));
    const m = mergeStudyData(mk({ attempts: [recent] }), mk({ attempts: [old], prefs: { ...EMPTY_DATA.prefs, setupDone: true, goals: ["Pass exams"] } }));
    expect(m.attempts.map((a) => a.date)).toEqual([addDaysStr(-5), addDaysStr(-1)]);
    expect(mergeStudyData({ ...mk(), prefs: EMPTY_DATA.prefs }, mk({ prefs: { ...EMPTY_DATA.prefs, setupDone: true, goals: ["Pass exams"] } })).prefs.goals).toEqual(["Pass exams"]);
  });
  it("tolerates a remote copy from an older app version, and knows when there's nothing worth backing up", () => {
    const m = mergeStudyData(mk(), { subjects: [{ id: "old", name: "Legacy" }] });
    expect(m.subjects.some((s) => s.id === "old")).toBe(true);
    expect(m.prefs.dailyMinutes).toBe(45);
    expect(hasContent(EMPTY_DATA)).toBe(false);
    expect(hasContent(mk())).toBe(true);
  });
});

describe("cloud sync convergence", () => {
  const card = { id: "c1", subjectId: "bio", front: "f", back: "b", due: addDaysStr(2), interval: 2, ease: 2.5, reps: 2 };
  const A = mk({
    subjects: [{ id: "bio", name: "Biology", examDate: addDaysStr(10) }, { id: "math", name: "Mathematics" }],
    sessions: [{ id: "s", subjectId: "bio", date: addDaysStr(1), time: "20:00", minutes: 20, status: "planned" }],
    cards: [card], notes: [{ id: "n", subjectId: "bio", title: "A title", body: "x", date: dateStr() }],
    prefs: { ...EMPTY_DATA.prefs, setupDone: true, dailyMinutes: 60 },
  });
  const B = mk({
    subjects: [{ id: "bio", name: "Biology", examDate: addDaysStr(12) }, { id: "math", name: "Mathematics" }],
    sessions: [{ id: "s", subjectId: "bio", date: addDaysStr(2), time: "19:00", minutes: 20, status: "planned" }],
    cards: [{ ...card, interval: 5, ease: 2.7 }], notes: [{ id: "n", subjectId: "bio", title: "B title", body: "x", date: dateStr() }],
    prefs: { ...EMPTY_DATA.prefs, setupDone: true, dailyMinutes: 90 },
  });
  it("merge(a,b) and merge(b,a) agree even when both sides changed the same things", () => {
    expect(canonicalStudyJson(mergeStudyData(A, B))).toBe(canonicalStudyJson(mergeStudyData(B, A)));
  });
  it("merging again with either input changes nothing, so devices stop sending each other 'news'", () => {
    const m = mergeStudyData(A, B);
    expect(canonicalStudyJson(mergeStudyData(m, A))).toBe(canonicalStudyJson(m));
    expect(canonicalStudyJson(mergeStudyData(m, B))).toBe(canonicalStudyJson(m));
  });
  it("canonical form ignores array order and key order", () => {
    const reordered = { ...A, subjects: [...A.subjects].reverse() };
    expect(canonicalStudyJson(reordered)).toBe(canonicalStudyJson(A));
  });
});
