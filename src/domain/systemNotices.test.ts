import { describe, expect, it } from "vitest";
import { deviceChanges, systemChanges } from "./systemNotices";

describe("system status changes", () => {
  const initial = {
    volume: 50,
    muted: false,
    onAc: true,
    battery: 80,
    charging: true,
  };
  it("does not announce the initial snapshot or unavailable values", () => {
    expect(systemChanges(undefined, initial)).toEqual([]);
    expect(
      systemChanges(initial, { ...initial, volume: null, onAc: null }),
    ).toEqual([]);
    expect(deviceChanges(null, [])).toEqual([]);
    expect(
      deviceChanges([{ id: "1", name: "耳机", battery: 90 }], null),
    ).toEqual([]);
  });
  it("reports simultaneous volume and power changes", () => {
    expect(
      systemChanges(initial, { ...initial, volume: 30, onAc: false }),
    ).toEqual([
      { kind: "volume", label: "音量", value: "30%" },
      { kind: "power", label: "电源已断开", value: "80%" },
    ]);
  });
  it("reports device connection and disconnection with optional battery", () => {
    const headset = { id: "1", name: "耳机", battery: 60 };
    expect(deviceChanges([], [headset])).toEqual([
      { kind: "bluetooth", label: "耳机", value: "已连接 · 60%" },
    ]);
    expect(deviceChanges([headset], [])).toEqual([
      { kind: "bluetooth", label: "耳机", value: "已断开" },
    ]);
  });
});
