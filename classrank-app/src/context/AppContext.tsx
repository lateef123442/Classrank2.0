import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  DepartmentRow,
  Profile,
  QuizQuestionPublic,
  LeaderboardEntry,
  SubmitAnswerResponse,
} from "../types";
import { isValidEmail, checkPasswordStrength } from "../utils/validation";
import { setUserContext } from "../lib/errorReporting";
import { scheduleStreakReminder, cancelStreakReminder, clearPushToken } from "../lib/notifications";
import { setStudyUser, wipeStudyData } from "../lib/studyStore";
import { flushStudySync } from "../lib/studySync";
import { clearStudyReminders } from "../lib/studyReminders";
import { loginPurchases, logoutPurchases } from "../lib/purchases";
import { getPasswordResetRedirectUrl } from "../lib/deepLinking";
import { identifyUser, track, resetAnalytics, AnalyticsEvents } from "../lib/analytics";

interface SignUpParams {
  email: string;
  password: string;
  name: string;
  university: string;
  departmentId: string;
  year: number;
  referralCode?: string;
}

interface SignUpTeacherParams {
  email: string;
  password: string;
  name: string;
  university: string;
  departmentId: string;
  inviteCode: string;
}

interface AppState {
  session: Session | null;
  profile: Profile | null;
  departments: DepartmentRow[];
  refreshDepartments: () => Promise<void>;
  initializing: boolean;
  passwordRecoveryMode: boolean;
  completePasswordRecovery: (newPassword: string) => Promise<boolean>;
  authError: string | null;
  authLoading: boolean;

  signUp: (params: SignUpParams) => Promise<boolean>;
  signUpTeacher: (params: SignUpTeacherParams) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  resetPassword: (email: string) => Promise<boolean>;
  clearAuthError: () => void;
  refreshProfileAfterPurchase: () => Promise<boolean>;

  todaysQuestions: QuizQuestionPublic[];
  answeredQuestionIds: Set<string>;
  quizLoading: boolean;
  quizError: string | null;
  hasCompletedTodaysQuiz: boolean;
  refreshTodaysQuestions: () => Promise<void>;
  submitAnswer: (questionId: string, selectedIndex: number) => Promise<SubmitAnswerResponse | null>;

