import { describe, expect, it } from "vitest";
import { aiProviderName, quotaPercent, quotaRings } from "./aiQuota";
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
describe("quota rings", () => {
  it("keeps only percentage items and caps the rings at two", () => {
    const items = [
      { label: "订阅", value: "80%" },
      { label: "余额", value: "￥20" },
      { label: "5 小时", value: "12.5%" },
      { label: "月度", value: "64%" },
    ];
    expect(quotaRings(items)).toEqual([
      { item: items[0], percent: 80 },
      { item: items[2], percent: 12.5 },
    ]);
  });
  it("returns nothing when no item is a percentage", () => {
    expect(quotaRings([{ label: "余额", value: "$3.2" }])).toEqual([]);
  });
  it("reads values with surrounding whitespace", () => {
    const item = { label: "每周", value: " 55% " };
    expect(quotaRings([item])).toEqual([{ item, percent: 55 }]);
  });
});
describe("provider names", () => {
  it("maps known providers and passes unknown ids through", () => {
    expect(aiProviderName("codex-local")).toBe("Codex");
    expect(aiProviderName("kimi-local")).toBe("Kimi");
    expect(aiProviderName("minimax-global")).toBe("MiniMax 国际");
    expect(aiProviderName("future-provider")).toBe("future-provider");
  });
});
