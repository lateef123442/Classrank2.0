import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Profile } from "../types";
import { BadgeDef, earnedBadges } from "../data/badges";
import { track, AnalyticsEvents } from "../lib/analytics";

function storageKey(profileId: string) {
  return `classrank:seenBadges:${profileId}`;
}

/**
 * Compares currently-earned badges against a persisted "already seen" set
 * for this user. If a badge is newly earned since the last time this ran,
 * it's queued for celebration (one at a time, oldest-defined first) and the
 * "seen" set is updated so restarting the app doesn't replay a
 * celebration for a badge earned days ago.
 *
 * Deliberately stores seen-state in AsyncStorage rather than a database
 * column: this is purely a client-side "have I shown this animation
 * before" flag, not data that needs to sync across devices or survive an
 * account being accessed elsewhere.
 */
export function useNewBadgeCelebration(profile: Profile | null) {
  const [celebrating, setCelebrating] = useState<BadgeDef | null>(null);
  const queueRef = useRef<BadgeDef[]>([]);
  const checkedForProfileId = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    // Only re-check when the profile identity changes or stats change —
    // avoid re-running the AsyncStorage round-trip on unrelated re-renders.
    const signature = `${profile.id}:${profile.total_points}:${profile.current_streak}`;
    if (checkedForProfileId.current === signature) return;
    checkedForProfileId.current = signature;

    (async () => {
      const key = storageKey(profile.id);
      const currentlyEarned = earnedBadges(profile);
      const currentlyEarnedIds = currentlyEarned.map((b) => b.id);

      let seenIds: string[] = [];
      try {
        const raw = await AsyncStorage.getItem(key);
        seenIds = raw ? JSON.parse(raw) : [];
      } catch {
        seenIds = [];
      }

      const newlyEarned = currentlyEarned.filter((b) => !seenIds.includes(b.id));

      if (newlyEarned.length > 0) {
        newlyEarned.forEach((b) => track(AnalyticsEvents.BADGE_EARNED, { badge_id: b.id }));
        queueRef.current.push(...newlyEarned);
        if (!celebrating) {
          setCelebrating(queueRef.current.shift() ?? null);
        }
      }

      // Persist regardless, so a badge earned while the celebration UI is
      // dismissed without being "claimed" doesn't repeatedly re-queue.
      try {
        await AsyncStorage.setItem(key, JSON.stringify(currentlyEarnedIds));
      } catch {
        // Non-fatal: worst case, a badge celebration replays once more than intended.
      }
    })();
  }, [profile?.id, profile?.total_points, profile?.current_streak]);

  const dismiss = () => {
    setCelebrating(queueRef.current.shift() ?? null);
  };

  return { celebrating, dismiss };
}
