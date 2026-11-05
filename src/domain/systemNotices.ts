import { t } from "../services/i18n";

export type SystemStatus = {
  volume: number | null;
  muted: boolean | null;
  onAc: boolean | null;
  battery: number | null;
  charging: boolean | null;
  outputDevice: AudioDevice | null;
};
export type AudioDevice = {
  id: string;
  name: string;
  isDefault: boolean;
};
export type BluetoothStatus = {
  id: string;
  name: string;
  battery: number | null;
};
export type SystemNotice = {
  kind: "volume" | "power" | "brightness" | "bluetooth" | "audio";
  label: string;
  value: string;
};

export function systemChanges(
  previous: SystemStatus | undefined,
  current: SystemStatus,
): SystemNotice[] {
  if (!previous) return [];
  const notices: SystemNotice[] = [];
  // Switching outputs changes the reported volume too; announce the device
  // instead of a misleading volume change.
  const deviceChanged =
    !!current.outputDevice &&
    !!previous.outputDevice &&
    current.outputDevice.id !== previous.outputDevice.id;
  if (
    !deviceChanged &&
    current.volume !== null &&
    previous.volume !== null &&
    (current.volume !== previous.volume ||
      (current.muted !== null &&
        previous.muted !== null &&
        current.muted !== previous.muted))
  ) {
    notices.push({
      kind: "volume",
      label: current.muted ? t("静音") : t("音量"),
      value: current.muted ? "" : `${current.volume}%`,
    });
  }
  if (
    current.battery !== null &&
    current.onAc !== null &&
    previous.onAc !== null &&
    current.onAc !== previous.onAc
  ) {
    notices.push({
      kind: "power",
      label: current.onAc
        ? current.charging
          ? t("充电中")
          : t("已接通电源")
        : t("电源已断开"),
      value: `${current.battery}%`,
    });
  }
  if (deviceChanged && current.outputDevice) {
    notices.push({
      kind: "audio",
      label: t("输出设备"),
      value: current.outputDevice.name,
    });
  }
  return notices;
}

export function deviceChanges(
  previous: BluetoothStatus[] | null,
  current: BluetoothStatus[] | null,
): SystemNotice[] {
  if (!previous || !current) return [];
  return [
    ...current
      .filter((device) => !previous.some((old) => old.id === device.id))
      .map((device) => ({
        kind: "bluetooth" as const,
        label: device.name,
        value:
          device.battery === null
            ? t("已连接")
            : `${t("已连接 · ")}${device.battery}%`,
      })),
    ...previous
      .filter((device) => !current.some((item) => item.id === device.id))
      .map((device) => ({
        kind: "bluetooth" as const,
        label: device.name,
        value: t("已断开"),
      })),
  ];
}
