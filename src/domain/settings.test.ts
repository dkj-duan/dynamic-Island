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
      idleChangeDisplayMinutes: 3,
      pomodoroView: "count",
      islandLyrics: false,
      reminderStyle: "breathe",
      reminderAutoExpand: false,
      hotkeyFocus: { combo: "Ctrl+Alt+P", double: false },
      hotkeyWater: { combo: "Ctrl+Alt+W", double: false },
      hotkeyIsland: { combo: "Ctrl+Alt+E", double: false },
      forwardNotifications: false,
      notificationSources: {
        wechat: { enabled: false, expand: false, showText: true, seconds: 3 },
        qq: { enabled: false, expand: false, showText: true, seconds: 3 },
      },
      noticeExpand: false,
      noticeShowText: true,
      noticeDisplaySeconds: 3,
      reminderDisplaySeconds: 20,
      fullscreenAvoid: true,
      taskbarMode: false,
      snapToTop: true,
    });
  });
  it("defaults old settings to disabled and validates the WeChat switch", () => {
    const old = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 17,
    };
    expect(parseAppearance(old).notificationSources.wechat.enabled).toBe(false);
    expect(
      parseAppearance({ ...old, version: 18, wechatNotifications: true })
        .notificationSources.wechat.enabled,
    ).toBe(true);
    expect(() =>
      parseAppearance({ ...old, version: 18, wechatNotifications: "yes" }),
    ).toThrow();
    expect(() =>
      parseAppearance({ ...old, version: 18, wechatNotifications: undefined }),
    ).toThrow();
  });
  it("migrates independent WeChat display settings and rejects invalid data", () => {
    const old = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 21,
      wechatNotifications: false,
      noticeExpand: true,
      noticeShowText: false,
      noticeDisplaySeconds: 10,
    };
    expect(parseAppearance(old)).toMatchObject({
      noticeExpand: true,
      notificationSources: {
        wechat: { enabled: false, expand: false, showText: false, seconds: 10 },
        qq: { enabled: false, expand: false, showText: true, seconds: 3 },
      },
    });
    const next = {
      ...old,
      version: 22,
      wechatNoticeExpand: true,
      wechatShowText: true,
      wechatDisplaySeconds: 5,
    };
    expect(parseAppearance(next)).toMatchObject({
      noticeExpand: true,
      notificationSources: {
        wechat: { enabled: false, expand: true, showText: true, seconds: 5 },
      },
    });
    for (const invalid of [
      { wechatNoticeExpand: undefined },
      { wechatShowText: "yes" },
      { wechatDisplaySeconds: 4 },
    ]) {
      expect(() => parseAppearance({ ...next, ...invalid })).toThrow();
    }
  });
  it("folds WeChat settings into per-source entries and validates QQ in version 23", () => {
    const v22 = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 22,
      wechatNotifications: true,
      wechatNoticeExpand: true,
      wechatShowText: true,
      wechatDisplaySeconds: 10,
    };
    const migrated = parseAppearance(v22);
    expect(migrated.notificationSources.wechat).toEqual({
      enabled: true,
      expand: true,
      showText: true,
      seconds: 10,
    });
    expect(migrated.notificationSources.qq).toEqual({
      enabled: false,
      expand: false,
      showText: true,
      seconds: 3,
    });
    const sources = {
      wechat: { enabled: true, expand: false, showText: false, seconds: 5 },
      qq: { enabled: true, expand: false, showText: false, seconds: 3 },
    };
    const v23 = { ...v22, version: 23, notificationSources: sources };
    expect(parseAppearance(v23).notificationSources).toEqual(sources);
    for (const bad of [
      { notificationSources: undefined },
      {
        notificationSources: {
          wechat: sources.wechat,
        },
      },
      {
        notificationSources: {
          ...sources,
          dingtalk: {
            enabled: false,
            expand: false,
            showText: false,
            seconds: 3,
          },
        },
      },
      {
        notificationSources: {
          ...sources,
          qq: { ...sources.qq, seconds: 4 },
        },
      },
      {
        notificationSources: {
          ...sources,
          qq: { ...sources.qq, showText: "yes" },
        },
      },
    ]) {
      expect(() => parseAppearance({ ...v22, version: 23, ...bad })).toThrow();
    }
  });
  it("migrates taskbar mode and rejects invalid values", () => {
    const old = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 18,
      wechatNotifications: false,
    };
    expect(parseAppearance(old).taskbarMode).toBe(false);
    expect(
      parseAppearance({ ...old, version: 19, taskbarMode: true }).taskbarMode,
    ).toBe(true);
    expect(() =>
      parseAppearance({ ...old, version: 19, taskbarMode: undefined }),
    ).toThrow();
  });
  it("migrates the change widget display time and rejects invalid values", () => {
    const old = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 19,
      wechatNotifications: false,
    };
    expect(parseAppearance(old).idleChangeDisplayMinutes).toBe(3);
    expect(
      parseAppearance({ ...old, version: 20, idleChangeDisplayMinutes: 10 })
        .idleChangeDisplayMinutes,
    ).toBe(10);
    for (const bad of [0, 3.5, 61, "3", undefined]) {
      expect(() =>
        parseAppearance({ ...old, version: 20, idleChangeDisplayMinutes: bad }),
      ).toThrow();
    }
  });
  it("preserves old collapse delays and accepts tenths of a second in version 21", () => {
    const old = {
      ...parseAppearance({ version: 1, scale: 1, showClock: true }),
      version: 20,
      wechatNotifications: false,
    };
    expect(parseAppearance(old).autoCollapseSeconds).toBe(3);
    for (const seconds of [0, 0.1, 0.5, 1, 2.3, 60]) {
      expect(
        parseAppearance({ ...old, version: 21, autoCollapseSeconds: seconds })
          .autoCollapseSeconds,
      ).toBe(seconds);
    }
    for (const seconds of [-0.1, 0.01, 60.1, NaN, Infinity, "0.5"]) {
      expect(() =>
        parseAppearance({ ...old, version: 21, autoCollapseSeconds: seconds }),
      ).toThrow();
    }
    expect(() =>
      parseAppearance({ ...old, autoCollapseSeconds: 0.5 }),
    ).toThrow();
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
    // Version 12 data keeps the default bindings for the new actions.
    const migrated = parseAppearance(base);
    expect(migrated.hotkeyFocus).toEqual({
      combo: "Ctrl+Alt+P",
      double: false,
    });
    expect(migrated.hotkeyWater).toEqual({
      combo: "Ctrl+Alt+W",
      double: false,
    });
    expect(migrated.hotkeyIsland).toEqual({
      combo: "Ctrl+Alt+E",
      double: false,
    });
    expect(migrated.forwardNotifications).toBe(false);
    // Version 14 data falls back to the forwarded-notification defaults.
    expect(migrated.noticeExpand).toBe(false);
    expect(migrated.noticeShowText).toBe(true);
    expect(migrated.noticeDisplaySeconds).toBe(3);
    expect(migrated.reminderDisplaySeconds).toBe(20);
    expect(migrated.fullscreenAvoid).toBe(true);
    const updated = parseAppearance({
      ...base,
      version: 13,
      hotkeyFocus: null,
      hotkeyWater: { combo: "F9", double: true },
      hotkeyIsland: { combo: "Ctrl+Shift+Space", double: false },
      forwardNotifications: true,
    });
    expect(updated.hotkeyFocus).toBeNull();
    expect(updated.hotkeyWater).toEqual({ combo: "F9", double: true });
    expect(updated.hotkeyIsland).toEqual({
      combo: "Ctrl+Shift+Space",
      double: false,
    });
    expect(updated.forwardNotifications).toBe(true);
    // Combos must be modifiers plus exactly one key; a lone modifier is only
    // valid as a double-press gesture.
    for (const combo of [
      "",
      "Ctrl",
      "Ctrl+Alt",
      "Ctrl+P+Q",
      "J",
      "Ctrl+F25",
      "Ctrl+Alt+Ctrl",
    ]) {
      expect(() =>
        parseAppearance({
          ...base,
          version: 13,
          hotkeyWater: { combo, double: false },
        }),
      ).toThrow();
    }
    for (const combo of ["Win", "J", "Ctrl+Alt", "Space"]) {
      expect(() =>
        parseAppearance({
          ...base,
          version: 13,
          hotkeyWater: { combo, double: true },
        }),
      ).toThrow();
    }
    const tapped = parseAppearance({
      ...base,
      version: 13,
      hotkeyFocus: null,
      hotkeyIsland: null,
      hotkeyWater: { combo: "Alt", double: true },
      forwardNotifications: false,
    });
    expect(tapped.hotkeyWater).toEqual({ combo: "Alt", double: true });
    // Version 14 reads the forwarded-notification display switches.
    const v14 = parseAppearance({
      ...base,
      version: 14,
      hotkeyFocus: null,
      hotkeyIsland: null,
      hotkeyWater: null,
      forwardNotifications: true,
      noticeExpand: true,
      noticeShowText: false,
    });
    expect(v14.noticeExpand).toBe(true);
    expect(v14.noticeShowText).toBe(false);
    for (const notice of [
      { noticeExpand: "yes", noticeShowText: true },
      { noticeExpand: true, noticeShowText: 1 },
    ]) {
      expect(() =>
        parseAppearance({
          ...base,
          version: 14,
          hotkeyFocus: null,
          hotkeyIsland: null,
          hotkeyWater: null,
          forwardNotifications: true,
          ...notice,
        }),
      ).toThrow();
    }
    // Version 15 reads the capsule display duration for notifications.
    const v15 = parseAppearance({
      ...base,
      version: 15,
      hotkeyFocus: null,
      hotkeyIsland: null,
      hotkeyWater: null,
      forwardNotifications: true,
      noticeExpand: true,
      noticeShowText: false,
      noticeDisplaySeconds: 10,
    });
    expect(v15.noticeDisplaySeconds).toBe(10);
    for (const seconds of [4, "5", null]) {
      expect(() =>
        parseAppearance({
          ...base,
          version: 15,
          hotkeyFocus: null,
          hotkeyIsland: null,
          hotkeyWater: null,
          forwardNotifications: true,
          noticeExpand: true,
          noticeShowText: true,
          noticeDisplaySeconds: seconds,
        }),
      ).toThrow();
    }
    // Version 16 reads the reminder display duration.
    const v16 = parseAppearance({
      ...base,
      version: 16,
      hotkeyFocus: null,
      hotkeyIsland: null,
      hotkeyWater: null,
      forwardNotifications: true,
      noticeExpand: true,
      noticeShowText: true,
      noticeDisplaySeconds: 10,
      reminderDisplaySeconds: 30,
    });
    expect(v16.reminderDisplaySeconds).toBe(30);
    // Version 17 reads the fullscreen-avoidance switch.
    const v17 = parseAppearance({
      ...base,
      version: 17,
      hotkeyFocus: null,
      hotkeyIsland: null,
      hotkeyWater: null,
      forwardNotifications: true,
      noticeExpand: true,
      noticeShowText: true,
      noticeDisplaySeconds: 10,
      reminderDisplaySeconds: 30,
      fullscreenAvoid: false,
    });
    expect(v17.fullscreenAvoid).toBe(false);
    expect(() =>
      parseAppearance({
        ...base,
        version: 17,
        hotkeyFocus: null,
        hotkeyIsland: null,
        hotkeyWater: null,
        forwardNotifications: true,
        noticeExpand: true,
        noticeShowText: true,
        noticeDisplaySeconds: 10,
        reminderDisplaySeconds: 30,
        fullscreenAvoid: "on",
      }),
    ).toThrow();
    for (const seconds of [45, "30", true]) {
      expect(() =>
        parseAppearance({
          ...base,
          version: 16,
          hotkeyFocus: null,
          hotkeyIsland: null,
          hotkeyWater: null,
          forwardNotifications: true,
          noticeExpand: true,
          noticeShowText: true,
          noticeDisplaySeconds: 10,
          reminderDisplaySeconds: seconds,
        }),
      ).toThrow();
    }
    expect(() =>
      parseAppearance({ ...base, version: 13, hotkeyFocus: "yes" }),
    ).toThrow();
    expect(() =>
      parseAppearance({ ...base, version: 13, forwardNotifications: 1 }),
    ).toThrow();
  });
});
