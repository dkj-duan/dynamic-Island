import { describe, expect, it } from "vitest";
import { selectIslandDisplay } from "./islandDisplay";

describe("island display priority", () => {
  const idle = {
    timer: "idle" as const,
    mail: false,
    notice: false,
    water: false,
    waterLogged: false,
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
