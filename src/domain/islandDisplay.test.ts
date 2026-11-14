import { describe, expect, it } from "vitest";
import {
  alertKindFor,
  alertTokenFor,
  selectIslandDisplay,
  shouldBlockHoverExpansion,
} from "./islandDisplay";

describe("island display priority", () => {
  const idle = {
    timer: "idle" as const,
    mail: false,
    notice: false,
    water: false,
    waterLogged: false,
    sedentary: false,
    sedentaryLogged: false,
    media: false,
  };
  it("keeps a completed timer above transient notices", () => {
    expect(
      selectIslandDisplay({
        timer: "finished",
        mail: true,
        notice: true,
        water: true,
        waterLogged: true,
        sedentary: true,
        sedentaryLogged: true,
        media: true,
      }),
    ).toBe("finished");
  });
  it("lets a transient notice interrupt mail and ongoing activities", () => {
    expect(
      selectIslandDisplay({
        timer: "running",
        mail: true,
        notice: true,
        water: true,
        waterLogged: true,
        sedentary: true,
        sedentaryLogged: true,
        media: true,
      }),
    ).toBe("notice");
    expect(
      selectIslandDisplay({
        ...idle,
        mail: true,
        notice: true,
      }),
    ).toBe("notice");
  });
  it("shows new mail before ongoing activities", () => {
    expect(
      selectIslandDisplay({
        timer: "running",
        mail: true,
        notice: false,
        water: false,
        waterLogged: false,
        sedentary: false,
        sedentaryLogged: false,
        media: true,
      }),
    ).toBe("mail");
  });
  it("shows a water reminder when idle without interrupting a focus session", () => {
    expect(selectIslandDisplay({ ...idle, water: true, media: true })).toBe(
      "water",
    );
    expect(
      selectIslandDisplay({ ...idle, timer: "running", water: true }),
    ).toBe("timer");
  });
  it("shows a stand-up reminder below the water one and never during focus", () => {
    expect(selectIslandDisplay({ ...idle, water: true, sedentary: true })).toBe(
      "water",
    );
    expect(selectIslandDisplay({ ...idle, sedentary: true, media: true })).toBe(
      "sedentary",
    );
    expect(
      selectIslandDisplay({ ...idle, timer: "running", sedentary: true }),
    ).toBe("timer");
  });
  it("confirms a logged cup below reminders and without interrupting focus", () => {
    // The confirmation never overrides the reminder it answers.
    expect(
      selectIslandDisplay({ ...idle, water: true, waterLogged: true }),
    ).toBe("water");
    expect(
      selectIslandDisplay({ ...idle, timer: "running", waterLogged: true }),
    ).toBe("timer");
    expect(selectIslandDisplay({ ...idle, waterLogged: true })).toBe(
      "waterLogged",
    );
    expect(
      selectIslandDisplay({ ...idle, waterLogged: true, media: true }),
    ).toBe("waterLogged");
  });
  it("confirms a logged stand below the reminder and media", () => {
    expect(
      selectIslandDisplay({ ...idle, sedentary: true, sedentaryLogged: true }),
    ).toBe("sedentary");
    expect(selectIslandDisplay({ ...idle, sedentaryLogged: true })).toBe(
      "sedentaryLogged",
    );
    expect(
      selectIslandDisplay({ ...idle, sedentaryLogged: true, media: true }),
    ).toBe("sedentaryLogged");
    expect(
      selectIslandDisplay({ ...idle, timer: "running", sedentaryLogged: true }),
    ).toBe("timer");
  });
  it("falls back through notice, timer, media and idle", () => {
    expect(selectIslandDisplay({ ...idle, notice: true, media: true })).toBe(
      "notice",
    );
    expect(selectIslandDisplay({ ...idle, timer: "paused", media: true })).toBe(
      "timer",
    );
    expect(selectIslandDisplay({ ...idle, media: true })).toBe("media");
    expect(selectIslandDisplay(idle)).toBe("idle");
  });
});

describe("hover expansion with actionable capsules", () => {
  it("keeps reminder controls and notification details clickable", () => {
    for (const display of ["water", "sedentary", "mail", "finished"] as const) {
      expect(shouldBlockHoverExpansion(display, null)).toBe(true);
    }
    expect(shouldBlockHoverExpansion("notice", "notification")).toBe(true);
  });

  it("allows the capsule body to open on hover with a WeChat badge", () => {
    for (const display of ["idle", "media", "timer"] as const) {
      expect(shouldBlockHoverExpansion(display, null)).toBe(false);
    }
    expect(shouldBlockHoverExpansion("notice", "volume")).toBe(false);
    expect(shouldBlockHoverExpansion("waterLogged", null)).toBe(false);
  });
});

describe("island alert chrome", () => {
  it("maps each reminder display to its alert kind", () => {
    expect(alertKindFor("finished")).toBe("timer");
    expect(alertKindFor("mail")).toBe("mail");
    expect(alertKindFor("water")).toBe("water");
    expect(alertKindFor("waterLogged")).toBe("water");
    expect(alertKindFor("sedentary")).toBe("sedentary");
    expect(alertKindFor("sedentaryLogged")).toBe("sedentary");
  });
  it("splits notices from forwarded notifications", () => {
    expect(alertKindFor("notice", "notification")).toBe("notification");
    expect(alertKindFor("notice", "volume")).toBe("notice");
    expect(alertKindFor("notice", null)).toBe("notice");
  });
  it("leaves non-reminder displays without chrome", () => {
    expect(alertKindFor("idle")).toBeNull();
    expect(alertKindFor("media")).toBeNull();
    expect(alertKindFor("timer")).toBeNull();
  });
  it("builds tokens that differ per payload but repeat for identical nudges", () => {
    expect(alertTokenFor("water", "")).toBe("water:");
    expect(alertTokenFor(null, "ignored")).toBe("");
    expect(alertTokenFor("mail", "a|b|123")).toBe("mail:a|b|123");
    const notification = alertTokenFor("notification", "", "应用", "文本");
    expect(notification).toBe("notification::应用:文本");
    expect(alertTokenFor("notification", "", "应用", "其他")).not.toBe(
      notification,
    );
    expect(alertTokenFor("notification", "", "应用", "文本")).toBe(
      notification,
    );
  });
  it("distinguishes repeated notifications without relying on their text", () => {
    const first = alertTokenFor("notification", "", "应用", "新通知", 1);
    const second = alertTokenFor("notification", "", "应用", "新通知", 2);
    expect(first).not.toBe(second);
    expect(first).not.toContain("新通知");
  });
});
