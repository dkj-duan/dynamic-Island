import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { t } from "../../services/i18n";
import {
  deviceChanges,
  systemChanges,
  notificationSource,
  shouldShowNotificationFlash,
  nextWechatAttention,
  acknowledgeWechatAttention,
  type AppNoticeItem,
  type BluetoothStatus,
  type SystemNotice,
  type SystemStatus,
  type NotificationSource,
  type WechatAttention,
} from "../../domain/systemNotices";

export type DeviceSnapshot = {
  brightness: number | null;
  bluetooth: BluetoothStatus[] | null;
};

/** The notification page shows the latest forwarded toast only, as detail. */
const NOTIFICATION_HISTORY = 1;

export function useSystemNotice({
  notificationSeconds,
  wechatSeconds,
  wechatShowText,
}: {
  notificationSeconds: number;
  wechatSeconds: number;
  wechatShowText: boolean;
}) {
  const [notice, setNotice] = useState<SystemNotice | null>(null);
  const [system, setSystem] = useState<SystemStatus | null>(null);
  const [devices, setDevices] = useState<DeviceSnapshot | null>(null);
  const [notifications, setNotifications] = useState<AppNoticeItem[]>([]);
  const [wechatNotifications, setWechatNotifications] = useState<
    AppNoticeItem[]
  >([]);
  const [previewNotification, setPreviewNotification] =
    useState<AppNoticeItem | null>(null);
  const [wechatAttention, setWechatAttention] = useState<WechatAttention>(null);
  const [wechatArrival, setWechatArrival] = useState(0);
  const notificationId = useRef(0);
  // The listeners register once, but the duration follows the settings, so
  // the flash timer reads it through a per-render ref.
  const secondsRef = useRef(notificationSeconds);
  const wechatSecondsRef = useRef(wechatSeconds);
  const wechatShowTextRef = useRef(wechatShowText);
  useLayoutEffect(() => {
    wechatShowTextRef.current = wechatShowText;
  }, [wechatShowText]);
  useEffect(() => {
    secondsRef.current = notificationSeconds;
  }, [notificationSeconds]);
  useEffect(() => {
    wechatSecondsRef.current = wechatSeconds;
  }, [wechatSeconds]);
  function flashDuration(notice: SystemNotice) {
    return notice.kind === "notification"
      ? Math.max(
          1,
          notice.source === "wechat"
            ? wechatSecondsRef.current
            : secondsRef.current,
        ) * 1000
      : 3000;
  }
  useEffect(() => {
    let active = true;
    let previous: SystemStatus | undefined;
    let previousBrightness: number | null = null;
    let previousDevices: BluetoothStatus[] | null = null;
    let dismissal: number | undefined;
    let reconcile: number | undefined;
    let current: SystemNotice | null = null;
    const pending: SystemNotice[] = [];
    const disposers: Array<() => void> = [];
    function advance() {
      current = pending.shift() ?? null;
      setNotice(current);
      if (current)
        dismissal = window.setTimeout(advance, flashDuration(current));
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
        dismissal = window.setTimeout(advance, flashDuration(next));
      } else {
        if (
          next.kind === "volume" ||
          next.kind === "brightness" ||
          next.kind === "audio" ||
          next.kind === "notification"
        ) {
          const existing = pending.findIndex(
            (item) =>
              item.kind === next.kind &&
              (next.kind !== "notification" || item.source === next.source),
          );
          if (existing >= 0) pending.splice(existing, 1);
        }
        if (pending.length < 8) pending.push(next);
      }
    }
    function showNotification(
      app: string,
      text: string,
      source: NotificationSource,
      preview = false,
    ) {
      notificationId.current += 1;
      const id = notificationId.current;
      if (shouldShowNotificationFlash(source, wechatShowTextRef.current)) {
        show({
          kind: "notification",
          label: app,
          value: text,
          eventId: id,
          source,
        });
      }
      const item = { id, app, text, at: Date.now(), source };
      if (source === "wechat") {
        setWechatArrival(id);
        setWechatAttention((current) =>
          nextWechatAttention(current, { id, preview }),
        );
      }
      if (preview) {
        setPreviewNotification(item);
      } else {
        setPreviewNotification(null);
        if (source !== "wechat") {
          setWechatAttention((current) => (current?.preview ? null : current));
        }
        const update = (list: AppNoticeItem[]) =>
          [item, ...list].slice(0, NOTIFICATION_HISTORY);
        if (source === "wechat") setWechatNotifications(update);
        else setNotifications(update);
      }
    }
    // The Rust side samples in the background and pushes changes as events;
    // these appliers stay shared with the reconciliation reads below so the
    // notice diffs always run against the last state this window saw.
    function applySystem(state: SystemStatus) {
      setSystem(state);
      systemChanges(previous, state).forEach(show);
      previous = state;
    }
    function applyDevices(state: DeviceSnapshot) {
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
    }
    // Seeds the first snapshots and catches anything missed while the
    // webview was suspended or an event was dropped.
    async function refresh() {
      try {
        const state = await invoke<SystemStatus>("get_system_status");
        if (active) applySystem(state);
      } catch (error) {
        console.error("Unable to read system status", error);
      }
      try {
        const state = await invoke<DeviceSnapshot>("get_device_status");
        if (active) applyDevices(state);
      } catch (error) {
        console.error("Unable to read device status", error);
      }
    }
    void listen<SystemNotice>(
      "system-notice-preview",
      ({ payload }) => {
        if (!active) return;
        if (payload.kind === "notification") {
          showNotification(
            payload.label,
            payload.value,
            notificationSource(payload.label, payload.source),
            true,
          );
        } else {
          show(payload);
        }
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) disposers.push(dispose);
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    // Forwarded desktop toasts arrive as their own transient kind; each one
    // also joins the session history for the notification page.
    void listen<{ app: string; text: string; source?: string }>(
      "app-notification",
      ({ payload }) => {
        if (!active) return;
        showNotification(
          payload.app,
          payload.text,
          notificationSource(payload.app, payload.source),
        );
      },
      { target: "island" },
    )
      .then((dispose) => {
        if (active) disposers.push(dispose);
        else dispose();
      })
      .catch((error) =>
        console.error("Unable to listen for notice previews", error),
      );
    // Register the status listeners first: a change pushed between app start
    // and this registration is not replayed, so the initial read below must
    // happen after they are in place to see that change as the baseline.
    void Promise.all([
      listen<SystemStatus>("system-status-changed", ({ payload }) => {
        if (active) applySystem(payload);
      }),
      listen<DeviceSnapshot>("device-status-changed", ({ payload }) => {
        if (active) applyDevices(payload);
      }),
    ])
      .then((registered) => {
        if (!active) {
          registered.forEach((dispose) => dispose());
          return;
        }
        disposers.push(...registered);
        void refresh();
        reconcile = window.setInterval(() => void refresh(), 60_000);
      })
      .catch((error) => console.error("Unable to listen for status", error));
    return () => {
      active = false;
      disposers.forEach((dispose) => dispose());
      window.clearInterval(reconcile);
      window.clearTimeout(dismissal);
    };
  }, []);
  function clearNotifications() {
    setNotifications([]);
    setPreviewNotification((current) =>
      current?.source === "system" ? null : current,
    );
  }
  function clearWechatNotifications() {
    setWechatNotifications([]);
    setPreviewNotification((current) =>
      current?.source === "wechat" ? null : current,
    );
    setWechatAttention((current) =>
      acknowledgeWechatAttention(current, wechatAttention?.id ?? null),
    );
  }
  function acknowledgeWechat(id: number | null) {
    setWechatAttention((current) => acknowledgeWechatAttention(current, id));
  }
  const visibleNotifications =
    notice?.kind === "notification" &&
    previewNotification !== null &&
    previewNotification.id === notice.eventId &&
    previewNotification.source === "system"
      ? [previewNotification]
      : notifications;
  const visibleWechatNotifications =
    previewNotification !== null &&
    previewNotification.source === "wechat" &&
    ((notice?.kind === "notification" &&
      previewNotification.id === notice.eventId) ||
      wechatAttention?.id === previewNotification.id ||
      wechatAttention === null ||
      wechatNotifications.length === 0)
      ? [previewNotification]
      : wechatNotifications;
  return {
    notice,
    system,
    devices,
    notifications: visibleNotifications,
    wechatNotifications: visibleWechatNotifications,
    wechatAttention,
    wechatArrival,
    acknowledgeWechat,
    clearNotifications,
    clearWechatNotifications,
  };
}
