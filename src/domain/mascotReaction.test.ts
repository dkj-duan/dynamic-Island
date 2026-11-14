import { describe, expect, it } from "vitest";
import { mascotReactionForChange, type MascotSignals } from "./mascotReaction";

const base: MascotSignals = {
  waterMl: 500,
  waterActions: 0,
  pomodoros: 1,
  focusFinished: false,
  countdownReached: false,
  sedentaryOver: false,
};

describe("mascot reactions", () => {
  it("reacts to real progress and fresh reminders", () => {
    expect(mascotReactionForChange(base, { ...base, waterMl: 750 })).toBe(
      "water",
    );
    expect(mascotReactionForChange(base, { ...base, pomodoros: 2 })).toBe(
      "celebrate",
    );
    expect(
      mascotReactionForChange(base, { ...base, focusFinished: true }),
    ).toBe("celebrate");
    expect(
      mascotReactionForChange(base, { ...base, sedentaryOver: true }),
    ).toBe("attention");
    expect(
      mascotReactionForChange(base, { ...base, countdownReached: true }),
    ).toBe("attention");
  });

  it("ignores unchanged values, resets and initial data availability", () => {
    expect(mascotReactionForChange(base, base)).toBeNull();
    expect(
      mascotReactionForChange(base, { ...base, waterMl: 0, pomodoros: 0 }),
    ).toBeNull();
    expect(
      mascotReactionForChange({ ...base, waterMl: null }, base),
    ).toBeNull();
  });

  it("prioritizes reminders over simultaneous progress", () => {
    expect(
      mascotReactionForChange(base, {
        ...base,
        waterMl: 750,
        countdownReached: true,
      }),
    ).toBe("attention");
  });
});
