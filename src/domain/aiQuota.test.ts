import { describe, expect, it } from "vitest";
import { quotaPercent } from "./aiQuota";
describe("quota ring values", () => {
  it("accepts only real percentages and preserves zero", () => {
    expect(quotaPercent("0%")).toBe(0);
    expect(quotaPercent("72% ")).toBe(72);
    expect(quotaPercent("100%")).toBe(100);
    expect(quotaPercent("12.5%")).toBe(12.5);
    for (const value of [
      "12.30",
      "￥20",
      "-1%",
      "101%",
      "NaN%",
      "",
      "72% extra",
    ])
      expect(quotaPercent(value)).toBeNull();
  });
});
