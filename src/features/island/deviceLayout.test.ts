import { describe, expect, it } from "vitest";
import type { AudioDevice } from "../../domain/systemNotices";
import { deviceLayout } from "./deviceLayout";

function devices(outputs: number, inputs: number): AudioDevice[] {
  return [
    ...Array.from({ length: outputs }, (_, index) => ({
      id: `out-${index}`,
      name: `扬声器 ${index}`,
      isDefault: index === 0,
      direction: "output" as const,
    })),
    ...Array.from({ length: inputs }, (_, index) => ({
      id: `in-${index}`,
      name: `麦克风 ${index}`,
      isDefault: index === 0,
      direction: "input" as const,
    })),
  ];
}

describe("device page layout", () => {
  it("keeps short lists in one column at full height", () => {
    expect(deviceLayout(null)).toMatchObject({
      columns: 1,
      rows: 2,
      rowHeight: 26,
      panelHeight: 162,
    });
    expect(deviceLayout(devices(2, 1))).toMatchObject({
      columns: 1,
      rows: 3,
      rowHeight: 26,
      panelHeight: 188,
    });
  });
  it("shrinks rows before folding into columns", () => {
    expect(deviceLayout(devices(5, 4))).toMatchObject({
      columns: 1,
      rows: 9,
      rowHeight: 18,
      panelHeight: 272,
    });
  });
  it("folds longer lists into two columns", () => {
    expect(deviceLayout(devices(5, 5))).toMatchObject({
      columns: 2,
      rows: 6,
      rowHeight: 26,
      panelHeight: 266,
    });
    expect(deviceLayout(devices(10, 10))).toMatchObject({
      columns: 2,
      rows: 10,
      rowHeight: 16,
      panelHeight: 270,
    });
  });
  it("adds columns for unreasonable endpoint counts", () => {
    expect(deviceLayout(devices(20, 20))).toMatchObject({
      columns: 4,
      rows: 10,
      rowHeight: 16,
      panelHeight: 270,
    });
  });
  it("counts an empty group as one row", () => {
    expect(deviceLayout(devices(0, 8))).toMatchObject({
      columns: 1,
      rows: 9,
      rowHeight: 18,
    });
  });
});
