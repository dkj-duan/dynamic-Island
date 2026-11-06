import { describe, expect, it } from "vitest";
import { parseAppearance } from "./settings";

describe("parseAppearance", () => {
  it("accepts supported settings", () => {
    expect(
      parseAppearance({ version: 1, scale: 1.1, showClock: false }),
    ).toEqual({
      expandedShape: "classic",
      theme: "system",
      scale: 1.1,
      showClock: false,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["quota"],
      pomodoroView: "count",
      islandLyrics: false,
      reminderStyle: "breathe",
      reminderAutoExpand: false,
      hotkeyFocus: true,
      hotkeyWater: true,
      hotkeyIsland: true,
      forwardNotifications: false,
    });
  });
  it("migrates old shapes and rejects invalid new shapes", () => {
    const old = {
      version: 11,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock"],
      islandLyrics: false,
      pomodoroView: "count",
      reminderStyle: "breathe",
      reminderAutoExpand: false,
    };
    expect(parseAppearance(old).expandedShape).toBe("classic");
    expect(
      parseAppearance({ ...old, version: 12, expandedShape: "soft" })
        .expandedShape,
    ).toBe("classic");
    expect(() =>
      parseAppearance({ ...old, version: 12, expandedShape: "invalid" }),
    ).toThrow();
    expect(() => parseAppearance({ ...old, version: 12 })).toThrow();
  });
  it("migrates version 2 and validates the selected theme", () => {
    expect(
      parseAppearance({
        version: 2,
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
      }).theme,
    ).toBe("system");
    expect(
      parseAppearance({
        version: 3,
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        theme: "light",
      }).theme,
    ).toBe("light");
    expect(() =>
      parseAppearance({
        version: 3,
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        theme: "invalid",
      }),
    ).toThrow();
  });
  it("keeps the expand trigger only from version 4", () => {
    expect(
      parseAppearance({
        version: 3,
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        theme: "dark",
      }).expandTrigger,
    ).toBe("click");
    expect(
      parseAppearance({
        version: 4,
        theme: "dark",
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        expandTrigger: "hover",
      }).expandTrigger,
    ).toBe("hover");
    expect(() =>
      parseAppearance({
        version: 4,
        theme: "dark",
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        expandTrigger: "double",
      }),
    ).toThrow();
  });
  it("reads the ordered idle widgets from version 6", () => {
    const parsed = parseAppearance({
      version: 6,
      theme: "dark",
      scale: 1,
      showClock: false,
      autoCollapseSeconds: 3,
      expandTrigger: "hover",
      language: "en-US",
      idleWidgets: ["water", "clock"],
    });
    expect(parsed.idleWidgets).toEqual(["water", "clock"]);
    expect(parsed.showClock).toBe(true);
    expect(parsed.islandLyrics).toBe(false);
    expect(() =>
      parseAppearance({
        version: 6,
        theme: "dark",
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        expandTrigger: "click",
        language: "zh-CN",
        idleWidgets: ["clock", "unknown"],
      }),
    ).toThrow();
    expect(() =>
      parseAppearance({
        version: 6,
        theme: "dark",
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        expandTrigger: "click",
        language: "zh-CN",
        idleWidgets: ["clock", "clock"],
      }),
    ).toThrow();
  });
  it("reads the island lyric switch from version 7", () => {
    const parsed = parseAppearance({
      version: 7,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock", "music"],
      islandLyrics: true,
    });
    expect(parsed.islandLyrics).toBe(true);
    expect(parsed.idleWidgets).toEqual(["clock", "music"]);
    expect(() =>
      parseAppearance({
        version: 7,
        theme: "dark",
        scale: 1,
        showClock: true,
        autoCollapseSeconds: 3,
        expandTrigger: "click",
        language: "zh-CN",
        idleWidgets: ["clock"],
      }),
    ).toThrow();
  });
  it.each([
    null,
    {},
    { version: 2, scale: 1, showClock: true },
    { version: 1, scale: 4, showClock: true },
    { version: 1, scale: NaN, showClock: true },
    { version: 1, scale: 1, showClock: "yes" },
  ])("rejects invalid or unsupported data: %s", (input) => {
    expect(() => parseAppearance(input)).toThrow();
  });
  it("reads reminder settings from version 9", () => {
    const base = {
      version: 9,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock"],
      islandLyrics: false,
      pomodoroView: "count",
    };
    const parsed = parseAppearance({
      ...base,
      reminderStyle: "sweep",
      reminderAutoExpand: true,
    });
    expect(parsed.reminderStyle).toBe("sweep");
    expect(parsed.reminderAutoExpand).toBe(true);
    expect(() =>
      parseAppearance({
        ...base,
        reminderStyle: "sparkle",
        reminderAutoExpand: false,
      }),
    ).toThrow();
    expect(() =>
      parseAppearance({ ...base, reminderStyle: "pulse" }),
    ).toThrow();
  });

  it("reads the border beam from version 10 only", () => {
    const base = {
      version: 10,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock"],
      islandLyrics: false,
      pomodoroView: "count",
      reminderStyle: "beam",
      reminderAutoExpand: false,
    };
    expect(parseAppearance(base).reminderStyle).toBe("beam");
    expect(() => parseAppearance({ ...base, version: 9 })).toThrow();
  });

  it("preserves old widget order and accepts the companion only in version 11", () => {
    const old = {
      version: 10,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock", "water"],
      islandLyrics: false,
      pomodoroView: "count",
      reminderStyle: "beam",
      reminderAutoExpand: false,
    };
    expect(parseAppearance(old).idleWidgets).toEqual(["clock", "water"]);
    const widgets = ["mascot", "clock", "water"];
    expect(
      parseAppearance({ ...old, version: 11, idleWidgets: widgets })
        .idleWidgets,
    ).toEqual(widgets);
    expect(() => parseAppearance({ ...old, idleWidgets: widgets })).toThrow();
    expect(() =>
      parseAppearance({
        ...old,
        version: 11,
        idleWidgets: ["mascot", "mascot"],
      }),
    ).toThrow();
  });

  it("reads the pomodoro widget view from version 8", () => {
    const base = {
      version: 8,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock", "pomodoro"],
      islandLyrics: false,
    };
    expect(
      parseAppearance({ ...base, pomodoroView: "cycle" }).pomodoroView,
    ).toBe("cycle");
    expect(
      parseAppearance({ ...base, pomodoroView: "count" }).pomodoroView,
    ).toBe("count");
    expect(() =>
      parseAppearance({ ...base, pomodoroView: "unknown" }),
    ).toThrow();
  });

  it("reads hotkeys and notification forwarding from version 13", () => {
    const base = {
      version: 12,
      theme: "dark",
      scale: 1,
      showClock: true,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
      language: "zh-CN",
      idleWidgets: ["clock"],
      islandLyrics: false,
      pomodoroView: "count",
      reminderStyle: "breathe",
      reminderAutoExpand: false,
      expandedShape: "classic",
    };
    // Version 12 data keeps the defaults for the new switches.
    const migrated = parseAppearance(base);
    expect(migrated.hotkeyFocus).toBe(true);
    expect(migrated.hotkeyWater).toBe(true);
    expect(migrated.hotkeyIsland).toBe(true);
    expect(migrated.forwardNotifications).toBe(false);
    const updated = parseAppearance({
      ...base,
      version: 13,
      hotkeyFocus: false,
      hotkeyWater: true,
      hotkeyIsland: false,
      forwardNotifications: true,
    });
    expect(updated.hotkeyFocus).toBe(false);
    expect(updated.hotkeyWater).toBe(true);
    expect(updated.hotkeyIsland).toBe(false);
    expect(updated.forwardNotifications).toBe(true);
    expect(() =>
      parseAppearance({ ...base, version: 13, hotkeyFocus: "yes" }),
    ).toThrow();
    expect(() =>
      parseAppearance({ ...base, version: 13, forwardNotifications: 1 }),
    ).toThrow();
  });
});
