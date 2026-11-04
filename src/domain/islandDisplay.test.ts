import { describe, expect, it } from "vitest";
import { selectIslandDisplay } from "./islandDisplay";

describe("island display priority", () => {
  it("keeps a completed timer above transient notices", () => {
    expect(
      selectIslandDisplay({
        timer: "finished",
        mail: true,
        notice: true,
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
        media: true,
      }),
    ).toBe("notice");
    expect(
      selectIslandDisplay({
        timer: "idle",
        mail: true,
        notice: true,
        media: false,
      }),
    ).toBe("notice");
  });
  it("shows new mail before ongoing activities", () => {
    expect(
      selectIslandDisplay({
        timer: "running",
        mail: true,
        notice: false,
        media: true,
      }),
    ).toBe("mail");
  });
  it("falls back through notice, timer, media and idle", () => {
    const state = {
      timer: "idle" as const,
      mail: false,
      notice: false,
      media: false,
    };
    expect(selectIslandDisplay({ ...state, notice: true, media: true })).toBe(
      "notice",
    );
    expect(
      selectIslandDisplay({ ...state, timer: "paused", media: true }),
    ).toBe("timer");
    expect(selectIslandDisplay({ ...state, media: true })).toBe("media");
    expect(selectIslandDisplay(state)).toBe("idle");
  });
});
