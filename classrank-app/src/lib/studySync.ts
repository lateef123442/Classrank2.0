// Offline-first cloud backup of the study data. The app always works from the on-device copy; this module
// quietly keeps it backed up and restores/merges it when needed:
//   • first sign-in on a new phone → restores the backup
//   • edits → pushed (debounced), or when the app goes to the background
//   • another device changed the backup → pull, merge on this device (studyMerge), push the result
// Server contract: supabase/020_study_sync.sql. Safe to run before that migration exists (reports "unavailable").
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { getStudyData, replaceStudyData, subscribeStudyChanges, loadStudy } from "./studyStore";
import { mergeStudyData, hasContent, canonicalStudyJson } from "./studyMerge";
import { normalizeData, StudyData } from "./studyTypes";

export type SyncState = "idle" | "syncing" | "synced" | "offline" | "unavailable" | "error";
export interface SyncStatus { state: SyncState; at: number | null; message?: string }

let status: SyncStatus = { state: "idle", at: null };
const statusListeners = new Set<() => void>();
const setStatus = (s: SyncStatus) => { status = s; statusListeners.forEach((l) => l()); };
export const getSyncStatus = () => status;
export const subscribeSyncStatus = (cb: () => void) => { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; };

interface Meta { revision: number; dirty: boolean } // revision = the server revision this device last agreed with (0 = never synced)
const metaKey = (uid: string) => `classrank:studysync:${uid}`;
const readMeta = async (uid: string): Promise<Meta> => {
  try { const raw = await AsyncStorage.getItem(metaKey(uid)); if (raw) return { revision: 0, dirty: false, ...JSON.parse(raw) }; } catch { /* fall through */ }
  return { revision: 0, dirty: false };
};
const writeMeta = (uid: string, m: Meta) => AsyncStorage.setItem(metaKey(uid), JSON.stringify(m)).catch(() => {});

let changeCounter = 0; // bumps on every local edit, so we can tell if something changed while a push was in flight
let activeUid: string | null = null;

async function pull(): Promise<{ revision: number; data: unknown } | null> {
  const { data, error } = await supabase.rpc("pull_study_data");
  if (error) throw error;
  return (data as { revision: number; data: unknown } | null) ?? null;
}
async function push(data: StudyData, base: number): Promise<{ ok: boolean; revision: number }> {
  const { data: res, error } = await supabase.rpc("push_study_data", { p_data: data, p_base_revision: base });
  if (error) throw error;
  return res as { ok: boolean; revision: number };
}

async function runSync(uid: string): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const meta = await readMeta(uid);
    const remote = await pull();
    const local = getStudyData();
    const counterAtStart = changeCounter;

    if (!remote) {
      // Nothing backed up yet. Never push an empty fresh install (it would later look like "the" backup).
      if (!hasContent(local)) { await writeMeta(uid, { revision: 0, dirty: false }); return; }
      const res = await push(local, 0);
      if (res.ok) { await writeMeta(uid, { revision: res.revision, dirty: changeCounter !== counterAtStart }); return; }
      continue; // another device created it first → loop: pull and merge
    }

    if (remote.revision === meta.revision) {
      if (!meta.dirty) return; // already in sync
      const res = await push(local, meta.revision);
      if (res.ok) { await writeMeta(uid, { revision: res.revision, dirty: changeCounter !== counterAtStart }); return; }
      continue;
    }

    // The server is at a revision this device hasn't seen: new phone, or another device pushed.
    const remoteData = normalizeData(remote.data);
    const next = !hasContent(local) && meta.revision === 0 ? remoteData : mergeStudyData(local, remote.data);
    replaceStudyData(next);
    // Same content as the server (ignoring ordering)? Then there's nothing new to send; just note the revision.
    if (canonicalStudyJson(next) === canonicalStudyJson(remoteData)) { await writeMeta(uid, { revision: remote.revision, dirty: false }); return; }
    const res = await push(next, remote.revision);
    if (res.ok) { await writeMeta(uid, { revision: res.revision, dirty: changeCounter !== counterAtStart }); return; }
    // lost another race: loop and merge again
  }
  throw new Error("Couldn't finish syncing; will retry");
}

const classify = (e: any): SyncStatus => {
  const msg = String(e?.message ?? e ?? "");
  if (e?.code === "PGRST202" || /could not find the function|does not exist/i.test(msg)) return { state: "unavailable", at: null };
  if (/network request failed|failed to fetch|timeout|offline/i.test(msg)) return { state: "offline", at: status.at };
  return { state: "error", at: status.at, message: msg };
};

let running: Promise<void> | null = null;
let again = false;
/** Back up / restore now. Overlapping calls coalesce into one extra pass. */
export function syncNow(uid: string): Promise<void> {
  if (running) { again = true; return running; }
  setStatus({ state: "syncing", at: status.at });
  running = (async () => {
    try {
      do { again = false; await runSync(uid); } while (again);
      setStatus({ state: "synced", at: Date.now() });
    } catch (e) {
      setStatus(classify(e));
    } finally { running = null; }
  })();
  return running;
}

/** Begin syncing for the signed-in student. Returns a stop function. */
export function startStudySync(uid: string): () => void {
  activeUid = uid;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (ms: number) => { if (timer) clearTimeout(timer); timer = setTimeout(() => { if (!stopped) syncNow(uid); }, ms); };

  const unsubChanges = subscribeStudyChanges(async () => {
    changeCounter++;
    const m = await readMeta(uid);
    await writeMeta(uid, { ...m, dirty: true });
    schedule(4000); // batch a burst of edits into one push
  });
  const appSub = AppState.addEventListener("change", (s) => {
    if (s === "active") schedule(500);
    else if (s === "background" || s === "inactive") { if (timer) clearTimeout(timer); syncNow(uid); }
  });
  loadStudy().then(() => { if (!stopped) syncNow(uid); });

  return () => { stopped = true; if (timer) clearTimeout(timer); unsubChanges(); appSub.remove(); if (activeUid === uid) activeUid = null; };
}

/** Best-effort final backup before signing out (bounded to a few seconds so sign-out never hangs). */
export async function flushStudySync(): Promise<void> {
  if (!activeUid) return;
  await Promise.race([syncNow(activeUid), new Promise<void>((r) => setTimeout(r, 4000))]);
}
