// Supabase Edge Function: receives RevenueCat webhook events and updates
// profiles.is_pro / pro_expires_at accordingly.
//
// This is the ONLY place is_pro is ever written (besides the initial
// `default false`) — never trust the client for entitlement status. This
// function uses the SERVICE ROLE key, which bypasses RLS entirely and can
// write is_pro directly even though that column is locked down against the
// `authenticated` role (see 016_subscriptions.sql). The service role key
// must be set as an Edge Function secret, never shipped in the app.
//
// Deploy with:
//   supabase functions deploy revenuecat-webhook
//   supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-shared-secret
//
// Then in the RevenueCat dashboard (Project Settings -> Integrations ->
// Webhooks), set the URL to this function's URL and the "Authorization
// header value" to the same REVENUECAT_WEBHOOK_SECRET — RevenueCat sends it
// back on every request, which is how we verify a request actually came
// from RevenueCat and not an attacker who found the URL.
//
// RevenueCat's app_user_id MUST be set to the Supabase auth user id for the
// `profiles.id` lookup below to work — see src/lib/purchases.ts, which
// calls Purchases.logIn(supabaseUserId) right after login for exactly this
// reason.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("REVENUECAT_WEBHOOK_SECRET")!;

// Event types that mean "this user should be Pro right now."
const ACTIVE_EVENT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "UNCANCELLATION"]);
// Event types that mean "this user's Pro access ended."
const INACTIVE_EVENT_TYPES = new Set(["EXPIRATION"]);
// CANCELLATION means "won't renew" but the user keeps access until
// expiration_at_ms — handled the same as an active event below, since
// expiration_at_ms is what actually gates access via pro_expires_at_active().

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const event = payload?.event;
  if (!event?.app_user_id || !event?.type) {
    return new Response("Missing event fields", { status: 400 });
  }

  const supabaseUserId: string = event.app_user_id;
  const eventType: string = event.type;
  const expirationAtMs: number | null = event.expiration_at_ms ?? null;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (ACTIVE_EVENT_TYPES.has(eventType) || eventType === "CANCELLATION") {
    const { error } = await supabase
      .from("profiles")
      .update({
        is_pro: true,
        pro_expires_at: expirationAtMs ? new Date(expirationAtMs).toISOString() : null,
      })
      .eq("id", supabaseUserId);

    if (error) {
      console.error("Failed to update profile (active event):", error);
      return new Response("DB update failed", { status: 500 });
    }
  } else if (INACTIVE_EVENT_TYPES.has(eventType)) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_pro: false })
      .eq("id", supabaseUserId);

    if (error) {
      console.error("Failed to update profile (expiration event):", error);
      return new Response("DB update failed", { status: 500 });
    }
  } else {
    // Other event types (BILLING_ISSUE, TRANSFER, etc.) are logged but not
    // acted on in this minimal implementation — expand as needed.
    console.log(`Unhandled RevenueCat event type: ${eventType}`);
  }

  return new Response("OK", { status: 200 });
});
