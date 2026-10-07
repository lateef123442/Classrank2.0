import { supabase } from "./supabase";
import type { Question } from "./studyTypes";

/** Asks the study-companion Edge Function for MCQs, then validates every item before it touches the question bank. */
export interface FileInfo { used: number; skipped: number }
/** `files` are storage paths of course files (max 3 are read); `onFiles` reports how many the server could actually read. */
export async function generateQuestions(opts: { subject: string; topic?: string; notes?: string; count?: number; files?: string[]; onFiles?: (i: FileInfo) => void }):
  Promise<Omit<Question, "id" | "subjectId" | "topicId">[]> {
  const { onFiles, ...rest } = opts;
  const { data, error } = await supabase.functions.invoke("study-companion", { body: { task: "questions", ...rest } });
  if (onFiles && data) onFiles({ used: Number(data.files_used) || 0, skipped: Number(data.files_skipped) || 0 });
  if (error || !Array.isArray(data?.questions)) throw error ?? new Error("bad response");
  const ok = (data.questions as any[]).filter((x) =>
    typeof x?.q === "string" && Array.isArray(x.options) && x.options.length === 4 && x.options.every((o: any) => typeof o === "string") &&
    Number.isInteger(x.correct) && x.correct >= 0 && x.correct <= 3);
  if (!ok.length) throw new Error("no valid questions");
  return ok.map((x) => ({ q: x.q.trim(), options: x.options.map((o: string) => o.trim()), correct: x.correct, explanation: String(x.explanation ?? "").trim(), source: "ai" as const }));
}

/** Flashcards from a topic and/or the student's notes. Same validation approach as generateQuestions. */
export async function generateFlashcards(opts: { subject: string; topic?: string; notes?: string; count?: number; files?: string[]; onFiles?: (i: FileInfo) => void }): Promise<{ front: string; back: string }[]> {
  const { onFiles, ...rest } = opts;
  const { data, error } = await supabase.functions.invoke("study-companion", { body: { task: "flashcards", ...rest } });
  if (onFiles && data) onFiles({ used: Number(data.files_used) || 0, skipped: Number(data.files_skipped) || 0 });
  if (error || !Array.isArray(data?.cards)) throw error ?? new Error("bad response");
  const ok = (data.cards as any[]).filter((x) => typeof x?.front === "string" && typeof x?.back === "string" && x.front.trim() && x.back.trim());
  if (!ok.length) throw new Error("no valid cards");
  return ok.map((x) => ({ front: x.front.trim(), back: x.back.trim() }));
}
