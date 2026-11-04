import { describe, expect, it } from "vitest";
import {
  formatRemaining,
  parseDuration,
  pauseTimer,
  remainingMilliseconds,
  resumeTimer,
} from "./timer";

describe("countdown", () => {
  it("validates custom durations in minutes and seconds", () => {
    expect(parseDuration("2", "05")).toBe(125000);
    expect(parseDuration("", "1")).toBe(1000);
    for (const [minutes, seconds] of [
      ["", ""],
      ["0", "0"],
      ["1", "60"],
      ["1000", "0"],
      ["1.5", "0"],
      ["-1", "0"],
    ]) {
      expect(parseDuration(minutes, seconds)).toBeNull();
    }
  });
  it("uses the deadline so delays and sleep do not add time", () => {
    expect(
      remainingMilliseconds({ status: "running", endsAt: 5000 }, 9000),
    ).toBe(0);
    expect(formatRemaining(1001)).toBe("00:02");
  });
  it("pauses and resumes without losing the remaining time", () => {
    const paused = pauseTimer({ status: "running", endsAt: 5000 }, 2000);
    expect(paused).toEqual({ status: "paused", remainingMs: 3000 });
    expect(resumeTimer(paused, 10000)).toEqual({
      status: "running",
      endsAt: 13000,
    });
  });
  it("finishes if paused after the deadline", () => {
    expect(pauseTimer({ status: "running", endsAt: 1000 }, 2000)).toEqual({
      status: "finished",
    });
  });
});
