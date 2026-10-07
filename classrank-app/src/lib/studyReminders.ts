import { Notifications } from "./notificationsModule";
import { Platform } from "react-native";
import {
  StudyData, dateStr, addDaysStr, addMinutesToTime, fmtTime12,
} from "./studyTypes";
import { subjectName, dueCards, dueTopics, inQuietHours, shiftOutOfQuiet, attemptedToday } from "./studyInsights";

const PREFIX = "study-";

const at = (date: string, time: string) => { const [h, m] = time.split(":").map(Number); const d = new Date(date + "T00:00:00"); d.setHours(h, m, 0, 0); return d; };

/** Cancels every scheduled study reminder (called on sign-out so the next user doesn't get this one's). */
export async function clearStudyReminders(): Promise<void> {
  try {
    if (Platform.OS === "web" || !Notifications) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(existing.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* nothing to clear */ }
}

/**
 * Rebuilds every study notification from the current data + preferences. Cancelling then
 * re-scheduling (rather than patching) keeps it correct: finishing a session removes its
 * "you missed it" nudge, rescheduling moves its reminder, turning a type off clears it.
 * Never prompts for permission — that happens in the setup screen when a toggle is turned on.
 */
export async function syncStudyReminders(d: StudyData): Promise<void> {
  try {
    if (Platform.OS === "web" || !Notifications) return;
    const existing = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(existing.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const { prefs } = d;
    const now = Date.now();
    const jobs: { id: string; when: Date; title: string; body: string; shiftOutOfQuiet: boolean }[] = [];

    d.sessions.filter((s) => s.status === "planned" && s.date >= dateStr()).forEach((s) => {
      const time = s.time ?? prefs.preferredTime;
      const name = subjectName(d, s.subjectId);
      if (prefs.notif.sessions) jobs.push({ id: `${PREFIX}start-${s.id}`, when: new Date(at(s.date, time).getTime() - 10 * 60000), title: "Study session soon", body: `Your ${name} session starts in 10 minutes. Ready?`, shiftOutOfQuiet: false });
      // Only nudges if it's still "planned" 30 min later — any status change re-syncs and removes this.
      if (prefs.notif.missed) jobs.push({ id: `${PREFIX}missed-${s.id}`, when: new Date(at(s.date, time).getTime() + (s.minutes + 30) * 60000), title: "Missed a session?", body: `You haven't done ${name} yet. Want to move it to ${fmtTime12(addMinutesToTime(time, 120))}?`, shiftOutOfQuiet: true });
    });

    if (prefs.notif.dailyQuiz && d.questions.length >= 3) {
      for (let i = 0; i < 3; i++) {
        const date = addDaysStr(i);
        if (i === 0 && attemptedToday(d, "daily")) continue;
        jobs.push({ id: `${PREFIX}daily-${date}`, when: at(date, addMinutesToTime(prefs.preferredTime, -30)), title: "Daily challenge", body: "Your daily quiz is waiting. Five questions, a few minutes.", shiftOutOfQuiet: true });
      }
    }

    if (prefs.notif.reviews) {
      const topic = dueTopics(d)[0];
      const cards = dueCards(d).length;
      if (topic || cards) {
        jobs.push({
          id: `${PREFIX}review`, when: at(dateStr(), "17:00"), shiftOutOfQuiet: true, title: "Quick review",
          body: topic ? `You haven't reviewed ${topic.name} recently. A quick 5-minute review could help.` : `${cards} flashcard${cards > 1 ? "s are" : " is"} due. A few minutes keeps them fresh.`,
        });
      }
    }

    let scheduled = 0;
    for (const j of jobs.sort((a, b) => +a.when - +b.when)) {
      let when = j.when;
      if (inQuietHours(prefs, when)) {
        if (!j.shiftOutOfQuiet) continue; // a "starts in 10 min" alert is useless later, so drop it
        when = shiftOutOfQuiet(prefs, when);
      }
      if (when.getTime() <= now + 30000) continue;
      if (scheduled++ >= 40) break; // iOS caps pending local notifications at 64
      await Notifications.scheduleNotificationAsync({ identifier: j.id, content: { title: j.title, body: j.body }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when } });
    }
  } catch (e) {
    console.log("[studyReminders] sync skipped:", e);
  }
}
