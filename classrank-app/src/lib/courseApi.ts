import { supabase } from "./supabase";
import { notifyAnnouncement } from "./pushNotify";
import { CourseBundle, reportableAnswers } from "./studyCourseSync";
import { getStudyData, QuizAttempt } from "./studyStore";
import { uid } from "./studyTypes";
import { secondsLeft } from "./examTime";
import { mimeFor, storagePath, validateFile, MAX_FILE_BYTES } from "./fileRules";

export interface MyCourse { id: string; code: string; title: string; level: number; department: string; teacher_name: string; member_count: number }
export interface StaffCourse { id: string; code: string; title: string; level: number; join_code: string; department: string; teacher_name: string; member_count: number; question_count: number; material_count: number }
export interface CourseStats {
  member_count: number; active_7d: number; answers_total: number; accuracy: number | null;
  hardest: { question_id: string; question: string; topic: string; attempts: number; pct_correct: number }[];
  topics: { topic: string; attempts: number; pct_correct: number }[];
  students: { name: string; answers: number; accuracy: number }[];
}

export interface Topic {
  id: string;
  title: string;
  position: number;
  materials_total: number;
  materials_viewed: number;
  question_count: number;
  completed: boolean;
}

export interface CourseProgress {
  topics: Topic[];
  topic_count: number;
  completed_count: number;
  course_complete: boolean;
  viewed_ids: string[];
}

export interface CourseMaterial {
  id: string;
  topic_id: string | null;
  topic: string;
  title: string;
  kind: "note" | "link" | "video" | "file";
  body: string;
  file_name: string | null;
  file_size: number | null;
  mime: string | null;
  created_at: string;
}

export interface CourseQuestion {
  id: string;
  topic_id: string | null;
  topic: string;
  question: string;
  options: string[];
  correct_index?: number;
  explanation?: string;
  in_daily: boolean;
  assessment_only: boolean;
  created_at: string;
}

export interface CourseContent {
  course: { id: string; code: string; title: string; level: number };
  topics: { id: string; title: string; position: number }[];
  materials: CourseMaterial[];
  questions: CourseQuestion[];
  events: any[];
}

export interface DailyQuiz {
  status: "ready" | "done" | "locked";
  questions?: { id: string; q: string; options: string[]; topic: string }[];
  correct?: number;
  total?: number;
}

export interface DailyQuizResult {
  correct: number;
  total: number;
  review: { q: string; options: string[]; correct: number; explanation: string; picked: number | null }[];
}

export interface CourseLeaderboardEntry {
  profile_id: string;
  name: string;
  points: number;
  assessments: number;
  dailies: number;
}

export interface ExamSummary {
  id: string; title: string; starts_at: string; ends_at: string; duration_minutes: number; kind: "practical" | "test" | "exam"; topic_id?: string; review_after_submit: boolean; question_count: number;
  status: "upcoming" | "open" | "closed"; locked: boolean;
  my_attempt: { started_at: string; submitted: boolean; correct: number | null; total: number | null } | null;
  submitted_count?: number;
}
export interface ExamSession { exam_id: string; title: string; server_now: string; started_at: string; deadline: string; questions: { q: string; options: string[] }[] }
export interface ExamReviewItem { q: string; options: string[]; correct: number; explanation: string; picked: number | null }
export interface ExamResults {
  title: string; total: number;
  students: { name: string; submitted: boolean; started: boolean; correct: number; seconds: number | null }[];
  questions: { q: string; attempts: number; pct_correct: number | null }[];
}

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
};

// ── student ──
export const joinCourse = (code: string) => call<{ course_id: string; code: string; title: string }>("join_course", { p_code: code });
export const leaveCourse = (courseId: string) => call<void>("leave_course", { p_course_id: courseId });
export const fetchMyCourses = async () => (await call<MyCourse[]>("my_courses")) ?? [];
export interface Announcement { id: string; title: string; body: string; created_at: string; course_id: string; course_code: string }
export const fetchRecentAnnouncements = async () => (await call<Announcement[]>("my_recent_announcements", { p_days: 14 })) ?? [];

