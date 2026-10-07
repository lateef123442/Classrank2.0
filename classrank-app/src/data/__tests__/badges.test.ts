import { earnedBadges, BADGES } from "../badges";
import { Profile } from "../../types";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    name: "Test Student",
    university: "Greenfield University",
    department_id: "d1",
    department: "Computer Science",
    faculty: "Faculty of Science & Technology",
    year: 2,
    role: "student",
    total_points: 0,
    current_streak: 0,
    last_quiz_date: null,
    is_pro: false,
    pro_expires_at: null,
    ...overrides,
  };
}

describe("earnedBadges", () => {
  it("returns no badges for a fresh profile", () => {
    expect(earnedBadges(makeProfile())).toEqual([]);
  });

  it("awards streak badges at the right thresholds", () => {
    const ids = earnedBadges(makeProfile({ current_streak: 7 })).map((b) => b.id);
    expect(ids).toContain("streak-3");
    expect(ids).toContain("streak-7");
    expect(ids).not.toContain("streak-14");
  });

  it("awards points badges at the right thresholds", () => {
    const ids = earnedBadges(makeProfile({ total_points: 1200 })).map((b) => b.id);
    expect(ids).toContain("points-500");
    expect(ids).toContain("points-1000");
    expect(ids).not.toContain("points-2500");
  });

  it("awards both streak and points badges simultaneously", () => {
    const ids = earnedBadges(makeProfile({ total_points: 5000, current_streak: 30 })).map((b) => b.id);
    expect(ids.length).toBe(BADGES.length); // every badge earned
  });

  it("is a pure function of profile stats — same input, same output", () => {
    const profile = makeProfile({ total_points: 750, current_streak: 4 });
    expect(earnedBadges(profile)).toEqual(earnedBadges(profile));
  });
});
