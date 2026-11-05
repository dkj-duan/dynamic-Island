import { describe, expect, it } from "vitest";
import {
  completeFocus,
  emptyProgress,
  isLongBreakDue,
  localDay,
  normalizeProgress,
  parsePomodoroProgress,
  parsePomodoroSettings,
  startFocusCycle,
} from "./pomodoro";

const settings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
};

describe("pomodoro settings", () => {
  it("accepts valid settings and rejects out-of-range values", () => {
    expect(parsePomodoroSettings({ version: 1, ...settings })).toEqual(
      settings,
    );
    expect(
      parsePomodoroSettings({ version: 1, ...settings, focusMinutes: 0 }),
    ).toBeNull();
    expect(
      parsePomodoroSettings({ version: 1, ...settings, longBreakEvery: 1 }),
    ).toBeNull();
    expect(parsePomodoroSettings({ version: 2, ...settings })).toBeNull();
  });
});

describe("pomodoro progress", () => {
  const day = localDay(Date.UTC(2026, 0, 15, 12));

  it("starts empty and resets on a new day", () => {
    const now = new Date(2026, 0, 15, 12).getTime();
    expect(emptyProgress(now)).toEqual({
      day: localDay(now),
      completedToday: 0,
      cycle: 0,
    });
    const yesterday = {
      day: localDay(now - 86_400_000),
      completedToday: 3,
      cycle: 3,
    };
    expect(normalizeProgress(yesterday, now).completedToday).toBe(0);
  });

  it("counts finished focus sessions and suggests a long break every cycle", () => {
    let progress = emptyProgress(0);
    const now = Date.now();
    for (let i = 1; i <= 4; i += 1) {
      progress = completeFocus(progress, now);
      expect(progress.completedToday).toBe(i);
      expect(isLongBreakDue(progress.cycle, settings)).toBe(i === 4);
    }
    expect(startFocusCycle(progress, settings, now).cycle).toBe(0);
  });

  it("validates stored progress", () => {
    const progress = { version: 1, day, completedToday: 2, cycle: 2 };
    expect(parsePomodoroProgress(progress)).toEqual({
      day,
      completedToday: 2,
      cycle: 2,
    });
    expect(
      parsePomodoroProgress({ ...progress, completedToday: -1 }),
    ).toBeNull();
    expect(
      parsePomodoroProgress({ ...progress, day: "2026/01/15" }),
    ).toBeNull();
  });
});
