import { useEffect, useState } from "react";
import { useApp } from "../context/AppContext";
import { startStudySync, getSyncStatus, subscribeSyncStatus, SyncStatus } from "../lib/studySync";

/** Mount once in the student shell: backs the study data up to the account and restores it on a new phone. */
export function useStudyCloudSync() {
  const { profile } = useApp();
  const uid = profile?.id;
  useEffect(() => (uid ? startStudySync(uid) : undefined), [uid]);
}

/** Live backup status for the settings screen. */
export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState(getSyncStatus());
  useEffect(() => subscribeSyncStatus(() => setS({ ...getSyncStatus() })), []);
  return s;
}
