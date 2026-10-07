import { useEffect } from "react";
import { Notifications, type NotificationResponse } from "../lib/notificationsModule";
import { useNavigation } from "@react-navigation/native";
import { useApp } from "../context/AppContext";
import { loadStudy, getStudyData, isStudyLoaded, subscribeStudy } from "../lib/studyStore";
import { registerPushToken, clearPushToken } from "../lib/notifications";

/**
 * Keeps this device's push registration in line with the student's "Class announcements & replies" setting:
 * registers when it's on, removes the token when it's off. Registration lives here (not at login) so a student
 * who opted out is never registered, even briefly. Uses a plain subscription so it doesn't re-render navigation.
 */
export function usePushRegistration() {
  const { profile } = useApp();
  const uid = profile?.id;
  useEffect(() => {
    if (!uid) return;
    let last: boolean | null = null;
    const check = () => {
      if (!isStudyLoaded()) return;
      const on = getStudyData().prefs.notif.push;
      if (on === last) return;
      last = on;
      if (on) registerPushToken(uid); else clearPushToken(uid);
    };
    const unsub = subscribeStudy(check);
    loadStudy().then(check);
    return unsub;
  }, [uid]);
}

const handled = new Set<string>(); // a launch notification can be reported again after a remount; open it once
/** Tapping a push opens the course or group it is about, including when it launched the app from closed. */
export function usePushTapNavigation() {
  const navigation = useNavigation<any>();
  useEffect(() => {
    if (!Notifications) return; // Expo Go on Android / web: nothing to listen to
    const N = Notifications;
    const open = (r: NotificationResponse | null | undefined) => {
      if (!r || handled.has(r.notification.request.identifier)) return;
      const d: any = r.notification.request.content.data;
      if (d?.type === "announcement" && d.courseId) navigation.navigate("Course", { courseId: d.courseId });
      else if (d?.type === "reply" && d.groupId) navigation.navigate("Group", { groupId: d.groupId });
      else return;
      handled.add(r.notification.request.identifier);
    };
    const sub = N.addNotificationResponseReceivedListener(open);
    // Newer SDKs expose a sync `getLastNotificationResponse`; older ones only the async variant.
    Promise.resolve()
      .then(() => ((N as any).getLastNotificationResponse ? (N as any).getLastNotificationResponse() : N.getLastNotificationResponseAsync()))
      .then(open)
      .catch(() => {});
    return () => sub.remove();
  }, [navigation]);
}
