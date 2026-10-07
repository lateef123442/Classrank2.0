import { useEffect } from "react";
import { loadStudy, getStudyData, subscribeStudy } from "../lib/studyStore";
import { syncStudyReminders } from "../lib/studyReminders";

/**
 * Mount once in the student shell. Loads saved study data first (so nothing can overwrite it),
 * then re-syncs reminders, debounced, whenever the data or preferences change.
 * Uses a plain subscription rather than useStudy() so it never re-renders the tab navigator.
 */
export function useStudyReminderSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => syncStudyReminders(getStudyData()), 800); };
    const unsub = subscribeStudy(run);
    loadStudy(); // completion notifies subscribers, which triggers the first sync
    return () => { unsub(); if (timer) clearTimeout(timer); };
  }, []);
}
