import { supabase } from "./supabase";
import { TeacherQuestion, TeacherStats } from "../types";

export async function fetchTeacherStats(departmentId: string): Promise<TeacherStats> {
  const { data, error } = await supabase.rpc("teacher_department_stats", { p_department_id: departmentId });
  if (error) throw error;
  return data as TeacherStats;
}

export async function fetchTeacherQuestions(departmentId: string, quizDate?: string): Promise<TeacherQuestion[]> {
  const { data, error } = await supabase.rpc("teacher_list_questions", {
    p_department_id: departmentId,
    p_quiz_date: quizDate ?? null,
  });
  if (error) throw error;
  return (data as TeacherQuestion[]) ?? [];
}

export interface UpsertQuestionInput {
  id?: string | null;
  departmentId: string;
  quizDate: string; // YYYY-MM-DD
  question: string;
  options: string[];
  correctIndex: number;
}

export async function upsertQuestion(input: UpsertQuestionInput): Promise<string> {
  const { data, error } = await supabase.rpc("teacher_upsert_question", {
    p_id: input.id ?? null,
    p_department_id: input.departmentId,
    p_quiz_date: input.quizDate,
    p_question: input.question,
    p_options: input.options,
    p_correct_index: input.correctIndex,
  });
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.rpc("teacher_delete_question", { p_id: questionId });
  if (error) throw error;
}
