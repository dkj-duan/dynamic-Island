import { describe, expect, it } from "vitest";
import {
  defaultAppearance,
  idleWidgetIds,
  type IdleWidgetId,
} from "../../domain/settings";
import {
  availableIdleWidgets,
  IDLE_WIDGET_MODES,
  previewIdleWidgets,
  type IdleChangeShownAt,
  type IdleData,
} from "./idleWidgetData";

const data: IdleData = {
  quota: { provider: "deepseek", items: [] },
  water: { percent: 50 },
  pomodoros: 2,
  battery: { percent: 80, charging: false },
  focusMinutes: 25,
  streak: 3,
  volume: { percent: 40, muted: false },
  bluetooth: { name: "耳机", battery: 70 },
  waterTimer: { minutes: 20 },
  countdown: { label: "下班", remainingMs: 60_000, reached: false },
  sedentary: { minutes: 30, over: false, reached: false },
};

const appearance = {
  ...defaultAppearance,
  idleWidgets: [
    "clock",
    "quota",
    "volume",
    "battery",
    "bluetooth",
    "focus",
    "streak",
    "water",
  ] as IdleWidgetId[],
};

function context(
  now: number,
  changeShownAt: IdleChangeShownAt,
): { now: number; changeWindowMs: number; changeShownAt: IdleChangeShownAt } {
  return { now, changeWindowMs: 180_000, changeShownAt };
}

describe("idle widget modes", () => {
  it("classifies every widget into exactly one tier", () => {
    const ids = Object.keys(IDLE_WIDGET_MODES) as IdleWidgetId[];
    expect(new Set(ids)).toEqual(new Set(idleWidgetIds));
    for (const id of ids) {
      expect(["persistent", "active", "change"]).toContain(
        IDLE_WIDGET_MODES[id],
      );
    }
  });

  it("keeps persistent widgets and hides silent change widgets", () => {
    const widgets = availableIdleWidgets(appearance, data, context(1000, {}));
    expect(widgets).toEqual(["clock", "quota", "water"]);
  });

  it("shows change widgets inside the window and expires them after", () => {
    const shown = availableIdleWidgets(
      appearance,
      data,
      context(1000, { volume: 500, battery: 0 }),
    );
    // Speaking change widgets always render at the tail of the capsule,
    // after the ambient widgets, whatever place they hold in the order.
    expect(shown).toEqual(["clock", "quota", "water", "volume", "battery"]);
    // Exactly at the window boundary the widget has said its piece.
    const expired = availableIdleWidgets(
      appearance,
      data,
      context(180_000, { volume: 0 }),
    );
    expect(expired).toEqual(["clock", "quota", "water"]);
  });

  it("keeps legacy behaviour without a tracking context", () => {
    // The width cap still applies; the tail is cut by priority order.
    const widgets = availableIdleWidgets(appearance, data);
    expect(widgets).toEqual([
      "clock",
      "quota",
      "volume",
      "battery",
      "bluetooth",
      "focus",
    ]);
  });

  it("caps the visible widgets by priority order", () => {
    const crowded = {
      ...appearance,
      idleWidgets: [
        "volume",
        "battery",
        "bluetooth",
        "focus",
        "streak",
        "water",
        "clock",
        "quota",
      ] as IdleWidgetId[],
    };
    const widgets = availableIdleWidgets(crowded, data);
    expect(widgets).toHaveLength(6);
    expect(widgets).not.toContain("clock");
  });

  it("a speaking change widget displaces the lowest-priority ambient one", () => {
    // The first six ambient widgets would normally park in every slot and
    // starve the change widgets sitting behind them in the order.
    const crowded = {
      ...appearance,
      idleWidgets: [
        "clock",
        "mascot",
        "quota",
        "water",
        "pomodoro",
        "countdown",
        "volume",
      ] as IdleWidgetId[],
    };
    const steady = availableIdleWidgets(crowded, data, context(1000, {}));
    expect(steady).not.toContain("volume");
    const speaking = availableIdleWidgets(
      crowded,
      data,
      context(1000, { volume: 500 }),
    );
    expect(speaking).toEqual([
      "clock",
      "mascot",
      "quota",
      "water",
      "pomodoro",
      "volume",
    ]);
    expect(speaking).toHaveLength(6);
  });
});

describe("preview idle widgets", () => {
  it("shows every enabled ambient widget without the width cap", () => {
    const appearance = {
      ...defaultAppearance,
      idleWidgets: [
        "volume",
        "clock",
        "battery",
        "quota",
        "music",
        "countdown",
        "water",
      ] as IdleWidgetId[],
    };
    expect(previewIdleWidgets(appearance)).toEqual([
      "clock",
      "quota",
      "music",
      "countdown",
      "water",
    ]);
  });
});