// Topics & Progress
export const fetchCourseContent = (courseId: string) => call<CourseContent>("get_course_content", { p_course_id: courseId });
export const recordMaterialView = (materialId: string) => call<void>("record_material_view", { p_material_id: materialId });
export const fetchCourseProgress = (courseId: string) => call<CourseProgress>("course_progress", { p_course_id: courseId });
export const markTopicComplete = (topicId: string) => call<CourseProgress>("mark_topic_complete", { p_topic_id: topicId });

// Daily Quizzes (per course, not per department)
export const fetchCourseDailyQuiz = (courseId: string, count: number = 5) => call<DailyQuiz>("get_course_daily_quiz", { p_course_id: courseId, p_count: count });
export const submitCourseDailyQuiz = (courseId: string, answers: (number | null)[]) => call<DailyQuizResult>("submit_course_daily_quiz", { p_course_id: courseId, p_answers: answers });

// Course Leaderboard (ranked by first score)
export const fetchCourseLeaderboard = (courseId: string) => call<CourseLeaderboardEntry[]>("course_leaderboard", { p_course_id: courseId });

// Practice (server-checked, no answers sent to phone)
export const fetchCoursePracticeSet = (courseId: string, topicId?: string, count: number = 10) =>
  call<{ id: string; q: string; options: string[]; topic: string }[]>("get_course_practice_set", { p_course_id: courseId, p_topic_id: topicId ?? null, p_count: count });
export const checkCoursePracticeAnswer = (questionId: string, pickedIndex: number) =>
  call<{ correct: number; explanation: string; was_correct: boolean }>("check_course_practice_answer", { p_question_id: questionId, p_picked: pickedIndex });

/**
 * Fire-and-forget: tells each course's teacher how the student did on that course's questions
 * (aggregated server-side into "hardest questions" etc). Never blocks or fails the quiz.
 */
export async function reportAttemptToCourses(attempt: QuizAttempt): Promise<void> {
  try {
    for (const { courseId, answers } of reportableAnswers(getStudyData(), attempt)) {
      await call<number>("report_course_answers", { p_course_id: courseId, p_answers: answers.slice(0, 60) });
    }
  } catch (e) {
    console.log("[courseApi] report skipped:", e);
  }
}

// ── teacher / admin ──
export const createCourse = (departmentId: string, code: string, title: string, level: number) =>
  call<{ id: string; join_code: string }>("create_course", { p_department_id: departmentId, p_code: code, p_title: title, p_level: level });
export const fetchStaffCourses = async () => (await call<StaffCourse[]>("staff_list_courses")) ?? [];
export const deleteCourse = (courseId: string) => call<void>("staff_delete_course", { p_course_id: courseId });
export const fetchCourseStats = (courseId: string) => call<CourseStats>("teacher_course_stats", { p_course_id: courseId });

// Topics
export const upsertTopic = (courseId: string, topicId: string | null, title: string) =>
  call<string>("staff_upsert_topic", { p_id: topicId ?? null, p_course_id: courseId, p_title: title });
export const deleteTopic = (topicId: string, deleteContent: boolean = false) =>
  call<void>("staff_delete_topic", { p_topic_id: topicId, p_delete_content: deleteContent });
export const reorderTopics = (courseId: string, topicIds: string[]) =>
  call<void>("staff_reorder_topics", { p_course_id: courseId, p_ids: topicIds });

// Resources (notes, links, videos, files)
export const upsertMaterial = (m: { id?: string | null; courseId: string; topic: string; title: string; kind: "note" | "link" | "video" | "file"; body: string }) =>
  call<string>("staff_upsert_material", { p_id: m.id ?? null, p_course_id: m.courseId, p_topic: m.topic, p_title: m.title, p_kind: m.kind, p_body: m.body });
export const updateMaterialMeta = (materialId: string, title: string, topic: string) =>
  call<void>("staff_update_material_meta", { p_id: materialId, p_title: title, p_topic: topic });

// Questions (with pool flags for daily, practice, assessment)
export const upsertCourseQuestion = (q: { id?: string | null; courseId: string; topic: string; question: string; options: string[]; correctIndex: number; explanation: string; inDaily?: boolean; assessmentOnly?: boolean }) =>
  call<string>("staff_upsert_course_question", {
    p_id: q.id ?? null,
    p_course_id: q.courseId,
    p_topic: q.topic,
    p_question: q.question,
    p_options: q.options,
    p_correct_index: q.correctIndex,
    p_explanation: q.explanation,
    p_in_daily: q.inDaily ?? true,
    p_assessment_only: q.assessmentOnly ?? false,
  });

