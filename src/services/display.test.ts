import { describe, expect, it } from "vitest";
import {
  LARGE_DISPLAY_MIN_WIDTH,
  largeDisplayForWidth,
  settingsZoomForWidth,
} from "./display";

describe("display tier", () => {
  it("treats desktop resolutions in CSS pixels correctly", () => {
    // CSS pixels already include Windows scaling.
    expect(largeDisplayForWidth(1366)).toBe(false);
    expect(largeDisplayForWidth(1920)).toBe(false);
    // 2560×1440 at 125% scaling reports 2048 CSS pixels.
    expect(largeDisplayForWidth(2048)).toBe(false);
    // 2560×1440 at 100% scaling.
    expect(largeDisplayForWidth(2560)).toBe(true);
    // 3840×2160 at 150% scaling.
    expect(largeDisplayForWidth(2560)).toBe(true);
  });
  it("switches exactly at the documented threshold", () => {
    expect(largeDisplayForWidth(LARGE_DISPLAY_MIN_WIDTH - 1)).toBe(false);
    expect(largeDisplayForWidth(LARGE_DISPLAY_MIN_WIDTH)).toBe(true);
  });
  it("zooms the settings page for the monitor size", () => {
    expect(settingsZoomForWidth(1366)).toBe(1.06);
    expect(settingsZoomForWidth(1920)).toBe(1.12);
    expect(settingsZoomForWidth(2560)).toBe(1.16);
    expect(settingsZoomForWidth(3840)).toBe(1.2);
  });
});