  departmentLeaderboard: LeaderboardEntry[];
  facultyLeaderboard: LeaderboardEntry[];
  campusLeaderboard: LeaderboardEntry[];
  campusHasMore: boolean;
  loadMoreCampusLeaderboard: () => Promise<void>;
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  refreshLeaderboards: () => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

// Centralizes "is this a network problem vs. something else" so every screen
// doesn't have to re-derive its own user-facing error copy.
function toUserMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String((error as any).message);
    if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch")) {
      return "Can't reach the server. Check your connection and try again.";
    }
    return msg;
  }
  return fallback;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [todaysQuestions, setTodaysQuestions] = useState<QuizQuestionPublic[]>([]);
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set());
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const [departmentLeaderboard, setDepartmentLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [facultyLeaderboard, setFacultyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [campusLeaderboard, setCampusLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [campusHasMore, setCampusHasMore] = useState(false);
  const CAMPUS_PAGE_SIZE = 50;
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const hasCompletedTodaysQuiz = useMemo(
    () => todaysQuestions.length > 0 && answeredQuestionIds.size >= todaysQuestions.length,
    [todaysQuestions, answeredQuestionIds]
  );

  const refreshDepartments = useCallback(async () => {
    const { data, error } = await supabase.from("departments").select("*").order("name");
    if (!error && data) setDepartments(data as DepartmentRow[]);
  }, []);

  // ── Bootstrap ──
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: deptData, error: deptError } = await supabase
          .from("departments")
          .select("*")
          .order("name");
        if (deptError) throw deptError;
        if (mounted && deptData) setDepartments(deptData as DepartmentRow[]);

        const { data: sessionData } = await supabase.auth.getSession();
        if (mounted) setSession(sessionData.session);
      } catch (err) {
        // Departments failing to load at boot is serious enough to surface —
        // sign-up is impossible without them.
        if (mounted) setAuthError(toUserMessage(err, "Couldn't load app data. Pull to retry."));
      } finally {
        if (mounted) setInitializing(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") {
        // The session Supabase just set is a special recovery session —
        // valid only for calling updateUser({ password }), not for normal
        // app use. Route to SetNewPasswordScreen instead of letting
        // RootNavigator drop the user into their account under their old
        // password. See RootNavigator's routing logic.
        setPasswordRecoveryMode(true);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, departments(name, faculty)")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      setProfile(null);
      return;
    }

    const dept = (data as any).departments;
    setProfile({
      id: data.id,
      name: data.name,
      university: data.university,
      department_id: data.department_id,
      department: dept?.name ?? null,
      faculty: dept?.faculty ?? null,
      year: data.year,
      role: data.role,
      total_points: data.total_points,
      current_streak: data.current_streak,
      last_quiz_date: data.last_quiz_date,
      is_pro: data.is_pro,
      pro_expires_at: data.pro_expires_at,
    });
    identifyUser(data.id, { role: data.role, university: data.university, department: dept?.name });
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfile(session.user.id);
      setUserContext(session.user.id);
      setStudyUser(session.user.id); // study data is stored per account, so a shared phone never mixes students
      // (push registration is handled in usePushRegistration, which respects the student's opt-out)
      loginPurchases(session.user.id);
    } else {
      setProfile(null);
      setUserContext(null);
      setStudyUser(null);
    }
  }, [session, fetchProfile]);

  const clearAuthError = () => setAuthError(null);

  /**
   * The RevenueCat SDK confirms a purchase instantly (Apple/Google have
   * already charged the card), but our DB's is_pro mirror only updates once
   * the webhook Edge Function processes the event — usually near-instant,
   * but not guaranteed to beat this function call. A couple of short
   * retries absorbs that gap without a full polling system; if it still
   * hasn't landed after this, is_pro will catch up on the next natural
   * profile refresh (e.g. next app open) — the purchase itself already
   * succeeded regardless.
   */
  const refreshProfileAfterPurchase = async (): Promise<boolean> => {
    if (!session?.user?.id) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      await fetchProfile(session.user.id);
      const { data } = await supabase.from("profiles").select("is_pro").eq("id", session.user.id).maybeSingle();
      if (data?.is_pro) return true;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
    }
    return false;
  };

  // ── Auth actions ──
  const signUp = async ({ email, password, name, university, departmentId, year, referralCode }: SignUpParams) => {
    setAuthError(null);

    if (!isValidEmail(email)) {
      setAuthError("Enter a valid email address.");
      return false;
    }
    const pwCheck = checkPasswordStrength(password);
    if (!pwCheck.valid) {
      setAuthError(pwCheck.message ?? "Password is too weak.");
      return false;
    }
    if (!departments.some((d) => d.id === departmentId)) {
      setAuthError("Select a valid department.");
      return false;
    }

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error || !data.user) {
        setAuthError(toUserMessage(error, "Sign up failed. Try again."));
        return false;
      }

      // Routed through an RPC (not a direct client upsert) so an optional
      // referral code can be validated and resolved to a real referrer
      // server-side — trusting a client-supplied `referred_by` value would
      // let anyone fabricate a referral for free points once vesting-eligible.
      const { error: rpcError } = await supabase.rpc("complete_student_signup", {
        p_name: name.trim(),
        p_university: university.trim(),
        p_department_id: departmentId,
        p_year: year,
        p_referral_code: referralCode?.trim() || null,
      });

      if (rpcError) {
        setAuthError(toUserMessage(rpcError, "Account created, but saving your profile failed. Try logging in."));
        return false;
      }

      if (data.session) {
        setSession(data.session);
        await fetchProfile(data.user.id);
        track(AnalyticsEvents.SIGNUP_COMPLETED, { role: "student" });
      } else {
        setAuthError("Check your email to confirm your account, then log in.");
      }
      return true;
    } catch (err) {
      setAuthError(toUserMessage(err, "Something went wrong. Try again."));
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const signUpTeacher = async ({ email, password, name, university, departmentId, inviteCode }: SignUpTeacherParams) => {
    setAuthError(null);

    if (!isValidEmail(email)) {
      setAuthError("Enter a valid email address.");
      return false;
    }
    const pwCheck = checkPasswordStrength(password);
    if (!pwCheck.valid) {
      setAuthError(pwCheck.message ?? "Password is too weak.");
      return false;
    }
    if (!departments.some((d) => d.id === departmentId)) {
      setAuthError("Select a valid department.");
      return false;
    }
    if (inviteCode.trim().length === 0) {
      setAuthError("Enter the invite code your department admin gave you.");
      return false;
    }

    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error || !data.user) {
        setAuthError(toUserMessage(error, "Sign up failed. Try again."));
        return false;
      }

      const { error: rpcError } = await supabase.rpc("complete_teacher_signup", {
        p_name: name.trim(),
        p_university: university.trim(),
        p_department_id: departmentId,
        p_code: inviteCode.trim(),
      });

      if (rpcError) {
        // The auth user now exists but has no profile yet — they can retry
        // with a correct code and log in normally afterward.
        setAuthError(toUserMessage(rpcError, "That invite code didn't work."));
        return false;
      }

      if (data.session) {
        setSession(data.session);
        await fetchProfile(data.user.id);
        track(AnalyticsEvents.SIGNUP_COMPLETED, { role: "teacher" });
      } else {
        setAuthError("Check your email to confirm your account, then log in.");
      }
      return true;
    } catch (err) {
      setAuthError(toUserMessage(err, "Something went wrong. Try again."));
      return false;
    } finally {
      setAuthLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    if (!isValidEmail(email)) {
      setAuthError("Enter a valid email address.");
      return false;
    }
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setAuthError(toUserMessage(error, "Log in failed."));
        return false;
      }
      setSession(data.session);
      track(AnalyticsEvents.LOGIN_COMPLETED);
      return true;
    } finally {
      setAuthLoading(false);
    }
  };

  const signOut = async () => {
    // Order matters: detach this phone from the account while still signed in, and drop its scheduled reminders
    // so the next person to sign in here doesn't receive them.
    await flushStudySync(); // last chance to back up (needs the session, so it comes first; capped at a few seconds)
    await clearPushToken(session?.user?.id);
    await clearStudyReminders();
    await supabase.auth.signOut();
    await cancelStreakReminder();
    await logoutPurchases();
    resetAnalytics();
    setSession(null);
    setProfile(null);
    setTodaysQuestions([]);
    setAnsweredQuestionIds(new Set());
  };

  const deleteAccount = async (): Promise<boolean> => {
    try {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) {
        setAuthError(toUserMessage(error, "Couldn't delete your account. Try again."));
        return false;
      }
      // The auth user no longer exists server-side, so the local session is
      // now invalid — clear it client-side rather than waiting for the next
      // failed refresh to surface a confusing error.
      await supabase.auth.signOut();
      await cancelStreakReminder();
      await clearStudyReminders();
      await wipeStudyData(); // the account is gone, so is its on-device study data
      await logoutPurchases();
      resetAnalytics();
      setSession(null);
      setProfile(null);
      setTodaysQuestions([]);
      setAnsweredQuestionIds(new Set());
      return true;
    } catch (err) {
      setAuthError(toUserMessage(err, "Couldn't delete your account. Try again."));
      return false;
    }
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    if (!isValidEmail(email)) {
      setAuthError("Enter a valid email address first.");
      return false;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    if (error) {
      setAuthError(toUserMessage(error, "Couldn't send reset email."));
      return false;
    }
    setAuthError("Password reset email sent — check your inbox.");
    return true;
  };

  const completePasswordRecovery = async (newPassword: string): Promise<boolean> => {
    setAuthError(null);
    const pwCheck = checkPasswordStrength(newPassword);
    if (!pwCheck.valid) {
      setAuthError(pwCheck.message ?? "Password is too weak.");
      return false;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setAuthError(toUserMessage(error, "Couldn't update your password. Try again."));
      return false;
    }
    setPasswordRecoveryMode(false);
    return true;
  };

  // ── Quiz actions ──
  const refreshTodaysQuestions = useCallback(async () => {
    if (!profile || profile.role !== "student" || !profile.department_id) return;
    setQuizLoading(true);
    setQuizError(null);

    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data: questions, error: qError } = await supabase
        .from("quiz_questions_public")
        .select("*")
        .eq("department_id", profile.department_id)
        .eq("quiz_date", today);

      if (qError) throw qError;
      const list = (questions as QuizQuestionPublic[]) ?? [];
      setTodaysQuestions(list);

      if (list.length > 0) {
        const { data: attempts, error: aError } = await supabase
          .from("quiz_attempts")
          .select("question_id")
          .eq("profile_id", profile.id)
          .in(
            "question_id",
            list.map((q) => q.id)
          );
        if (aError) throw aError;
        setAnsweredQuestionIds(new Set((attempts ?? []).map((a) => a.question_id as string)));
      } else {
        setAnsweredQuestionIds(new Set());
      }
    } catch (err) {
      setQuizError(toUserMessage(err, "Couldn't load today's quiz."));
    } finally {
      setQuizLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role === "student") refreshTodaysQuestions();
    // Deliberately only re-runs when the department/profile identity changes,
    // not on every profile field update (see submitAnswer's local patch below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.department_id, profile?.role]);

  // Streak-risk reminder: reschedule for the next 6 PM whenever completion
  // status changes. Runs after refreshTodaysQuestions resolves (i.e. once
  // hasCompletedTodaysQuiz reflects real server state), not eagerly on
  // login, so it doesn't schedule a nag before we actually know whether one
  // is warranted.
  useEffect(() => {
    if (profile?.role !== "student") return;
    if (quizLoading) return;

    if (todaysQuestions.length > 0 && !hasCompletedTodaysQuiz) {
      scheduleStreakReminder(profile.department ?? "your department");
    } else {
      cancelStreakReminder();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, profile?.department, hasCompletedTodaysQuiz, todaysQuestions.length, quizLoading]);

  const submitAnswer = async (questionId: string, selectedIndex: number): Promise<SubmitAnswerResponse | null> => {
    try {
      const { data, error } = await supabase.rpc("submit_single_answer", {
        p_question_id: questionId,
        p_selected_index: selectedIndex,
      });
      if (error) {
        setQuizError(toUserMessage(error, "Couldn't submit your answer. Try again."));
        return null;
      }

      const result = data as SubmitAnswerResponse;

      setAnsweredQuestionIds((prev) => new Set(prev).add(questionId));
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              total_points: result.total_points,
              current_streak: result.new_streak,
              last_quiz_date: new Date().toISOString().slice(0, 10),
            }
          : prev
      );

      return result;
    } catch (err) {
      setQuizError(toUserMessage(err, "Couldn't submit your answer. Try again."));
      return null;
    }
  };

  // ── Leaderboard actions ──
  const refreshLeaderboards = useCallback(async () => {
    if (!profile || profile.role !== "student") return;
    setLeaderboardLoading(true);
    setLeaderboardError(null);

    try {
      const [deptRes, facultyRes, campusRes] = await Promise.all([
        supabase.from("leaderboard").select("*").eq("department", profile.department).order("points", { ascending: false }),
        supabase
          .from("leaderboard_normalized")
          .select("*")
          .eq("faculty", profile.faculty)
          .order("department_percentile", { ascending: false })
          .order("points", { ascending: false }),
        supabase
          .from("leaderboard_normalized")
          .select("*")
          .order("department_percentile", { ascending: false })
          .order("points", { ascending: false })
          .range(0, CAMPUS_PAGE_SIZE - 1),
      ]);

      if (deptRes.error) throw deptRes.error;
      if (facultyRes.error) throw facultyRes.error;
      if (campusRes.error) throw campusRes.error;

      setDepartmentLeaderboard((deptRes.data as LeaderboardEntry[]) ?? []);
      setFacultyLeaderboard((facultyRes.data as LeaderboardEntry[]) ?? []);
      const campusData = (campusRes.data as LeaderboardEntry[]) ?? [];
      setCampusLeaderboard(campusData);
      setCampusHasMore(campusData.length === CAMPUS_PAGE_SIZE);
    } catch (err) {
      setLeaderboardError(toUserMessage(err, "Couldn't load the leaderboard."));
    } finally {
      setLeaderboardLoading(false);
    }
  }, [profile?.id, profile?.department, profile?.faculty]);

  const loadMoreCampusLeaderboard = async () => {
    if (!campusHasMore) return;
    try {
      const { data, error } = await supabase
        .from("leaderboard_normalized")
        .select("*")
        .order("department_percentile", { ascending: false })
        .order("points", { ascending: false })
        .range(campusLeaderboard.length, campusLeaderboard.length + CAMPUS_PAGE_SIZE - 1);

      if (error) throw error;
      const next = (data as LeaderboardEntry[]) ?? [];
      setCampusLeaderboard((prev) => [...prev, ...next]);
      setCampusHasMore(next.length === CAMPUS_PAGE_SIZE);
    } catch (err) {
      setLeaderboardError(toUserMessage(err, "Couldn't load more of the leaderboard."));
    }
  };

  useEffect(() => {
    if (profile?.role === "student") refreshLeaderboards();
    // Refetches whenever points/streak change too (profile is a new object
    // reference each time submitAnswer patches it), which keeps rank fresh
    // right after a quiz. For a high-traffic production deployment, consider
    // debouncing this or moving to realtime subscriptions instead of refetch
    // on every point change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const value: AppState = {
    session,
    profile,
    departments,
    refreshDepartments,
    initializing,
    passwordRecoveryMode,
    completePasswordRecovery,
    authError,
    authLoading,
    signUp,
    signUpTeacher,
    signIn,
    signOut,
    deleteAccount,
    resetPassword,
    clearAuthError,
    refreshProfileAfterPurchase,
    todaysQuestions,
    answeredQuestionIds,
    quizLoading,
    quizError,
    hasCompletedTodaysQuiz,
    refreshTodaysQuestions,
    submitAnswer,
    departmentLeaderboard,
    facultyLeaderboard,
    campusLeaderboard,
    campusHasMore,
    loadMoreCampusLeaderboard,
    leaderboardLoading,
    leaderboardError,
    refreshLeaderboards,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
