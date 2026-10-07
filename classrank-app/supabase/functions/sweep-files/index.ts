// Deletes orphaned files from the 'course-files' bucket (see supabase/023_orphan_file_sweep.sql).
//
// Deploy:   supabase functions deploy sweep-files --no-verify-jwt
// Secret:   supabase secrets set SWEEP_SECRET=<long random string>
// Schedule: call it daily, e.g. with pg_cron + pg_net, or any cron service:
//   curl -X POST https://<project>.supabase.co/functions/v1/sweep-files -H "x-sweep-secret: <secret>"
// Optional body: { "dryRun": true } lists what WOULD be deleted without deleting.
//
// Security: not callable by app users — it needs the shared secret, and uses the service role internally.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

// Constant-time comparison so the secret can't be guessed byte by byte.
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = Deno.env.get("SWEEP_SECRET");
  const given = req.headers.get("x-sweep-secret") ?? "";
  if (!secret || secret.length < 16 || !same(given, secret)) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("orphan_course_files", { p_older_than: "1 hour", p_limit: 500 });
  if (error) return json({ error: error.message }, 500);

  const names = ((data ?? []) as { name: string }[]).map((r) => r.name);
  if (dryRun || !names.length) return json({ dryRun, found: names.length, names: dryRun ? names : undefined });

  let removed = 0;
  for (let i = 0; i < names.length; i += 100) {
    const { data: gone, error: rmErr } = await admin.storage.from("course-files").remove(names.slice(i, i + 100));
    if (rmErr) return json({ error: rmErr.message, removed }, 500);
    removed += gone?.length ?? 0;
  }
  return json({ found: names.length, removed });
});
