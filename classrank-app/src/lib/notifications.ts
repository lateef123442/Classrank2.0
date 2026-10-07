import { Notifications } from "./notificationsModule";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { loadStudy, getStudyData, shiftOutOfQuiet } from "./studyStore";

const STREAK_REMINDER_ID = "streak-risk-reminder";
const REMINDER_HOUR = 18; // 6 PM — matches the "Retention Loop" spec from the original business plan.

// Controls how a notification behaves while the app is in the foreground.
// Shown as a banner even if the app is open, since a streak reminder is
// exactly the kind of thing worth surfacing immediately rather than only
// when backgrounded.
let muted = false;
/** Study Mode turns this on so ClassRank's own notifications never interrupt reading. */
export function setNotificationsMuted(value: boolean) {
  muted = value;
}

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: !muted,
    shouldShowList: !muted,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (!Notifications) return false; // Expo Go on Android / web: notifications aren't available
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Schedules (or reschedules) the streak-risk reminder for the next 6 PM —
 * today's if it hasn't passed yet, tomorrow's otherwise. Always cancels any
 * previously scheduled reminder first, so calling this repeatedly (e.g. on
 * every app foreground) doesn't stack up duplicate notifications.
 *
 * This is a *local* notification — scheduled entirely on-device via
 * expo-notifications, no server round-trip and no push token needed. That's
 * deliberate: it's simple, works offline, and doesn't depend on
 * infrastructure that isn't built yet (see registerPushToken below for the
 * distinction).
 */
export async function scheduleStreakReminder(departmentName: string): Promise<void> {
  if (!Notifications) return;
  await cancelStreakReminder();

  const granted = await requestNotificationPermissions();
  if (!granted) return;

  let target = new Date();
  target.setHours(REMINDER_HOUR, 0, 0, 0);
  if (target.getTime() <= Date.now()) {
    target.setDate(target.getDate() + 1);
  }
  // Honour the student's quiet hours (set in Study setup): if the reminder would land inside them, wait until they end.
  await loadStudy();
  target = shiftOutOfQuiet(getStudyData().prefs, target);

  await Notifications.scheduleNotificationAsync({
    identifier: STREAK_REMINDER_ID,
    content: {
      title: "Protect your streak 🔥",
      body: `You haven't taken today's ${departmentName} quiz yet — a couple of minutes keeps it alive.`,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

/** Call this once a student completes today's quiz — no need to nag them further today. */
export async function cancelStreakReminder(): Promise<void> {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_REMINDER_ID);
  } catch {
    // No-op: throws if nothing was scheduled under that identifier, which is expected most of the time.
  }
}

/**
 * Registers this device for push notifications and stores the token on the
 * user's profile. This is groundwork for a *future* feature (e.g. a teacher
 * publishing an announcement that pushes to their department) — the
 * server-side sending mechanism (a Supabase Edge Function calling Expo's
 * push API) is not built yet. This function only captures and stores the
 * token so that future piece has something to target.
 *
 * Silently no-ops on simulators/emulators (push tokens require a physical
 * device) and in Expo Go for SDK versions where remote push requires a
 * development build — failures here are expected in some environments and
 * shouldn't interrupt the rest of the app.
 */
export async function registerPushToken(userId: string): Promise<void> {
  try {
    if (!Notifications) return; // not available in Expo Go on Android / web
    if (!Device.isDevice) return; // simulators/emulators can't get a real push token

    const granted = await requestNotificationPermissions();
    if (!granted) return;

    // Android 13+ needs the channel to exist before a token is requested.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = "REPLACE_WITH_YOUR_EAS_PROJECT_ID"; // see app.json extra.eas.projectId
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId && projectId !== "REPLACE_WITH_YOUR_EAS_PROJECT_ID" ? { projectId } : undefined
    );

    // The RPC also detaches this token from any other account that still holds it (shared phone). The direct
    // update is only a fallback for databases where migration 019 hasn't been applied yet.
    const { error } = await supabase.rpc("register_push_token", { p_token: tokenResponse.data });
    if (error) await supabase.from("profiles").update({ expo_push_token: tokenResponse.data }).eq("id", userId);
  } catch (err) {
    // Deliberately swallowed: push registration is a nice-to-have, not
    // something that should block sign-in or surface an error to the user.
    console.log("[notifications] push token registration skipped:", err);
  }
}

/** Stop sending pushes to this account (sign-out, or the student turned announcements/replies off). */
export async function clearPushToken(userId?: string): Promise<void> {
  try {
    const { error } = await supabase.rpc("clear_push_token");
    if (error && userId) await supabase.from("profiles").update({ expo_push_token: null }).eq("id", userId);
  } catch (err) {
    console.log("[notifications] clear push token skipped:", err);
  }
}
