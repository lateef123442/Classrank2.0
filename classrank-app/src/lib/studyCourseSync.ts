// Pure logic for turning a teacher's course into a student's Subject Room, and for working out
// which quiz answers belong to a course (so they can be reported back to the teacher).
// No React / network imports — unit-tested.
import { StudyData, Subject, Topic, Note, Question, QuizAttempt, dateStr, uid } from "./studyTypes";

export interface CourseBundle {
  course: { id: string; code: string; title: string };
  materials: { id: string; topic: string; title: string; kind: "note" | "link" | "video" | "file"; body: string; file_name?: string | null; file_size?: number | null; mime?: string | null }[];
  questions: { id: string; topic: string; question: string; options: string[]; correct_index: number; explanation: string }[];
  events: { id: string; kind: "announcement" | "exam"; title: string; body: string; event_date: string | null }[];
}

export const courseSubjectName = (c: { code: string; title: string }) => `${c.code} ${c.title}`.slice(0, 60);

/** The nearest exam on or after today, if any. */
export const nextExamDate = (b: CourseBundle) =>
  b.events.filter((e) => e.kind === "exam" && e.event_date && e.event_date >= dateStr()).map((e) => e.event_date!).sort()[0];

/**
 * Idempotent: running it again with the same (or an updated) bundle updates what's there instead of
 * duplicating. Content the teacher deleted is removed locally; the student's own notes, questions,
 * quiz history and flashcards are never touched.
 */
export function mergeCourseContent(d: StudyData, b: CourseBundle, newId: () => string = uid) {
  let subject: Subject | undefined = d.subjects.find((s) => s.courseId === b.course.id);
  const exam = nextExamDate(b);
  const created = !subject;
  if (!subject) subject = { id: newId(), name: courseSubjectName(b.course), courseId: b.course.id };
  const sub: Subject = { ...subject, examDate: exam ?? subject.examDate };

  // topics by (case-insensitive) name
  const topics: Topic[] = [...d.topics];
  const topicId = (name: string): string | undefined => {
    const n = name.trim();
    if (!n) return undefined;
    const hit = topics.find((t) => t.subjectId === sub.id && t.name.toLowerCase() === n.toLowerCase());
    if (hit) return hit.id;
    const t: Topic = { id: newId(), subjectId: sub.id, name: n, stage: 0 };
    topics.push(t);
    return t.id;
  };

  // notes (materials)
  let notes: Note[] = [...d.notes];
  const prefix = { note: "", link: "🔗 ", video: "🎬 ", file: "📎 " } as const;
  b.materials.forEach((m) => {
    // A file's body is a storage path (useless to the student), so the note just points at the course page where it can be opened.
    const body = m.kind === "file" ? `File: ${m.file_name ?? m.title}. Open it from the course page (Community → Courses).` : m.body;
    const fields = { title: prefix[m.kind] + m.title, body, topicId: topicId(m.topic), filePath: m.kind === "file" ? m.body : undefined };
    const i = notes.findIndex((n) => n.remoteId === m.id);
    if (i >= 0) notes[i] = { ...notes[i], ...fields };
    else notes.push({ id: newId(), remoteId: m.id, subjectId: sub.id, date: dateStr(), ...fields });
  });
  const keepNotes = new Set(b.materials.map((m) => m.id));
  notes = notes.filter((n) => !(n.subjectId === sub.id && n.remoteId && !keepNotes.has(n.remoteId)));

  // questions
  let questions: Question[] = [...d.questions];
  b.questions.forEach((q) => {
    const fields = { q: q.question, options: q.options, correct: q.correct_index, explanation: q.explanation, topicId: topicId(q.topic) };
    const i = questions.findIndex((x) => x.remoteId === q.id);
    if (i >= 0) questions[i] = { ...questions[i], ...fields };
    else questions.push({ id: newId(), remoteId: q.id, subjectId: sub.id, source: "course", ...fields });
  });
  const keepQ = new Set(b.questions.map((q) => q.id));
  questions = questions.filter((q) => !(q.subjectId === sub.id && q.remoteId && !keepQ.has(q.remoteId)));

  const data: StudyData = {
    ...d,
    subjects: created ? [...d.subjects, sub] : d.subjects.map((s) => (s.id === sub.id ? sub : s)),
    topics, notes, questions,
  };
  return {
    data, subjectId: sub.id,
    counts: { topics: topics.length - d.topics.length, notes: notes.length - d.notes.length, questions: questions.length - d.questions.length },
  };
}

/** Answers to course questions in this attempt, grouped by course — what gets reported to the server. */
export function reportableAnswers(d: StudyData, a: QuizAttempt) {
  const byCourse = new Map<string, { question_id: string; picked: number }[]>();
  a.answers.forEach((x) => {
    const q = d.questions.find((y) => y.id === x.qid);
    const courseId = d.subjects.find((s) => s.id === x.subjectId)?.courseId;
    // Send the option the student picked; the server grades it against the answer key. Skipped questions aren't reported.
    if (!q?.remoteId || !courseId || x.picked == null) return;
    byCourse.set(courseId, [...(byCourse.get(courseId) ?? []), { question_id: q.remoteId, picked: x.picked }]);
  });
  return [...byCourse.entries()].map(([courseId, answers]) => ({ courseId, answers }));
}

/** Focus minutes logged on a subject on/after a date — used to self-report group challenge progress. */
export const focusMinutesSince = (d: StudyData, subjectNames: string[] | null, since: string) =>
  d.focus.filter((f) => f.date >= since && (!subjectNames || subjectNames.includes(f.subject))).reduce((a, f) => a + f.minutes, 0);

/**
 * Storage paths of a course's uploaded files that the AI tools may read for this subject/topic (newest 3, matching the
 * server's per-request limit). Empty for subjects that aren't course rooms. Files without a topic count for every topic.
 */
export function courseFilePaths(d: StudyData, subjectId: string, topicId?: string, max = 3): string[] {
  if (!d.subjects.find((s) => s.id === subjectId)?.courseId) return [];
  return d.notes
    .filter((n) => n.subjectId === subjectId && n.filePath && (!topicId || !n.topicId || n.topicId === topicId))
    .map((n) => n.filePath!)
    .slice(-max);
}
