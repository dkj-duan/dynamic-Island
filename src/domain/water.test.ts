import { describe, expect, it } from "vitest";
import { waterPercent, waterTone } from "./water";

describe("water status tone", () => {
  it("marks low, normal and reached states", () => {
    expect(waterTone(0, 2000)).toBe("low");
    expect(waterTone(799, 2000)).toBe("low");
    expect(waterTone(800, 2000)).toBe("mid");
    expect(waterTone(1999, 2000)).toBe("mid");
    expect(waterTone(2000, 2000)).toBe("done");
    expect(waterTone(0, 0)).toBe("mid");
  });

  it("clamps the percentage", () => {
    expect(waterPercent(1000, 2000)).toBe(50);
    expect(waterPercent(4000, 2000)).toBe(100);
    expect(waterPercent(-5, 2000)).toBe(0);
  });
});
