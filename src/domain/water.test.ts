import { describe, expect, it } from "vitest";
import { parseWaterSettings, waterPercent, waterTone } from "./water";

describe("water settings", () => {
  const base = {
    version: 1,
    goalMl: 2000,
    cupMl: 250,
    reminderMinutes: 60,
    activeStart: 9,
    activeEnd: 21,
    enabled: true,
  };

  it("accepts any positive reminder interval", () => {
    for (const minutes of [1, 5, 15, 240, 1440, 99999]) {
      expect(
        parseWaterSettings({ ...base, reminderMinutes: minutes }),
      ).not.toBeNull();
    }
    expect(parseWaterSettings({ ...base, reminderMinutes: 0 })).toBeNull();
    expect(parseWaterSettings({ ...base, reminderMinutes: 2.5 })).toBeNull();
  });
});

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
