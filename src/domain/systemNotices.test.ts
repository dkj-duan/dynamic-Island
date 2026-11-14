import { describe, expect, it } from "vitest";
import {
  deviceChanges,
  acknowledgeWechatAttention,
  nextWechatAttention,
  notificationSource,
  systemChanges,
  wechatMessageView,
} from "./systemNotices";

describe("WeChat notification routing and privacy", () => {
  it("only acknowledges the reminder that was actually viewed", () => {
    const old = { id: 1, preview: false };
    const newer = nextWechatAttention(old, { id: 2, preview: false });
    expect(acknowledgeWechatAttention(newer, old.id)).toEqual(newer);
    expect(acknowledgeWechatAttention(newer, 2)).toBeNull();
    expect(nextWechatAttention(newer, { id: 3, preview: true })).toEqual(newer);
    expect(nextWechatAttention(null, { id: 3, preview: true })).toEqual({
      id: 3,
      preview: true,
    });
  });
  it("routes the local watcher and known system toast names to WeChat", () => {
    expect(notificationSource("微信", "wechat")).toBe("wechat");
    expect(notificationSource("WeChat", "system")).toBe("wechat");
    expect(notificationSource("其他应用", "system")).toBe("system");
  });

  it("hides the sender and message when message content is disabled", () => {
    expect(wechatMessageView("小明：你好", true)).toEqual({
      sender: "小明",
      text: "你好",
    });
    expect(wechatMessageView("小明：你好", false)).toEqual({
      sender: "",
      text: null,
    });
    expect(wechatMessageView("普通通知", true)).toEqual({
      sender: "",
      text: "普通通知",
    });
  });
});

describe("system status changes", () => {
  const initial = {
    volume: 50,
    muted: false,
    onAc: true,
    battery: 80,
    charging: true,
    outputDevice: {
      id: "a",
      name: "耳机 A",
      isDefault: true,
      direction: "output" as const,
    },
    inputDevice: {
      id: "m",
      name: "麦克风 A",
      isDefault: true,
      direction: "input" as const,
    },
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
  it("reports output device switches", () => {
    expect(
      systemChanges(initial, {
        ...initial,
        outputDevice: {
          id: "b",
          name: "耳机 B",
          isDefault: true,
          direction: "output" as const,
        },
      }),
    ).toEqual([{ kind: "audio", label: "输出设备", value: "耳机 B" }]);
    expect(
      systemChanges(initial, {
        ...initial,
        outputDevice: {
          id: "a",
          name: "耳机 A",
          isDefault: true,
          direction: "output" as const,
        },
      }),
    ).toEqual([]);
  });
  it("reports input device switches", () => {
    expect(
      systemChanges(initial, {
        ...initial,
        inputDevice: {
          id: "n",
          name: "麦克风 B",
          isDefault: true,
          direction: "input" as const,
        },
      }),
    ).toEqual([{ kind: "audio", label: "输入设备", value: "麦克风 B" }]);
  });
  it("prefers the device notice over the volume side effect", () => {
    expect(
      systemChanges(initial, {
        ...initial,
        volume: 12,
        outputDevice: {
          id: "b",
          name: "耳机 B",
          isDefault: true,
          direction: "output" as const,
        },
      }),
    ).toEqual([{ kind: "audio", label: "输出设备", value: "耳机 B" }]);
  });
});
