import { useEffect, useState } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import {
  BatteryCharging,
  Bluetooth,
  RefreshCw,
  Sun,
  Volume2,
} from "lucide-react";
import type {
  BluetoothStatus,
  SystemNotice,
  SystemStatus,
} from "../../domain/systemNotices";
import { t } from "../../services/i18n";

type DeviceStatus = {
  brightness: number | null;
  bluetooth: BluetoothStatus[] | null;
};
type Result<T> =
  { state: "loading" } | { state: "error" } | { state: "ready"; value: T };

export function StatusSettings() {
  const desktop = isTauri();
  const [system, setSystem] = useState<Result<SystemStatus>>({
    state: "loading",
  });
  const [devices, setDevices] = useState<Result<DeviceStatus>>({
    state: "loading",
  });
  const [revision, setRevision] = useState(0);
  const [previewMessage, setPreviewMessage] = useState("");
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    void invoke<SystemStatus>("get_system_status")
      .then((value) => {
        if (active) setSystem({ state: "ready", value });
      })
      .catch(() => {
        if (active) setSystem({ state: "error" });
      });
    void invoke<DeviceStatus>("get_device_status")
      .then((value) => {
        if (active) setDevices({ state: "ready", value });
      })
      .catch(() => {
        if (active) setDevices({ state: "error" });
      });
    return () => {
      active = false;
    };
  }, [desktop, revision]);

  function refresh() {
    setSystem({ state: "loading" });
    setDevices({ state: "loading" });
    setRevision((value) => value + 1);
  }
  async function preview(notice: SystemNotice) {
    try {
      await emitTo("island", "system-notice-preview", notice);
      setPreviewMessage(t("演示已发送到屏幕顶部的灵动岛。"));
    } catch {
      setPreviewMessage(t("演示发送失败，请确认灵动岛正在运行。"));
    }
  }
  const systemText = (format: (value: SystemStatus) => string) =>
    !desktop
      ? t("请在桌面应用中查看")
      : system.state === "loading"
        ? t("正在读取…")
        : system.state === "error"
          ? t("读取失败")
          : format(system.value);
  const deviceText = (format: (value: DeviceStatus) => string) =>
    !desktop
      ? t("请在桌面应用中查看")
      : devices.state === "loading"
        ? t("正在读取…")
        : devices.state === "error"
          ? t("读取失败")
          : format(devices.value);
  const rows = [
    {
      icon: Volume2,
      title: t("音量"),
      description: t("系统音量或静音状态变化"),
      status: systemText((value) =>
        value.volume === null
          ? t("当前输出设备不可读取")
          : value.muted
            ? t("已静音")
            : `当前 ${value.volume}%`,
      ),
      notice: {
        kind: "volume",
        label: t("演示 · 音量"),
        value: "65%",
      } as SystemNotice,
    },
    {
      icon: Sun,
      title: t("屏幕亮度"),
      description: t("需显示器与驱动提供亮度数据"),
      status: deviceText((value) =>
        value.brightness === null
          ? t("当前显示器未提供")
          : `当前 ${value.brightness}%`,
      ),
      notice: {
        kind: "brightness",
        label: t("演示 · 亮度"),
        value: "75%",
      } as SystemNotice,
    },
    {
      icon: BatteryCharging,
      title: t("电源与电池"),
      description: t("接通或断开电源时显示电量"),
      status: systemText((value) =>
        value.battery === null
          ? t("未检测到电池")
          : `${value.charging ? t("充电中") : value.onAc ? t("已接通电源") : t("使用电池")} · ${value.battery}%`,
      ),
      notice: {
        kind: "power",
        label: t("演示 · 充电中"),
        value: "80%",
      } as SystemNotice,
    },
    {
      icon: Bluetooth,
      title: t("蓝牙设备"),
      description: t("连接或断开时显示名称与电量"),
      status: deviceText((value) =>
        value.bluetooth === null
          ? t("暂不可读取")
          : value.bluetooth.length
            ? `${value.bluetooth.length} ${t("台设备已连接")}`
            : t("未检测到设备"),
      ),
      notice: {
        kind: "bluetooth",
        label: t("演示 · 蓝牙耳机"),
        value: "已连接",
      } as SystemNotice,
    },
  ];
  return (
    <section className="settings-card">
      <div className="card-head">
        <h2>{t("当前状态")}</h2>
        <button className="btn btn-quiet" onClick={refresh} disabled={!desktop}>
          <RefreshCw size={13} />
          {t("刷新状态")}
        </button>
      </div>
      <p className="card-desc">
        {t("状态发生变化时，灵动岛会短暂显示对应提示。")}
      </p>
      <div className="settings-list">
        {rows.map(({ icon: Icon, title, description, status, notice }) => (
          <div className="settings-list-row" key={title}>
            <span className="settings-list-icon" aria-hidden="true">
              <Icon size={15} />
            </span>
            <div className="settings-list-copy">
              <strong>{title}</strong>
              <small>{description}</small>
            </div>
            <span className="settings-list-value">{status}</span>
            <button
              className="btn btn-quiet"
              disabled={!desktop}
              onClick={() => void preview(notice)}
            >
              {t("演示")}
            </button>
          </div>
        ))}
      </div>
      <p className="card-hint" role="status">
        {previewMessage || t("演示使用示例数据，不会修改系统设置。")}
      </p>
    </section>
  );
}
