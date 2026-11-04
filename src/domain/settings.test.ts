import { describe, expect, it } from "vitest";
import { parseAppearance } from "./settings";

describe("parseAppearance", () => {
  it("accepts supported settings", () => {
    expect(
      parseAppearance({ version: 1, scale: 1.1, showClock: false }),
    ).toEqual({ scale: 1.1, showClock: false, autoCollapseSeconds: 3 });
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
