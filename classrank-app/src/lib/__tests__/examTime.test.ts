import { secondsLeft, parseLocalDateTime, validateExamSchedule } from "../examTime";

describe("secondsLeft", () => {
  const serverNow = "2026-10-05T10:00:00Z", deadline = "2026-10-05T10:30:00Z";
  it("counts from the server clock, not the phone clock", () => {
    expect(secondsLeft(deadline, serverNow, 1000, 1000)).toBe(1800);
    expect(secondsLeft(deadline, serverNow, 1000, 61000)).toBe(1740);
  });
  it("never goes negative", () => expect(secondsLeft(deadline, serverNow, 0, 9_999_999)).toBe(0));
  it("a wrong phone clock does not change the result", () => {
    // phone thinks it is 1970 or 2040 — only elapsed time since receipt matters
    expect(secondsLeft(deadline, serverNow, 5_000_000_000_000, 5_000_000_060_000)).toBe(1740);
  });
});

describe("parseLocalDateTime", () => {
  it("parses valid input", () => {
    const d = parseLocalDateTime("2026-10-05", "09:30")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 9, 30]);
  });
  it("rejects bad shapes and rollovers", () => {
    expect(parseLocalDateTime("2026-02-31", "09:30")).toBeNull();
    expect(parseLocalDateTime("2026-10-05", "24:00")).toBeNull();
    expect(parseLocalDateTime("5/10/2026", "09:30")).toBeNull();
    expect(parseLocalDateTime("2026-10-05", "9:30")).toBeNull();
  });
});

describe("validateExamSchedule", () => {
  const now = new Date(2026, 9, 3, 12, 0);
  const at = (h: number, day = 5) => new Date(2026, 9, day, h, 0);
  const ok = { title: "Midterm", starts: at(9), ends: at(12), duration: 60, questionCount: 10, now };
  it("accepts a good schedule", () => expect(validateExamSchedule(ok)).toBeNull());
  it("catches each problem", () => {
    expect(validateExamSchedule({ ...ok, title: " " })).toMatch(/title/);
    expect(validateExamSchedule({ ...ok, questionCount: 2 })).toMatch(/3 questions/);
    expect(validateExamSchedule({ ...ok, questionCount: 61 })).toMatch(/60/);
    expect(validateExamSchedule({ ...ok, starts: null })).toMatch(/opening/);
    expect(validateExamSchedule({ ...ok, ends: null })).toMatch(/closing/);
    expect(validateExamSchedule({ ...ok, duration: 4 })).toMatch(/5 to 240/);
    expect(validateExamSchedule({ ...ok, ends: at(8) })).toMatch(/after it opens/);
    expect(validateExamSchedule({ ...ok, starts: at(9, 1), ends: at(10, 2) })).toMatch(/past/);
    expect(validateExamSchedule({ ...ok, duration: 240 })).toMatch(/shorter than/);
  });
});
