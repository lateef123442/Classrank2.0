import { Profile } from "../types";

export interface BadgeDef {
  id: string;
  emoji: string;
  label: string;
  check: (profile: Profile) => boolean;
}

/**
 * Badges are purely derived from existing profile stats (points, streak) —
 * no new database tracking needed. Single source of truth used by both
 * ProfileScreen's badge grid and useNewBadgeCelebration's earned/new-badge
 * diffing, so the two can never disagree about what counts as "earned."
 */
export const BADGES: BadgeDef[] = [
  { id: "streak-3", emoji: "🔥", label: "3-Day Streak", check: (p) => p.current_streak >= 3 },
  { id: "streak-7", emoji: "🔥", label: "7-Day Streak", check: (p) => p.current_streak >= 7 },
  { id: "streak-14", emoji: "🔥", label: "14-Day Streak", check: (p) => p.current_streak >= 14 },
  { id: "streak-30", emoji: "🔥", label: "30-Day Streak", check: (p) => p.current_streak >= 30 },
  { id: "points-500", emoji: "⭐", label: "500 Club", check: (p) => p.total_points >= 500 },
  { id: "points-1000", emoji: "🏆", label: "1000 Club", check: (p) => p.total_points >= 1000 },
  { id: "points-2500", emoji: "💎", label: "2500 Club", check: (p) => p.total_points >= 2500 },
  { id: "points-5000", emoji: "👑", label: "5000 Club", check: (p) => p.total_points >= 5000 },
];

export function earnedBadges(profile: Profile): BadgeDef[] {
  return BADGES.filter((b) => b.check(profile));
}
