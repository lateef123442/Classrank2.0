// Sends Expo push notifications for two events:
//   { kind: "announcement", eventId }  — a teacher posted an announcement / exam date in a course  → all course members
//   { kind: "reply", replyId }         — someone replied in a study group                           → the post's author + earlier repliers
//
// Deploy:  supabase functions deploy notify
// Needs no extra secrets (SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY are provided by Supabase).
//
// Security: the caller's JWT is verified. Announcements require course staff (checked with the is_course_staff()
// SQL function as the caller); replies require that the caller wrote the reply. Each event/reply is claimed with an
// atomic "notified_at is null" update, so it is pushed at most once however many times a client calls this.
// Push tokens are read with the service role — clients can never read other users' tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "content-type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function tokensFor(admin: any, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await admin.from("profiles").select("expo_push_token").in("id", ids).not("expo_push_token", "is", null);
  return (data ?? []).map((r: any) => r.expo_push_token as string);
}

async function sendExpo(admin: any, tokens: string[], msg: { title: string; body: string; data: Record<string, unknown> }): Promise<number> {
  const unique = [...new Set(tokens)].filter((t) => /^Expo(nent)?PushToken\[.+\]$/.test(t));
  let sent = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(batch.map((to) => ({ to, sound: "default", title: msg.title, body: msg.body, data: msg.data }))),
    });
    if (!res.ok) continue;
    const tickets = (await res.json()).data ?? [];
    for (let k = 0; k < tickets.length; k++) {
      if (tickets[k].status === "ok") sent++;
      // The app was uninstalled / token expired: forget it so we stop trying.
      else if (tickets[k].details?.error === "DeviceNotRegistered") await admin.from("profiles").update({ expo_push_token: null }).eq("expo_push_token", batch[k]);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const asUser = createClient(URL_, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: u } = await asUser.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Not signed in" }, 401);
    const admin = createClient(URL_, SERVICE);
    const body = await req.json();

    if (body.kind === "announcement") {
      const { data: ev } = await admin.from("course_events").select("id, course_id, kind, title, body, event_date").eq("id", body.eventId).maybeSingle();
      if (!ev) return json({ error: "Not found" }, 404);
      const { data: isStaff } = await asUser.rpc("is_course_staff", { p_course: ev.course_id });
      if (!isStaff) return json({ error: "Not authorized" }, 403);

      const { data: claimed } = await admin.from("course_events").update({ notified_at: new Date().toISOString() }).eq("id", ev.id).is("notified_at", null).select("id").maybeSingle();
      if (!claimed) return json({ sent: 0, already: true });

      const { data: course } = await admin.from("courses").select("code").eq("id", ev.course_id).single();
      const { data: members } = await admin.from("course_members").select("profile_id").eq("course_id", ev.course_id);
      const ids = (members ?? []).map((m: any) => m.profile_id as string).filter((id: string) => id !== user.id);
      const isExam = ev.kind === "exam";
      const sent = await sendExpo(admin, await tokensFor(admin, ids), {
        title: `${isExam ? "📝" : "📣"} ${course?.code ?? "Course"}: ${ev.title}`,
        body: (isExam ? `Exam on ${ev.event_date}${ev.body ? ` — ${ev.body}` : ""}` : ev.body || "Tap to read").slice(0, 160),
        data: { type: "announcement", courseId: ev.course_id },
      });
      return json({ sent });
    }

    if (body.kind === "reply") {
      const { data: r } = await admin.from("group_replies").select("id, post_id, group_id, author_id, body").eq("id", body.replyId).maybeSingle();
      if (!r) return json({ error: "Not found" }, 404);
      if (r.author_id !== user.id) return json({ error: "Not authorized" }, 403);

      const { data: claimed } = await admin.from("group_replies").update({ notified_at: new Date().toISOString() }).eq("id", r.id).is("notified_at", null).select("id").maybeSingle();
      if (!claimed) return json({ sent: 0, already: true });

      const [{ data: group }, { data: post }, { data: me }, { data: others }, { data: members }] = await Promise.all([
        admin.from("study_groups").select("name").eq("id", r.group_id).single(),
        admin.from("group_posts").select("author_id").eq("id", r.post_id).single(),
        admin.from("profiles").select("name").eq("id", user.id).single(),
        admin.from("group_replies").select("author_id").eq("post_id", r.post_id),
        admin.from("group_members").select("profile_id").eq("group_id", r.group_id),
      ]);
      const memberIds = new Set((members ?? []).map((m: any) => m.profile_id as string));
      const ids = [...new Set([post?.author_id, ...(others ?? []).map((o: any) => o.author_id)])]
        .filter((id): id is string => !!id && id !== user.id && memberIds.has(id));
      const sent = await sendExpo(admin, await tokensFor(admin, ids), {
        title: `💬 ${me?.name ?? "Someone"} replied in ${group?.name ?? "your group"}`,
        body: String(r.body).slice(0, 120),
        data: { type: "reply", groupId: r.group_id },
      });
      return json({ sent });
    }

    return json({ error: "Unknown kind" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
