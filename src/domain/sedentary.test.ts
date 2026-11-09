import { describe, expect, it } from "vitest";
import {
  emptySedentaryProgress,
  normalizeSedentaryProgress,
  parseSedentaryProgress,
  parseSedentarySettings,
  sedentaryTone,
  sittingMinutes,
} from "./sedentary";

describe("sedentary settings", () => {
  const base = {
    version: 1,
    goalBreaks: 10,
    reminderMinutes: 45,
    activeStart: 9,
    activeEnd: 21,
    enabled: true,
  };

  it("accepts the documented ranges", () => {
    expect(parseSedentarySettings(base)).toEqual({
      goalBreaks: 10,
      reminderMinutes: 45,
      activeStart: 9,
      activeEnd: 21,
      enabled: true,
    });
    expect(
      parseSedentarySettings({ ...base, reminderMinutes: 5 }),
    ).not.toBeNull();
    expect(
      parseSedentarySettings({ ...base, reminderMinutes: 240 }),
    ).not.toBeNull();
    expect(parseSedentarySettings({ ...base, goalBreaks: 1 })).not.toBeNull();
    expect(parseSedentarySettings({ ...base, goalBreaks: 50 })).not.toBeNull();
  });

  it("rejects out-of-range values and malformed payloads", () => {
    expect(parseSedentarySettings({ ...base, reminderMinutes: 4 })).toBeNull();
    expect(
      parseSedentarySettings({ ...base, reminderMinutes: 241 }),
    ).toBeNull();
    expect(
      parseSedentarySettings({ ...base, reminderMinutes: 2.5 }),
    ).toBeNull();
    expect(parseSedentarySettings({ ...base, goalBreaks: 0 })).toBeNull();
    expect(parseSedentarySettings({ ...base, goalBreaks: 51 })).toBeNull();
    expect(parseSedentarySettings({ ...base, activeStart: 21 })).toBeNull();
    expect(parseSedentarySettings({ ...base, activeEnd: 0 })).toBeNull();
    expect(parseSedentarySettings({ ...base, version: 2 })).toBeNull();
    expect(parseSedentarySettings(null)).toBeNull();
    expect(parseSedentarySettings("water")).toBeNull();
  });
});

describe("sedentary progress", () => {
  const now = new Date(2026, 10, 7, 14, 30).getTime();

  it("starts a fresh day when the stored progress is from yesterday", () => {
    const stale = { day: "2026-11-06", lastBreakAt: now - 86_400_000 };
    expect(normalizeSedentaryProgress(stale, now)).toEqual(
      emptySedentaryProgress(now),
    );
    expect(normalizeSedentaryProgress(null, now)).toEqual(
      emptySedentaryProgress(now),
    );
    const fresh = { day: "2026-11-07", lastBreakAt: now - 60_000 };
    expect(normalizeSedentaryProgress(fresh, now)).toEqual(fresh);
  });

  it("parses strictly and rejects malformed payloads", () => {
    expect(
      parseSedentaryProgress({ version: 1, day: "2026-11-07", lastBreakAt: 1 }),
    ).toEqual({ day: "2026-11-07", lastBreakAt: 1 });
    expect(
      parseSedentaryProgress({ version: 1, day: "2026-11-7", lastBreakAt: 1 }),
    ).toBeNull();
    expect(
      parseSedentaryProgress({
        version: 1,
        day: "2026-11-07",
        lastBreakAt: -1,
      }),
    ).toBeNull();
    expect(
      parseSedentaryProgress({
        version: 1,
        day: "2026-11-07",
        lastBreakAt: 1.5,
      }),
    ).toBeNull();
    expect(parseSedentaryProgress(null)).toBeNull();
  });
});

describe("sedentary tone", () => {
  const now = 1_000_000_000_000;

  it("counts whole minutes since the last break", () => {
    expect(sittingMinutes(now - 59_000, now)).toBe(0);
    expect(sittingMinutes(now - 60_000, now)).toBe(1);
    expect(sittingMinutes(now - 90_000, now)).toBe(1);
    // A lastBreakAt in the future (clock skew) is not negative sitting.
    expect(sittingMinutes(now + 60_000, now)).toBe(0);
  });

  it("marks fresh, near and over states against the interval", () => {
    const interval = 45;
    expect(sedentaryTone(now - 20 * 60_000, now, interval)).toBe("fresh");
    // 31 of 45 minutes is 68.9% — still fresh; 32 crosses the 70% line.
    expect(sedentaryTone(now - 31 * 60_000, now, interval)).toBe("fresh");
    expect(sedentaryTone(now - 32 * 60_000, now, interval)).toBe("near");
    expect(sedentaryTone(now - 45 * 60_000, now, interval)).toBe("over");
  });
});
