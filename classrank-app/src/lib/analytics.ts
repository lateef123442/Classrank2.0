import PostHog from "posthog-react-native";

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

let client: PostHog | null = null;

/**
 * Call once at app startup. Safe with no API key set — analytics calls
 * below just no-op, same pattern as errorReporting.ts and purchases.ts.
 */
export async function initAnalytics(): Promise<void> {
  if (!API_KEY) {
    if (__DEV__) console.log("[analytics] No EXPO_PUBLIC_POSTHOG_API_KEY set — analytics disabled.");
    return;
  }
  client = new PostHog(API_KEY, { host: HOST });
}

/**
 * Identifies the current user for all subsequent events. Deliberately
 * minimal traits — role, university, department — not name or email. The
 * privacy policy (legal/PRIVACY_POLICY.md) commits to not over-collecting;
 * analytics traits should honor that same restraint, not just the database
 * schema.
 */
export function identifyUser(userId: string, traits: { role: string; university?: string; department?: string }) {
  client?.identify(userId, traits);
}

export function track(event: string, properties?: Record<string, unknown>) {
  client?.capture(event, properties);
}

/** Call on sign-out/account deletion so events after logout aren't attributed to the previous user. */
export function resetAnalytics() {
  client?.reset();
}

// Event name constants — using these instead of raw strings at call sites
// keeps a single source of truth for what's actually being tracked, so
// "what events exist" is answerable by reading one file instead of
// grepping the whole codebase.
export const AnalyticsEvents = {
  SIGNUP_COMPLETED: "signup_completed",
  LOGIN_COMPLETED: "login_completed",
  QUIZ_COMPLETED: "quiz_completed",
  BADGE_EARNED: "badge_earned",
  POST_CREATED: "post_created",
  REFERRAL_SHARED: "referral_shared",
  UPGRADE_MODAL_VIEWED: "upgrade_modal_viewed",
  PURCHASE_COMPLETED: "purchase_completed",
} as const;
