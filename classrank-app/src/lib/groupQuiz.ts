// Pure helper: turn some of a student's own practice questions into a shareable group quiz payload.
import { StudyData } from "./studyTypes";

export interface QuizItem { q: string; options: string[]; correct: number; explanation: string }
export const MIN_GROUP_QUIZ = 3;

/** Random selection from one subject's question bank. Returns [] when there aren't enough questions. */
export function pickQuizQuestions(d: StudyData, subjectId: string, count: number, rand: () => number = Math.random): QuizItem[] {
  const pool = d.questions.filter((x) => x.subjectId === subjectId && x.options.length === 4);
  if (pool.length < MIN_GROUP_QUIZ) return [];
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, Math.min(count, 20)).map((x) => ({ q: x.q, options: x.options, correct: x.correct, explanation: x.explanation }));
}
