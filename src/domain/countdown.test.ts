import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDurationSeconds,
  idleCountdownView,
  parseCountdowns,
  targetRemainingMilliseconds,
} from "./countdown";

describe("countdown settings", () => {
  it("parses target and duration entries", () => {
    const parsed = parseCountdowns({
      version: 1,
      items: [
        {
          id: "off-work",
          label: "下班",
          kind: "target",
          targetTime: "18:00",
        },
        {
          id: "tea",
          label: "泡茶",
          kind: "duration",
          durationSeconds: 300,
        },
      ],
      islandId: "off-work",
    });
    expect(parsed.items).toHaveLength(2);
    expect(parsed.islandId).toBe("off-work");
  });

  it("rejects malformed entries", () => {
    const base = { version: 1, islandId: null };
    expect(() =>
      parseCountdowns({
        ...base,
        items: [
          { id: "a", label: "下班", kind: "target", targetTime: "25:00" },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCountdowns({
        ...base,
        items: [
          { id: "a", label: "泡茶", kind: "duration", durationSeconds: 0 },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCountdowns({
        ...base,
        items: [
          { id: "a", label: "下班", kind: "target", targetTime: "18:00" },
          { id: "a", label: "午休", kind: "target", targetTime: "12:30" },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCountdowns({
        version: 1,
        items: [],
        islandId: "missing",
      }),
    ).toThrow();
  });

  it("measures remaining time to today's target", () => {
    const item = {
      id: "off-work",
      label: "下班",
      kind: "target" as const,
      targetTime: "18:00",
      durationSeconds: null,
    };
    const now = new Date(2026, 10, 5, 17, 30).getTime();
    expect(targetRemainingMilliseconds(item, now)).toBe(30 * 60_000);
    const after = new Date(2026, 10, 5, 18, 5).getTime();
    expect(targetRemainingMilliseconds(item, after)).toBe(0);
  });

  it("formats remaining time", () => {
    expect(formatCountdown(5_000)).toBe("00:05");
    expect(formatCountdown(65_000)).toBe("01:05");
    expect(formatCountdown(3_725_000)).toBe("1:02");
    expect(formatCountdown(2 * 3600_000)).toBe("2:00");
    expect(formatDurationSeconds(300)).toBe("5:00");
  });

  describe("idle countdown view", () => {
    const target = {
      id: "off-work",
      label: "下班",
      kind: "target" as const,
      targetTime: "18:00",
      durationSeconds: null,
    };
    const duration = {
      id: "tea",
      label: "泡茶",
      kind: "duration" as const,
      targetTime: null,
      durationSeconds: 300,
    };

    it("ticks a target countdown and flags when the time has passed", () => {
      const now = new Date(2026, 10, 5, 17, 30).getTime();
      const view = idleCountdownView(
        target,
        "focus",
        null,
        { status: "idle" },
        now,
      );
      expect(view).toEqual({
        label: "下班",
        remainingMs: 30 * 60_000,
        reached: false,
      });
      const after = new Date(2026, 10, 5, 18, 5).getTime();
      expect(
        idleCountdownView(target, "focus", null, { status: "idle" }, after),
      ).toEqual({
        label: "下班",
        remainingMs: 0,
        reached: true,
      });
    });

    it("shows a duration countdown only while its timer is running", () => {
      const now = Date.now();
      expect(
        idleCountdownView(duration, "focus", null, { status: "idle" }, now),
      ).toBeNull();
      expect(
        idleCountdownView(
          duration,
          "countdown",
          "other",
          { status: "running", endsAt: now + 60_000 },
          now,
        ),
      ).toBeNull();
      expect(
        idleCountdownView(
          duration,
          "countdown",
          null,
          { status: "running", endsAt: now + 60_000 },
          now,
        ),
      ).toBeNull();
      const running = idleCountdownView(
        duration,
        "countdown",
        "tea",
        { status: "running", endsAt: now + 60_000 },
        now,
      );
      expect(running).toEqual({
        label: "泡茶",
        remainingMs: 60_000,
        reached: false,
      });
      expect(
        idleCountdownView(
          duration,
          "countdown",
          "tea",
          { status: "finished" },
          now,
        ),
      ).toEqual({ label: "泡茶", remainingMs: 0, reached: true });
    });

    it("returns null without a pinned countdown", () => {
      expect(
        idleCountdownView(
          null,
          "countdown",
          "tea",
          { status: "running", endsAt: 0 },
          0,
        ),
      ).toBeNull();
    });
  });
});
