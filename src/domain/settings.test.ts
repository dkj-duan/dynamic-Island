import { describe, expect, it } from "vitest";
import { parseAppearance } from "./settings";

describe("parseAppearance", () => {
  it("accepts supported settings", () => {
    expect(
      parseAppearance({ version: 1, scale: 1.1, showClock: false }),
    ).toEqual({
      theme: "system",
      scale: 1.1,
      showClock: false,
      autoCollapseSeconds: 3,
      expandTrigger: "click",
    });
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
});
