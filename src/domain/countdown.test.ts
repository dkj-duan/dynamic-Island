import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  formatDurationSeconds,
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
});
