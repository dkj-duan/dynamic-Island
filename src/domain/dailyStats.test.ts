import { describe, expect, it } from "vitest";
import { focusStreak, type DailyStat } from "./dailyStats";

const stat = (day: string, focusSeconds: number): DailyStat => ({
  day,
  waterMl: 0,
  pomodoros: 1,
  focusSeconds,
});

describe("focus streak", () => {
  it("counts consecutive focused days ending today", () => {
    expect(
      focusStreak(
        [
          stat("2026-11-03", 600),
          stat("2026-11-04", 1200),
          stat("2026-11-05", 60),
        ],
        "2026-11-05",
      ),
    ).toBe(3);
  });

  it("keeps the streak while today has no focus yet", () => {
    expect(focusStreak([stat("2026-11-04", 1200)], "2026-11-05")).toBe(1);
  });

  it("breaks on a gap", () => {
    expect(
      focusStreak(
        [stat("2026-11-01", 60), stat("2026-11-03", 60)],
        "2026-11-04",
      ),
    ).toBe(1);
    expect(focusStreak([stat("2026-11-03", 60)], "2026-11-05")).toBe(0);
  });

  it("returns zero without data", () => {
    expect(focusStreak([], "2026-11-05")).toBe(0);
  });
});
