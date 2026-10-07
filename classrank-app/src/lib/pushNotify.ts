import { supabase } from "./supabase";

// Asks the `notify` Edge Function to push an announcement / reply to the right people. Fire-and-forget:
// the post itself already succeeded, so a failed push must never surface as an error. The function is idempotent
// (it marks each event as notified), so it's safe to call more than once.
const send = async (body: Record<string, string>) => {
  try { await supabase.functions.invoke("notify", { body }); } catch (e) { console.log("[push] notify skipped:", e); }
};
export const notifyAnnouncement = (eventId: string) => send({ kind: "announcement", eventId });
export const notifyReply = (replyId: string) => send({ kind: "reply", replyId });
