import { Platform } from "react-native";
import Purchases, { PurchasesOffering, CustomerInfo } from "react-native-purchases";

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

let configured = false;

/**
 * Configures the RevenueCat SDK once per app launch. Safe to call with no
 * keys set (e.g. local dev without a RevenueCat project yet) — it just logs
 * and leaves `configured` false, and every other function in this file
 * checks that flag before touching the SDK.
 */
export function configurePurchases() {
  if (configured) return;
  const apiKey = Platform.OS === "ios" ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    console.log("[purchases] No RevenueCat API key set — Go Pro paywall will show an error state.");
    return;
  }
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * Call right after login. This sets RevenueCat's app_user_id to our own
 * Supabase user id, which is what lets the webhook Edge Function
 * (supabase/functions/revenuecat-webhook) map a purchase event back to the
 * right `profiles` row. Without this, RevenueCat would use its own
 * anonymous id and the webhook would have nothing to match against.
 */
export async function loginPurchases(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.log("[purchases] logIn failed:", err);
  }
}

export async function logoutPurchases(): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // No-op: throws if already logged out, which is fine.
  }
}

export async function getProOffering(): Promise<PurchasesOffering | null> {
  if (!configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch (err) {
    console.log("[purchases] getOfferings failed:", err);
    return null;
  }
}

export async function purchasePackage(pkg: NonNullable<PurchasesOffering["availablePackages"]>[number]): Promise<{
  success: boolean;
  cancelled: boolean;
  error?: string;
}> {
  try {
    await Purchases.purchasePackage(pkg);
    return { success: true, cancelled: false };
  } catch (err: any) {
    if (err?.userCancelled) {
      return { success: false, cancelled: true };
    }
    return { success: false, cancelled: false, error: err?.message ?? "Purchase failed" };
  }
}

export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.restorePurchases();
  } catch (err) {
    console.log("[purchases] restorePurchases failed:", err);
    return null;
  }
}
