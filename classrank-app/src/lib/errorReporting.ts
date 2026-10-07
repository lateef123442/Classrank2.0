import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
let enabled = false;

/**
 * Call once, at app startup (see App.tsx). Safe to call even with no DSN
 * configured — it just stays disabled and captureException below becomes a
 * console.error fallback instead. This means the app works identically in
 * local development without you needing a Sentry account, but is one env
 * var away from real crash reporting in production.
 */
export function initErrorReporting() {
  if (!dsn) {
    if (__DEV__) {
      console.log("[errorReporting] No EXPO_PUBLIC_SENTRY_DSN set — crash reporting disabled.");
    }
    return;
  }
  try {
    Sentry.init({
      dsn,
      // Adjust for your traffic before shipping — 1.0 (100%) is fine for a
      // small pilot, but sampling down (e.g. 0.2) avoids eating your Sentry
      // quota once you have real usage.
      tracesSampleRate: 1.0,
      enableAutoSessionTracking: true,
    });
    enabled = true;
  } catch (err) {
    console.error("[errorReporting] Sentry.init failed:", err);
  }
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (enabled) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } else {
    // Fallback so errors are still visible somewhere during local dev.
    console.error("[errorReporting]", error, context);
  }
}

export function setUserContext(userId: string | null) {
  if (!enabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
