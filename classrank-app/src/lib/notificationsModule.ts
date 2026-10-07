import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import type * as NotificationsType from "expo-notifications";

/**
 * Single, safe entry point for `expo-notifications`.
 *
 * Since SDK 53, Expo Go on Android no longer includes push notifications, and merely *importing*
 * `expo-notifications` there throws a red-screen error ("Android Push notifications ... was removed
 * from Expo Go"). So we only load the module where it actually works:
 *   - development / production builds (EAS)        -> loaded
 *   - Expo Go on iOS                                -> loaded
 *   - Expo Go on Android, and web                   -> NOT loaded (`Notifications` is null)
 *
 * Every caller must handle `Notifications === null` (reminders/push simply do nothing there).
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const notificationsAvailable =
  Platform.OS !== "web" && !(isExpoGo && Platform.OS === "android");

let loaded: typeof NotificationsType | null = null;
if (notificationsAvailable) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    loaded = require("expo-notifications");
  } catch (err) {
    console.log("[notifications] expo-notifications unavailable:", err);
  }
}

export const Notifications = loaded;
export type NotificationResponse = NotificationsType.NotificationResponse;
