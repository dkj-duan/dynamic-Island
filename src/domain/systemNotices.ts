import { t } from "../services/i18n";
import type { AppearanceSettings } from "./settings";

export type SystemStatus = {
  volume: number | null;
  muted: boolean | null;
  onAc: boolean | null;
  battery: number | null;
  charging: boolean | null;
  outputDevice: AudioDevice | null;
  inputDevice: AudioDevice | null;
};
export type AudioDirection = "output" | "input";
export type AudioDevice = {
  id: string;
  name: string;
  isDefault: boolean;
  direction: AudioDirection;
};
export type BluetoothStatus = {
  id: string;
  name: string;
  battery: number | null;
};
export type SystemNotice = {
  kind:
    "volume" | "power" | "brightness" | "bluetooth" | "audio" | "notification";
  label: string;
  value: string;
  /** Local sequence for separate forwarded notifications, even with identical text. */
  eventId?: number;
  source?: NotificationSource;
};

export type NotificationSource = "wechat" | "qq" | "system";

/** Hidden message content is signalled only by its attention badge. */
export function shouldShowNotificationFlash(
  source: NotificationSource | undefined,
  showText: boolean,
): boolean {
  return source === "system" || source === undefined || showText;
}

/** Keep message sources independent, including forwarded chat notifications. */
export function notificationDisplayPolicy(
  source: NotificationSource | undefined,
  appearance: AppearanceSettings,
) {
  if (source && source !== "system") {
    const perSource = appearance.notificationSources[source];
    if (perSource) {
      return {
        expand: perSource.expand,
        showText: perSource.showText,
        seconds: perSource.seconds,
      };
    }
  }
  return {
    expand: appearance.noticeExpand,
    showText: appearance.noticeShowText,
    seconds: appearance.noticeDisplaySeconds,
  };
}

/** An island reminder, not WeChat's authoritative unread state. */
export type MessageAttention = { id: number; preview: boolean } | null;

export function nextMessageAttention(
  current: MessageAttention,
  incoming: NonNullable<MessageAttention>,
): MessageAttention {
  return incoming.preview && current && !current.preview ? current : incoming;
}

export function acknowledgeMessageAttention(
  current: MessageAttention,
  seenId: number | null,
): MessageAttention {
  return current?.id === seenId ? null : current;
}

/** One forwarded toast, kept for the island's notification page. */
export type AppNoticeItem = {
  id: number;
  app: string;
  text: string;
  at: number;
  source: NotificationSource;
};

/** A chat app's Windows toast and its local session watcher share one destination. */
export function notificationSource(
  app: string,
  source?: string,
): NotificationSource {
  const name = app.trim().toLowerCase();
  if (source === "wechat" || source === "qq") {
    return source;
  }
  if (name === "微信" || name === "wechat") {
    return "wechat";
  }
  if (name === "qq" || name === "tencent qq") {
    return "qq";
  }
  return "system";
}

/** Avoid exposing either the contact or message when previews are hidden. */
export function messageView(text: string, showText: boolean) {
  if (!showText) return { sender: "", text: null };
  const separator = text.indexOf("：");
  return separator > 0
    ? { sender: text.slice(0, separator), text: text.slice(separator + 1) }
    : { sender: "", text };
}

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
  const inputChanged =
    !!current.inputDevice &&
    !!previous.inputDevice &&
    current.inputDevice.id !== previous.inputDevice.id;
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
  if (inputChanged && current.inputDevice) {
    notices.push({
      kind: "audio",
      label: t("输入设备"),
      value: current.inputDevice.name,
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