export const postCourseEvent = async (e: { courseId: string; kind: "announcement" | "exam"; title: string; body: string; eventDate?: string | null }) => {
  const id = await call<string>("staff_post_event", { p_course_id: e.courseId, p_kind: e.kind, p_title: e.title, p_body: e.body, p_event_date: e.eventDate ?? null });
  notifyAnnouncement(id);
  return id;
};
export const deleteCourseContent = (kind: "material" | "question" | "event", id: string) => call<void>("staff_delete_course_content", { p_kind: kind, p_id: id });

// Teacher stats
export const fetchTopicProgress = (courseId: string) => call<{ member_count: number; topics: any[] }>("staff_topic_progress", { p_course_id: courseId });

// ── timed exams: practical, test, exam ──
export const fetchCourseExams = async (courseId: string) => (await call<ExamSummary[]>("list_course_exams", { p_course_id: courseId })) ?? [];
export const startExam = (examId: string) => call<ExamSession>("start_course_exam", { p_exam_id: examId });
export const submitExam = (examId: string, answers: (number | null)[]) => call<{ correct: number; total: number }>("submit_course_exam", { p_exam_id: examId, p_answers: answers });
export const reviewExam = async (examId: string) => (await call<ExamReviewItem[]>("review_course_exam", { p_exam_id: examId })) ?? [];
export const examSecondsLeft = (s: ExamSession, receivedAtMs: number) => secondsLeft(s.deadline, s.server_now, receivedAtMs);

export const scheduleExam = async (e: { courseId: string; title: string; kind: "practical" | "test" | "exam"; questionIds: string[]; topicId?: string | null; startsAt: Date; endsAt: Date; durationMinutes: number; reviewAfterSubmit?: boolean }) => {
  const r = await call<{ exam_id: string; event_id: string }>("staff_create_exam", {
    p_course_id: e.courseId,
    p_title: e.title,
    p_question_ids: e.questionIds,
    p_starts_at: e.startsAt.toISOString(),
    p_ends_at: e.endsAt.toISOString(),
    p_duration_minutes: e.durationMinutes,
    p_kind: e.kind,
    p_topic_id: e.topicId ?? null,
    p_review_after_submit: e.reviewAfterSubmit ?? false,
  });
  notifyAnnouncement(r.event_id);
  return r;
};
export const deleteExam = (examId: string) => call<void>("staff_delete_exam", { p_exam_id: examId });
export const fetchExamResults = (examId: string) => call<ExamResults>("staff_exam_results", { p_exam_id: examId });

// ── file attachments (supabase/022_material_files.sql) ──
const BUCKET = "course-files";
export async function uploadMaterialFile(f: { courseId: string; uri: string; name: string; size?: number | null; topic: string; title: string }): Promise<string> {
  const bad = validateFile(f.name, f.size);
  if (bad) throw new Error(bad);
  const mime = mimeFor(f.name)!;
  const buf = await (await fetch(f.uri)).arrayBuffer();
  if (buf.byteLength === 0) throw new Error("That file is empty.");
  if (buf.byteLength > MAX_FILE_BYTES) throw new Error("That file is too large (10 MB limit).");
  const path = storagePath(f.courseId, uid(), f.name);
  const up = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  try {
    return await call<string>("staff_add_file_material", { p_course_id: f.courseId, p_topic: f.topic, p_title: f.title, p_path: path, p_file_name: f.name });
  } catch (e) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw e;
  }
}
export async function materialFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw error ?? new Error("Couldn't open this file.");
  return data.signedUrl;
}
export const removeMaterialFile = (path: string) => supabase.storage.from(BUCKET).remove([path]).then(() => {}, () => {});

export async function removeCourseFiles(courseId: string): Promise<void> {
  try {
    const store = supabase.storage.from(BUCKET);
    for (let guard = 0; guard < 10; guard++) {
      const { data, error } = await store.list(courseId, { limit: 100 });
      if (error || !data?.length) return;
      const { error: rmErr } = await store.remove(data.map((o) => `${courseId}/${o.name}`));
      if (rmErr) return;
    }
  } catch { /* best effort */ }
}
