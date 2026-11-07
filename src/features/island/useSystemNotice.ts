import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t } from "../../services/i18n";
import {
  deviceChanges,
  systemChanges,
  type AppNoticeItem,
  type BluetoothStatus,
  type SystemNotice,
  type SystemStatus,
} from "../../domain/systemNotices";

export type DeviceSnapshot = {
  brightness: number | null;
  bluetooth: BluetoothStatus[] | null;
};

/** The notification page shows the latest forwarded toast only, as detail. */
const NOTIFICATION_HISTORY = 1;

export function useSystemNotice({
  notificationSeconds,
}: {
  notificationSeconds: number;
}) {
  const [notice, setNotice] = useState<SystemNotice | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [devices, setDevices] = useState<DeviceSnapshot | null>(null);
  const [notifications, setNotifications] = useState<AppNoticeItem[]>([]);
  const notificationId = useRef(0);
  // The listeners register once, but the duration follows the settings, so
  // the flash timer reads it through a per-render ref.
  const secondsRef = useRef(notificationSeconds);
  useEffect(() => {
    secondsRef.current = notificationSeconds;
  }, [notificationSeconds]);
  function flashDuration(kind: SystemNotice["kind"]) {
    return kind === "notification"
      ? Math.max(1, secondsRef.current) * 1000
      : 3000;
  }
  useEffect(() => {
    let active = true;
    let previous: SystemStatus | undefined;
    let previousBrightness: number | null = null;
    let previousDevices: BluetoothStatus[] | null = null;
    let timeout: number | undefined;
    let deviceTimeout: number | undefined;
    let dismissal: number | undefined;
    let current: SystemNotice | null = null;
    const pending: SystemNotice[] = [];
    function advance() {
      current = pending.shift() ?? null;
      setNotice(current);
      if (current)
        dismissal = window.setTimeout(advance, flashDuration(current.kind));
    }
    function show(next: SystemNotice) {
      if (
        !current ||
        (next.kind === current.kind &&
          (next.kind === "volume" ||
            next.kind === "brightness" ||
            next.kind === "audio" ||
            next.kind === "notification"))
      ) {
        window.clearTimeout(dismissal);
        current = next;
        setNotice(next);
        dismissal = window.setTimeout(advance, flashDuration(next.kind));
      } else {
        if (
          next.kind === "volume" ||
          next.kind === "brightness" ||
          next.kind === "audio" ||
          next.kind === "notification"
        ) {
          const existing = pending.findIndex((item) => item.kind === next.kind);
          if (existing >= 0) pending.splice(existing, 1);
        }
        if (pending.length < 8) pending.push(next);
      }
    }
    let unlisten: (() => void) | undefined;
    void listen<SystemNotice>(
      "system-notice-preview",
      ({ payload }) => {
        if (active) show(payload);
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    // Forwarded desktop toasts arrive as their own transient kind; each one
    // also joins the session history for the notification page.
    void listen<{ app: string; text: string }>(
      "app-notification",
      ({ payload }) => {
        if (!active) return;
        show({
          kind: "notification",
          label: payload.app,
          value: payload.text,
        });
        notificationId.current += 1;
        setNotifications((list) =>
          [
            {
              id: notificationId.current,
              app: payload.app,
              text: payload.text,
              at: Date.now(),
            },
            ...list,
          ].slice(0, NOTIFICATION_HISTORY),
        );
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) unlisten = dispose;
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    async function poll() {
      try {
        const state = await invoke<SystemStatus>("get_system_status");
        if (!active) return;
        setSystem(state);
        systemChanges(previous, state).forEach(show);
        previous = state;
      } catch (error) {
        console.error("Unable to read system status", error);
      } finally {
        if (active) timeout = window.setTimeout(() => void poll(), 1000);
      }
    }
    async function pollDevices() {
      try {
        const state = await invoke<DeviceSnapshot>("get_device_status");
        if (!active) return;
        setDevices(state);
        if (state.brightness !== null) {
          if (
            previousBrightness !== null &&
            state.brightness !== previousBrightness
          )
            show({
              kind: "brightness",
              label: t("亮度"),
              value: `${state.brightness}%`,
            });
          previousBrightness = state.brightness;
        }
        deviceChanges(previousDevices, state.bluetooth).forEach(show);
        if (state.bluetooth !== null) previousDevices = state.bluetooth;
      } catch (error) {
        console.error("Unable to read device status", error);
      } finally {
        if (active)
          deviceTimeout = window.setTimeout(() => void pollDevices(), 3000);
      }
    }
    void poll();
    void pollDevices();
    return () => {
      active = false;
      unlisten?.();
      window.clearTimeout(timeout);
      window.clearTimeout(deviceTimeout);
      window.clearTimeout(dismissal);
    };
  }, []);
  function clearNotifications() {
    setNotifications([]);
  }
  return { notice, system, devices, notifications, clearNotifications };
}
