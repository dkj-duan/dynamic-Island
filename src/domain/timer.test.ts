import { describe, expect, it } from "vitest";
import {
  formatRemaining,
  extendTimer,
  parseDuration,
  parsePersistedTimer,
  pauseTimer,
  remainingMilliseconds,
  restorePersistedTimer,
  resumeTimer,
  timerProgress,
} from "./timer";

describe("countdown", () => {
  it("derives progress from the actual timer, including pause and extension", () => {
    expect(timerProgress({ status: "running", endsAt: 5000 }, 4000, 2000)).toBe(
      0.25,
    );
    expect(
      timerProgress({ status: "paused", remainingMs: 3000 }, 4000, 9000),
    ).toBe(0.25);
    expect(
      timerProgress({ status: "running", endsAt: 65000 }, 64000, 2000),
    ).toBe(1 / 64);
    expect(timerProgress({ status: "finished" }, 4000, 9000)).toBe(1);
    expect(timerProgress({ status: "idle" }, 4000, 9000)).toBeNull();
    expect(
      timerProgress({ status: "running", endsAt: 5000 }, 0, 2000),
    ).toBeNull();
  });
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
  it("extends active timers without resuming a paused timer", () => {
    expect(extendTimer({ status: "running", endsAt: 5000 }, 60000)).toEqual({
      status: "running",
      endsAt: 65000,
    });
    expect(extendTimer({ status: "paused", remainingMs: 3000 }, 60000)).toEqual(
      { status: "paused", remainingMs: 63000 },
    );
    expect(extendTimer({ status: "finished" }, 60000)).toEqual({
      status: "finished",
    });
    expect(extendTimer({ status: "running", endsAt: 5000 }, NaN)).toEqual({
      status: "running",
      endsAt: 5000,
    });
  });
});

describe("persisted timers", () => {
  const snapshot = {
    version: 1,
    kind: "countdown",
    mode: "countdown",
    durationMs: 300000,
    label: "泡茶",
    countdownId: "tea",
    state: { status: "running", endsAt: 500000 },
  };

  it("parses a valid snapshot and rejects malformed ones", () => {
    expect(parsePersistedTimer(snapshot)).toEqual(snapshot);
    expect(parsePersistedTimer({ ...snapshot, version: 2 })).toBeNull();
    expect(parsePersistedTimer({ ...snapshot, durationMs: 0 })).toBeNull();
    expect(
      parsePersistedTimer({ ...snapshot, state: { status: "running" } }),
    ).toBeNull();
    expect(parsePersistedTimer({ ...snapshot, kind: "timer" })).toBeNull();
    expect(parsePersistedTimer({ ...snapshot, countdownId: null })).toBeNull();
  });

  it("restores running timers and finishes ones that expired while closed", () => {
    expect(
      restorePersistedTimer(parsePersistedTimer(snapshot)!, 400000),
    ).toEqual({ state: { status: "running", endsAt: 500000 }, expired: false });
    expect(
      restorePersistedTimer(parsePersistedTimer(snapshot)!, 600000),
    ).toEqual({ state: { status: "finished" }, expired: true });
  });
});
