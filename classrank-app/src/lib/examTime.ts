// Pure helpers for timed exams (no React / Supabase imports so they can be unit-tested).

/** Seconds left, anchored to the SERVER's clock: the phone's own clock can only matter through elapsed time since the response arrived. */
export function secondsLeft(deadlineIso: string, serverNowIso: string, receivedAtMs: number, nowMs = Date.now()): number {
  const remainingAtReceipt = new Date(deadlineIso).getTime() - new Date(serverNowIso).getTime();
  return Math.max(0, Math.floor((remainingAtReceipt - (nowMs - receivedAtMs)) / 1000));
}

/** "YYYY-MM-DD" + "HH:MM" in the device's local time zone → Date, or null if either part is invalid. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!d || !t) return null;
  const [y, mo, da] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const out = new Date(y, mo - 1, da, Number(t[1]), Number(t[2]), 0, 0);
  // reject rollovers like 2026-02-31
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== da) return null;
  return out;
}

/** Returns an error message, or null when the schedule is acceptable. */
export function validateExamSchedule(opts: { title: string; starts: Date | null; ends: Date | null; duration: number; questionCount: number; now?: Date }): string | null {
  const now = opts.now ?? new Date();
  if (!opts.title.trim()) return "Give the exam a title.";
  if (opts.questionCount < 3) return "Pick at least 3 questions.";
  if (opts.questionCount > 60) return "An exam can have at most 60 questions.";
  if (!opts.starts) return "Enter the opening date (YYYY-MM-DD) and time (HH:MM).";
  if (!opts.ends) return "Enter the closing date (YYYY-MM-DD) and time (HH:MM).";
  if (!Number.isInteger(opts.duration) || opts.duration < 5 || opts.duration > 240) return "Duration must be 5 to 240 minutes.";
  if (opts.ends.getTime() <= opts.starts.getTime()) return "The exam must close after it opens.";
  if (opts.ends.getTime() <= now.getTime()) return "The closing time is already in the past.";
  if ((opts.ends.getTime() - opts.starts.getTime()) / 60000 < opts.duration) return "The open window is shorter than the exam duration.";
  return null;
}

export const fmtClock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
export const fmtWhen = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
