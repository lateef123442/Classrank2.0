import * as Linking from "expo-linking";
import { supabase } from "./supabase";

/**
 * Handles the incoming deep link from a password-reset email. Supabase's
 * reset email points at `<redirectTo>?code=...`; exchangeCodeForSession
 * trades that one-time code for a real session (this only works because
 * the client is configured with flowType: "pkce" — see supabase.ts).
 *
 * Once this succeeds, supabase-js fires an onAuthStateChange event with
 * event === "PASSWORD_RECOVERY" (see AppContext), which is what tells the
 * app to show SetNewPasswordScreen instead of dropping the user straight
 * into their account under their old password.
 */
async function handleUrl(url: string | null) {
  if (!url) return;
  if (!url.includes("code=")) return; // not an auth deep link — ignore

  try {
    const { error } = await supabase.auth.exchangeCodeForSession(url);
    if (error) {
      console.log("[deepLinking] exchangeCodeForSession failed:", error.message);
    }
  } catch (err) {
    console.log("[deepLinking] exchangeCodeForSession threw:", err);
  }
}

/**
 * Call once at app startup. Handles both a cold start via the link (app
 * wasn't running) and the app already being open when the link is tapped.
 */
export function initDeepLinking(): () => void {
  Linking.getInitialURL().then(handleUrl);

  const subscription = Linking.addEventListener("url", (event) => {
    handleUrl(event.url);
  });

  return () => subscription.remove();
}

/** The URL the password-reset email should redirect back to. */
export function getPasswordResetRedirectUrl(): string {
  return Linking.createURL("reset-password");
}
