export interface DepartmentRow {
  id: string;
  name: string;
  faculty: string;
}

export type Role = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  name: string;
  university: string;
  department_id: string | null; // null only possible for admins
  department: string | null; // joined department name, for convenience
  faculty: string | null; // joined faculty name, for convenience
  year: number | null; // null for teachers/admins
  role: Role;
  total_points: number;
  current_streak: number;
  last_quiz_date: string | null;
  is_pro: boolean;
  pro_expires_at: string | null;
}

// The client only ever sees quiz_questions_public — never correct_index —
// until it submits an answer for grading (see submit_single_answer).
export interface QuizQuestionPublic {
  id: string;
  department_id: string;
  question: string;
  options: string[];
}

export interface SubmitAnswerResponse {
  is_correct: boolean;
  correct_index: number;
  points_earned: number;
  already_answered: boolean;
  total_points: number;
  new_streak: number;
}

export interface TeacherQuestion {
  id: string;
  department_id: string;
  quiz_date: string;
  question: string;
  options: string[];
  correct_index: number;
  has_attempts: boolean;
}

export interface TeacherStats {
  student_count: number;
  avg_points: number;
  today_question_count: number;
  today_completions: number;
}

export interface AdminStats {
  total_students: number;
  total_teachers: number;
  total_departments: number;
  total_points_awarded: number;
  by_department: {
    department: string;
    faculty: string;
    student_count: number;
    avg_points: number;
  }[];
}

export interface InviteCode {
  id: string;
  department_id: string;
  department_name: string;
  code: string;
  created_at: string;
  used_by: string | null;
  used_at: string | null;
}

export interface AdminUserResult {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  university: string;
}

export interface ReferralStats {
  referral_code: string;
  total_referred: number;
  total_rewarded: number;
}

export interface FeedPost {
  id: string;
  content: string;
  is_public: boolean;
  like_count: number;
  created_at: string;
  department_id: string;
  department: string;
  author_id: string;
  author_name: string;
  author_role: Role;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  points: number;
  department: string;
  faculty: string;
  is_pro: boolean;
  department_percentile?: number; // 0-1, only present on Faculty/Campus queries
}

