const Module = require("module"); const path = require("path");
const assert = require("assert");
// Usage: tsc --outDir /tmp/sync --module commonjs --target es2020 --skipLibCheck src/lib/studySync.ts ; node scripts/verify-sync.js /tmp/sync
// Runs the REAL sync engine against an in-memory fake of supabase/020_study_sync.sql with two simulated phones.
const DIR = (process.argv[2] || "/tmp/sync").replace(/\/?$/, "/");
// ── fake server: same rules as supabase/020_study_sync.sql (one row per user, optimistic revision) ──
const server = { row: null, pushes: 0, rpc: async function (fn, args) {
  if (fn === "pull_study_data") return { data: this.row ? JSON.parse(JSON.stringify(this.row)) : null, error: null };
  if (fn === "push_study_data") {
    if (!this.row) { this.row = { revision: 1, data: JSON.parse(JSON.stringify(args.p_data)) }; this.pushes++; return { data: { ok: true, revision: 1 }, error: null }; }
    if (this.row.revision !== args.p_base_revision) return { data: { ok: false, revision: this.row.revision }, error: null };
    this.row = { revision: this.row.revision + 1, data: JSON.parse(JSON.stringify(args.p_data)) }; this.pushes++;
    return { data: { ok: true, revision: this.row.revision }, error: null };
  }
  return { data: null, error: { message: "unknown fn" } };
} };
function device() {
  const storage = new Map(); let online = true;
  const asyncStorage = { getItem: async (k) => (storage.has(k) ? storage.get(k) : null), setItem: async (k, v) => { storage.set(k, v); }, removeItem: async (k) => { storage.delete(k); } };
  const stubs = {
    "@react-native-async-storage/async-storage": { default: asyncStorage, ...asyncStorage },
    "react": { useState() {}, useEffect() {} },
    "react-native": { AppState: { addEventListener: () => ({ remove() {} }) } },
    "./supabase": { supabase: { rpc: async (fn, a) => { if (!online) throw new Error("Network request failed"); return server.rpc(fn, a); } } },
  };
  const orig = Module._load;
  Module._load = function (req, parent, isMain) { if (stubs[req]) return stubs[req]; return orig.apply(this, arguments); };
  Object.keys(require.cache).filter((k) => k.startsWith(DIR)).forEach((k) => delete require.cache[k]);
  const store = require(DIR + "studyStore.js"), sync = require(DIR + "studySync.js"), types = require(DIR + "studyTypes.js");
  Module._load = orig;
  return { store, sync, types, storage, setOnline: (v) => (online = v) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0; const ok = (name) => console.log("ok", ++n, name);

(async () => {
  const UID = "user-1";
  // Phone A: sign in, build some data, back up.
  const A = device(); A.store.setStudyUser(UID); await A.store.loadStudy();
  const stopA = A.sync.startStudySync(UID); await wait(30);
  assert.strictEqual(server.row, null); ok("empty fresh install does NOT create a backup");
  const sid = A.store.addSubject("Biology", "2099-01-01"); A.store.addTopic(sid, "Genetics");
  A.store.addNote(sid, "Cells", "mitochondria"); A.store.logFocus("Biology", 25);
  await A.sync.syncNow(UID);
  assert.strictEqual(server.row.revision, 1); assert.strictEqual(server.row.data.subjects.length, 1);
  assert.strictEqual(A.sync.getSyncStatus().state, "synced"); ok("first edits are backed up (revision 1)");
  await A.sync.syncNow(UID); assert.strictEqual(server.pushes, 1); ok("nothing changed → no extra push");

  // Phone B: brand-new phone, same account → restores.
  const B = device(); B.store.setStudyUser(UID); await B.store.loadStudy();
  await B.sync.syncNow(UID);
  const d = B.store.getStudyData();
  assert.strictEqual(d.subjects.length, 1); assert.strictEqual(d.notes[0].body, "mitochondria"); assert.strictEqual(d.focus.length, 1);
  assert.strictEqual(server.pushes, 1); ok("new phone restores everything and doesn't push back");

  // Both phones edit offline-ish, diverging.
  const stopB = B.sync.startStudySync(UID);
  A.store.addNote(sid, "From A", "a-note"); A.store.logFocus("Biology", 10);
  B.store.addNote(B.store.getStudyData().subjects[0].id, "From B", "b-note"); B.store.logFocus("Biology", 40);
  await wait(60);
  await A.sync.syncNow(UID);           // A wins the race: revision 2
  assert.strictEqual(server.row.revision, 2); ok("A pushes first (revision 2)");
  await B.sync.syncNow(UID);           // B is behind → pull, merge, push (revision 3)
  const merged = server.row.data;
  assert.strictEqual(server.row.revision, 3);
  assert.deepStrictEqual(merged.notes.map((x) => x.body).sort(), ["a-note", "b-note", "mitochondria"]);
  assert.strictEqual(merged.focus.length, 3); assert.strictEqual(merged.subjects.length, 1);
  ok("diverged phones merge: no data lost, nothing duplicated (revision 3)");
  await A.sync.syncNow(UID);           // A pulls the merge
  assert.strictEqual(A.store.getStudyData().notes.length, 3); assert.strictEqual(server.pushes, 3);
  ok("the other phone converges to the merged copy without pushing again");

  // Offline edits are kept and uploaded later.
  A.setOnline(false);
  A.store.addNote(sid, "Offline", "offline-note"); await wait(20);
  await A.sync.syncNow(UID);
  assert.strictEqual(A.sync.getSyncStatus().state, "offline"); assert.strictEqual(server.row.data.notes.length, 3); ok("offline: reports 'offline', keeps the edit locally");
  A.setOnline(true); await A.sync.syncNow(UID);
  assert.strictEqual(server.row.data.notes.length, 4); ok("back online: pending edit is uploaded");

  // Restarting the app keeps in-sync state (meta persisted) and local data (scoped storage).
  stopA(); stopB();
  const A2 = device(); // simulate a relaunch of phone A by reusing its storage
  A2.storage.clear(); for (const [k, v] of A.storage) A2.storage.set(k, v);
  A2.store.setStudyUser(UID); await A2.store.loadStudy();
  assert.strictEqual(A2.store.getStudyData().notes.length, 4);
  const before = server.pushes; await A2.sync.syncNow(UID); assert.strictEqual(server.pushes, before); ok("relaunch: data persisted per-user, no spurious push");

  // A different account on the same phone sees none of it.
  A2.store.setStudyUser("user-2"); await A2.store.loadStudy();
  assert.strictEqual(A2.store.getStudyData().subjects.length, 0); ok("a second account on the same phone starts empty");
  console.log("\nALL SYNC SCENARIOS PASSED");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
