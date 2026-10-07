import { supabase } from "./supabase";
import { notifyReply } from "./pushNotify";

export interface StudyGroup { id: string; name: string; description: string; owner_id: string; course_id: string | null; join_code: string | null; member_count: number; active_challenge: string | null }
export interface GroupPost { id: string; kind: "discussion" | "question" | "resource"; title: string; body: string; reply_count: number; created_at: string; author_id: string; author_name: string }
export interface GroupReply { id: string; body: string; created_at: string; author_id: string; author_name: string }
export interface Challenge { id: string; title: string; target_minutes: number; starts_on: string; ends_on: string }
export interface Standing { profile_id: string; name: string; minutes: number }

const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
};

export const fetchMyGroups = async () => (await call<StudyGroup[]>("my_study_groups")) ?? [];
export const createGroup = (name: string, description: string, courseId?: string | null) =>
  call<{ id: string; join_code: string }>("create_study_group", { p_name: name, p_description: description, p_course_id: courseId ?? null });
export const joinGroup = (code: string) => call<{ group_id: string; name: string }>("join_study_group", { p_code: code });
export const leaveGroup = (groupId: string) => call<void>("leave_study_group", { p_group_id: groupId });
export const deleteGroup = (groupId: string) => call<void>("delete_study_group", { p_group_id: groupId });

export const fetchPosts = async (groupId: string, before?: string) => (await call<GroupPost[]>("list_group_posts", { p_group_id: groupId, p_limit: 30, p_before: before ?? null })) ?? [];
export const createPost = (groupId: string, kind: GroupPost["kind"], title: string, body: string) => call<string>("create_group_post", { p_group_id: groupId, p_kind: kind, p_title: title, p_body: body });
export const deletePost = (postId: string) => call<void>("delete_group_post", { p_post_id: postId });
export const fetchReplies = async (postId: string) => (await call<GroupReply[]>("list_post_replies", { p_post_id: postId })) ?? [];
export const createReply = async (postId: string, body: string) => {
  const id = await call<string>("create_post_reply", { p_post_id: postId, p_body: body });
  notifyReply(id); // push to the post author and earlier repliers
  return id;
};

export const startChallenge = (groupId: string, title: string, targetMinutes: number, days: number) => call<string>("create_group_challenge", { p_group_id: groupId, p_title: title, p_target_minutes: targetMinutes, p_days: days });
export const fetchChallenge = (groupId: string) => call<Challenge | null>("current_group_challenge", { p_group_id: groupId });
export const fetchStandings = async (challengeId: string) => (await call<Standing[]>("challenge_standings", { p_challenge_id: challengeId })) ?? [];
export const reportChallengeProgress = (challengeId: string, minutes: number) => call<void>("report_challenge_progress", { p_challenge_id: challengeId, p_minutes: minutes });

// ── group quizzes (supabase/018_group_quizzes.sql) ──
export interface GroupQuizSummary { id: string; title: string; created_at: string; created_by: string; author_name: string; question_count: number; participants: number; my_result: { correct: number; total: number } | null }
export interface GroupQuizPlay { id: string; title: string; taken: boolean; questions: { q: string; options: string[] }[] }
export interface GroupQuizReviewItem { q: string; options: string[]; correct: number; explanation: string }
export interface QuizStanding { profile_id: string; name: string; correct: number; total: number; seconds: number }

export const fetchGroupQuizzes = async (groupId: string) => (await call<GroupQuizSummary[]>("list_group_quizzes", { p_group_id: groupId })) ?? [];
export const createGroupQuiz = (groupId: string, title: string, questions: { q: string; options: string[]; correct: number; explanation: string }[]) =>
  call<string>("create_group_quiz", { p_group_id: groupId, p_title: title, p_questions: questions });
export const fetchGroupQuiz = (quizId: string) => call<GroupQuizPlay>("get_group_quiz", { p_quiz_id: quizId });
export const submitGroupQuiz = (quizId: string, answers: (number | null)[], seconds: number) =>
  call<{ correct: number; total: number }>("submit_group_quiz", { p_quiz_id: quizId, p_answers: answers, p_seconds: seconds });
export const fetchQuizReview = async (quizId: string) => (await call<GroupQuizReviewItem[]>("review_group_quiz", { p_quiz_id: quizId })) ?? [];
export const fetchQuizStandings = async (quizId: string) => (await call<QuizStanding[]>("group_quiz_standings", { p_quiz_id: quizId })) ?? [];
export const deleteGroupQuiz = (quizId: string) => call<void>("delete_group_quiz", { p_quiz_id: quizId });
